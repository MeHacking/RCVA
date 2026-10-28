package rs.rcva.imports;

import java.io.InputStream;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import rs.rcva.api.ApiException;
import rs.rcva.data.InMemoryStore;
import rs.rcva.domain.Model.GeocodeStatus;
import rs.rcva.domain.Model.ImportCommitResult;
import rs.rcva.domain.Model.ImportCreated;
import rs.rcva.domain.Model.ImportMapping;
import rs.rcva.domain.Model.ImportPreview;
import rs.rcva.domain.Model.ImportRow;
import rs.rcva.domain.Model.ImportRowPatch;
import rs.rcva.domain.Model.ImportSheetInfo;
import rs.rcva.domain.Model.Location;
import rs.rcva.domain.Model.PlaceGuess;
import rs.rcva.domain.Model.Shipment;
import rs.rcva.imports.Gazetteer.Coordinates;
import rs.rcva.imports.ImportRows.RowState;
import rs.rcva.imports.WorkbookReader.Sheet;

/**
 * Excel import in four steps (dopuna 1, section 4): upload, column mapping, preview with
 * corrections, commit. Uploads are kept in memory; committed rows become shipments and
 * locations in the store. Port of frontend/src/api/mock/import/importStore.ts, with the
 * same messages.
 */
@Service
public class ImportService {

    static final Set<String> FIELDS = Set.of(
            "externalId", "relation", "pickup", "delivery", "deliveryPostalCode", "ldm", "weight", "description");

    private static final int PREVIEW_ROWS = 6;
    private static final Pattern XLSX = Pattern.compile("(?i)\\.xlsx\\z");
    private static final Pattern NOT_LETTER_OR_DIGIT = Pattern.compile("[^\\p{L}\\p{N}]+");

    private final InMemoryStore store;
    private final WorkbookReader reader;
    private final Map<Long, ImportRecord> imports = new HashMap<>();
    private long nextImportId = 1;

    private static final class ImportRecord {
        final String fileName;
        final String idPrefix;
        final List<Sheet> sheets;
        List<RowState> rows;
        boolean committed;

        ImportRecord(String fileName, String idPrefix, List<Sheet> sheets) {
            this.fileName = fileName;
            this.idPrefix = idPrefix;
            this.sheets = sheets;
        }
    }

    public ImportService(InMemoryStore store, WorkbookReader reader) {
        this.store = store;
        this.reader = reader;
    }

    /** 415 for a non-.xlsx file name, 400 when the content cannot be read. */
    public synchronized ImportCreated create(String fileName, InputStream content) {
        String name = fileName == null ? "" : fileName;
        if (!XLSX.matcher(name).find()) {
            throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Nepodržan tip fajla", "Podržani su samo .xlsx fajlovi.");
        }
        List<Sheet> sheets;
        try {
            sheets = List.copyOf(reader.read(content));
        } catch (Exception e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Fajl nije pročitan",
                    "„" + name + "“ nije moguće pročitati kao Excel (.xlsx) fajl.");
        }
        long importId = nextImportId++;
        imports.put(importId, new ImportRecord(name, idPrefix(name), sheets));
        return new ImportCreated(importId, name, sheets.stream()
                .map(s -> new ImportSheetInfo(s.name(), s.rows().size(), s.rows().subList(0, Math.min(PREVIEW_ROWS, s.rows().size()))))
                .toList());
    }

    /** Re-reads all rows, discarding earlier corrections. */
    public synchronized void setMapping(long importId, ImportMapping mapping) {
        ImportRecord record = find(importId);
        if (mapping == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Neispravno mapiranje kolona", "Telo zahteva nedostaje.");
        }
        Sheet sheet = record.sheets.stream().filter(s -> s.name().equals(mapping.sheetName())).findFirst().orElse(null);
        if (sheet == null) {
            throw invalidMapping(Map.of("sheetName", "List ne postoji."));
        }
        Map<String, String> errors = mappingErrors(mapping, sheet.rows());
        if (!errors.isEmpty()) {
            throw invalidMapping(errors);
        }
        record.rows = ImportRows.readRows(sheet.rows(), mapping, record.idPrefix);
        record.committed = false;
    }

    public synchronized ImportPreview preview(long importId) {
        ImportRecord record = find(importId);
        return new ImportPreview(importId, record.fileName, ImportRows.toImportRows(mappedRows(record), existingIds()));
    }

    public synchronized ImportRow updateRow(long importId, int rowNumber, ImportRowPatch patch) {
        ImportRecord record = find(importId);
        List<RowState> rows = mappedRows(record);
        int index = indexOf(rows, rowNumber);
        if (index < 0) {
            throw ApiException.notFound("Red " + rowNumber + " ne postoji.");
        }
        if (patch == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Neispravan red", "Telo zahteva nedostaje.");
        }
        Double ldm = patch.ldmTenths();
        if (ldm != null && (ldm % 1 != 0 || ldm <= 0 || ldm > Integer.MAX_VALUE)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Neispravan red", null,
                    Map.of("ldmTenths", "LDM mora biti veći od 0."));
        }
        rows.set(index, ImportRows.applyPatch(rows.get(index), patch));
        return ImportRows.toImportRows(rows, existingIds()).get(index);
    }

    public synchronized ImportCommitResult commit(long importId) {
        ImportRecord record = find(importId);
        if (record.committed) {
            throw new ApiException(HttpStatus.CONFLICT, "Uvoz je već potvrđen", "Uvoz " + importId + " je već upisan.");
        }
        List<RowState> rows = mappedRows(record);
        List<ImportRow> views = ImportRows.toImportRows(rows, existingIds());
        int created = 0;
        for (int i = 0; i < views.size(); i++) {
            ImportRow view = views.get(i);
            if (view.excluded() || !view.errors().isEmpty() || view.pickup() == null || view.delivery() == null
                    || view.ldmTenths() == null) {
                continue;
            }
            boolean corrected = rows.get(i).corrected();
            long pickupId = findOrCreateLocation(view.pickup(), corrected);
            long deliveryId = findOrCreateLocation(view.delivery(), corrected);
            store.addShipment(id -> new Shipment(id, view.externalId(), view.description(), view.ldmTenths(),
                    pickupId, deliveryId, false, view.weightKg(), null, null, null));
            created++;
        }
        record.committed = true;
        return new ImportCommitResult(created, views.size() - created);
    }

    /** field -> message; empty when the mapping can be used (dopuna 1, section 4.3) */
    static Map<String, String> mappingErrors(ImportMapping mapping, List<List<String>> sheetRows) {
        Map<String, String> errors = new LinkedHashMap<>();
        Map<String, Integer> columns = mapping.columns() == null ? Map.of() : mapping.columns();
        Integer headerRow = mapping.headerRow();
        if (headerRow == null || headerRow < 1 || headerRow >= sheetRows.size()) {
            errors.put("headerRow", "Red sa nazivima kolona mora postojati i ispod njega mora biti bar jedan red podataka.");
        }
        if (!columns.containsKey("ldm")) {
            errors.put("ldm", "Kolona sa LDM je obavezna.");
        }
        boolean separate = columns.containsKey("pickup") || columns.containsKey("delivery");
        if (columns.containsKey("relation") && separate) {
            errors.put("relation", "Izaberite ili kolonu Relacija ili kolone Preuzimanje i Isporuka, ne oboje.");
        } else if (!columns.containsKey("relation") && !(columns.containsKey("pickup") && columns.containsKey("delivery"))) {
            errors.put("relation", "Potrebna je kolona Relacija ili obe kolone Preuzimanje i Isporuka.");
        }
        // Server-side only: the frontend's types already rule these out.
        Set<String> unknown = columns.keySet().stream().filter(f -> !FIELDS.contains(f)).collect(Collectors.toSet());
        if (!unknown.isEmpty() || columns.values().stream().anyMatch(c -> c == null || c < 0)) {
            errors.put("columns", "Nepoznato polje ili neispravan broj kolone.");
        } else if (new HashSet<>(columns.values()).size() != columns.size()) {
            errors.put("columns", "Ista kolona je izabrana za više polja.");
        }
        return errors;
    }

    private ImportRecord find(long importId) {
        ImportRecord record = imports.get(importId);
        if (record == null) {
            throw ApiException.notFound("Uvoz " + importId + " ne postoji.");
        }
        return record;
    }

    private static List<RowState> mappedRows(ImportRecord record) {
        if (record.rows == null) {
            throw new ApiException(HttpStatus.CONFLICT, "Mapiranje nije zadato", "Prvo zadajte mapiranje kolona.");
        }
        return record.rows;
    }

    private Set<String> existingIds() {
        return store.shipments().stream().map(Shipment::externalId).collect(Collectors.toSet());
    }

    private long findOrCreateLocation(PlaceGuess place, boolean corrected) {
        String key = Gazetteer.normalizePlaceName(place.name());
        return store.locations().stream()
                .filter(l -> Gazetteer.normalizePlaceName(l.name()).equals(key)
                        && Objects.equals(l.postalCode(), place.postalCode()))
                .findFirst()
                .map(Location::id)
                .orElseGet(() -> {
                    Coordinates coordinates = Gazetteer.geocode(place.name()).orElse(null);
                    GeocodeStatus status = coordinates == null ? GeocodeStatus.FAILED
                            : corrected ? GeocodeStatus.MANUAL : GeocodeStatus.OK;
                    return store.addLocation(id -> new Location(id, place.name(), null, place.country(),
                            place.postalCode(), coordinates == null ? null : coordinates.lat(),
                            coordinates == null ? null : coordinates.lon(), status)).id();
                });
    }

    private static int indexOf(List<RowState> rows, int rowNumber) {
        for (int i = 0; i < rows.size(); i++) {
            if (rows.get(i).rowNumber() == rowNumber) {
                return i;
            }
        }
        return -1;
    }

    private static ApiException invalidMapping(Map<String, String> errors) {
        return new ApiException(HttpStatus.BAD_REQUEST, "Neispravno mapiranje kolona", null, errors);
    }

    /** "Relacije oktobar.xlsx" -> "Relacije-oktobar" (prefix of generated shipment IDs) */
    static String idPrefix(String fileName) {
        String prefix = NOT_LETTER_OR_DIGIT.matcher(XLSX.matcher(fileName).replaceAll("")).replaceAll("-")
                .replaceAll("^-|-$", "");
        return prefix.isEmpty() ? "uvoz" : prefix;
    }
}
