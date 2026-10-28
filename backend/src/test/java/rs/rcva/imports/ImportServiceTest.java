package rs.rcva.imports;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import rs.rcva.api.ApiException;
import rs.rcva.data.InMemoryStore;
import rs.rcva.domain.Model.GeocodeStatus;
import rs.rcva.domain.Model.ImportMapping;
import rs.rcva.domain.Model.ImportRow;
import rs.rcva.domain.Model.ImportRowPatch;
import rs.rcva.domain.Model.ImportSheetInfo;
import rs.rcva.domain.Model.Location;
import rs.rcva.domain.Model.PlaceGuess;
import rs.rcva.domain.Model.Shipment;
import rs.rcva.imports.WorkbookReader.Sheet;

/**
 * Same cases as frontend/tests/unit/mockImport.test.ts, against the service instead of the
 * mock client. Invented workbook with the shapes of the real file: RELACIJA | TEŽINA | DIMENZIJE.
 */
class ImportServiceTest {

    private static final List<List<String>> SHEET = List.of(
            List.of("RELACIJA", "TEŽINA", "DIMENZIJE"),
            List.of("BEOGRAD 34131 - LJUNGBY", "1,200 kg", "2,4m"), // row 2: fine, both places geocodable
            List.of("NIS / RS / - / SE / 55555 VAXJO", "5,3t", "3.6m"), // row 3: fine, Vaxjo not geocodable
            List.of("ZAJECAR 11111-YSTAD, 22222 LUND", "500 kg", "1m"), // row 4: several destinations
            List.of("12345 SODERTALJE", "2,300 kg", "3,2m"), // row 5: no pickup
            List.of("", "", ""), // empty row: skipped
            List.of("KRAGUJEVAC - LANDSKRONA 26100", "1,5 kg", "abc")); // row 7: bad LDM, weight warning

    private static final ImportMapping MAPPING =
            new ImportMapping("Sheet1", 1, Map.of("relation", 0, "weight", 1, "ldm", 2));

    private static final String FILE = "Relacije oktobar.xlsx";

    private final InMemoryStore store = new InMemoryStore();

    private ImportService setup(List<List<String>> sheet) {
        return new ImportService(store, content -> List.of(new Sheet("Sheet1", sheet)));
    }

    private static InputStream fake() {
        return new ByteArrayInputStream(new byte[] {1});
    }

    private static ApiException rejection(Executable call) {
        ApiException[] caught = new ApiException[1];
        assertThatThrownBy(call::execute).isInstanceOfSatisfying(ApiException.class, e -> caught[0] = e);
        return caught[0];
    }

    private static PlaceGuess place(String name, String postalCode, String country) {
        return new PlaceGuess(name, postalCode, country);
    }

    @Test
    void uploadsAFileAndReturnsSheetsWithPreviewRows() {
        var created = setup(SHEET).create(FILE, fake());
        assertThat(created.importId()).isEqualTo(1);
        assertThat(created.fileName()).isEqualTo(FILE);
        assertThat(created.sheets()).containsExactly(new ImportSheetInfo("Sheet1", 7, SHEET.subList(0, 6)));
    }

    @Test
    void rejectsANonXlsxFileWith415AndAnUnreadableOneWith400() {
        assertThat(rejection(() -> setup(SHEET).create("posiljke.csv", fake())).status().value()).isEqualTo(415);
        var broken = new ImportService(store, content -> {
            throw new IOException("not a zip");
        });
        ApiException error = rejection(() -> broken.create(FILE, fake()));
        assertThat(error.status().value()).isEqualTo(400);
        assertThat(error.detail()).isEqualTo("„Relacije oktobar.xlsx“ nije moguće pročitati kao Excel (.xlsx) fajl.");
    }

    @Test
    void validatesTheMapping() {
        var service = setup(SHEET);
        long importId = service.create(FILE, fake()).importId();
        ApiException error = rejection(() -> service.setMapping(importId,
                new ImportMapping("Sheet1", 1, Map.of("relation", 0, "pickup", 1, "weight", 1))));
        assertThat(error.status().value()).isEqualTo(400);
        assertThat(error.errors()).containsOnlyKeys("columns", "ldm", "relation");
        assertThat(rejection(() -> service.preview(importId)).status().value()).isEqualTo(409);
    }

    /** Server-side only: the frontend's types rule these out, an HTTP client might not. */
    @Test
    void rejectsAMissingSheetAndUnknownFields() {
        var service = setup(SHEET);
        long importId = service.create(FILE, fake()).importId();
        assertThat(rejection(() -> service.setMapping(importId, new ImportMapping("List2", 1, MAPPING.columns())))
                .errors()).containsOnlyKeys("sheetName");
        assertThat(rejection(() -> service.setMapping(importId,
                new ImportMapping("Sheet1", 1, Map.of("relation", 0, "ldm", 2, "boja", 1)))).errors())
                .containsOnlyKeys("columns");
        assertThat(rejection(() -> service.setMapping(importId, new ImportMapping("Sheet1", 7, MAPPING.columns())))
                .errors()).containsOnlyKeys("headerRow");
        assertThat(rejection(() -> service.preview(99)).status().value()).isEqualTo(404);
    }

    @Test
    void previewsParsedRowsWithErrorsAndWarnings() {
        var service = setup(SHEET);
        long importId = service.create(FILE, fake()).importId();
        service.setMapping(importId, MAPPING);
        List<ImportRow> rows = service.preview(importId).rows();

        assertThat(rows).extracting(ImportRow::rowNumber).containsExactly(2, 3, 4, 5, 7);
        assertThat(rows.get(0)).isEqualTo(new ImportRow(2, "BEOGRAD 34131 - LJUNGBY", "Relacije-oktobar-2",
                place("Beograd", null, null), place("Ljungby", "34131", null), 24, 1200.0, null,
                List.of(), List.of(), false, false));
        assertThat(rows.get(1)).satisfies(r -> {
            assertThat(r.weightKg()).isEqualTo(5300);
            assertThat(r.ldmTenths()).isEqualTo(36);
            assertThat(r.errors()).isEmpty();
            assertThat(r.warnings()).singleElement().asString().contains("„Vaxjo“ nije pronađeno");
        });
        assertThat(rows.get(2).errors()).singleElement().asString().contains("Više odredišta");
        assertThat(rows.get(3).errors()).containsExactly("Nedostaje mesto preuzimanja.");
        assertThat(rows.get(4).errors()).containsExactly("LDM „abc“ nije prepoznat (primer: 2,4 ili 2,4m).");
        assertThat(rows.get(4).warnings()).singleElement().asString().contains("ne liči na hiljade");
    }

    @Test
    void correctsAndExcludesRowsThenCommitsOnlyValidOnes() {
        var service = setup(SHEET);
        long importId = service.create(FILE, fake()).importId();
        service.setMapping(importId, MAPPING);

        ImportRow fixed = service.updateRow(importId, 5,
                new ImportRowPatch(null, place("Subotica", null, "RS"), null, null, null));
        assertThat(fixed.corrected()).isTrue();
        assertThat(fixed.errors()).isEmpty();
        assertThat(service.updateRow(importId, 7, new ImportRowPatch(null, null, null, 20.0, null)).errors()).isEmpty();
        ImportRow excluded = service.updateRow(importId, 4, new ImportRowPatch(null, null, null, null, true));
        assertThat(excluded.excluded()).isTrue();
        assertThat(excluded.corrected()).isFalse();

        assertThat(service.commit(importId)).satisfies(r -> {
            assertThat(r.created()).isEqualTo(4);
            assertThat(r.skipped()).isEqualTo(1);
        });
        assertThat(rejection(() -> service.commit(importId)).status().value()).isEqualTo(409);

        List<Shipment> shipments = store.shipments();
        List<Location> locations = store.locations();
        assertThat(shipments).hasSize(5 + 4);
        Shipment imported = shipments.stream().filter(s -> s.externalId().equals("Relacije-oktobar-5")).findFirst().orElseThrow();
        Location pickup = locations.stream().filter(l -> l.id() == imported.pickupLocationId()).findFirst().orElseThrow();
        assertThat(pickup.name()).isEqualTo("Subotica");
        assertThat(pickup.country()).isEqualTo("RS");
        assertThat(pickup.geocodeStatus()).isEqualTo(GeocodeStatus.MANUAL);
        Location vaxjo = locations.stream().filter(l -> l.name().equals("Vaxjo")).findFirst().orElseThrow();
        assertThat(vaxjo.postalCode()).isEqualTo("55555");
        assertThat(vaxjo.geocodeStatus()).isEqualTo(GeocodeStatus.FAILED);
        assertThat(vaxjo.lat()).isNull();
    }

    @Test
    void rejectsAnLdmCorrectionThatIsNotAWholeNumberAboveZero() {
        var service = setup(SHEET);
        long importId = service.create(FILE, fake()).importId();
        service.setMapping(importId, MAPPING);
        for (double ldm : new double[] {0, -3, 2.5}) {
            assertThat(rejection(() -> service.updateRow(importId, 7, new ImportRowPatch(null, null, null, ldm, null)))
                    .errors()).containsEntry("ldmTenths", "LDM mora biti veći od 0.");
        }
        assertThat(rejection(() -> service.updateRow(importId, 6, new ImportRowPatch(null, null, null, 10.0, null)))
                .status().value()).isEqualTo(404);
    }

    @Test
    void flagsDuplicateIdsWithinTheFileAndAgainstExistingShipments() {
        var service = setup(List.of(
                List.of("ID", "RELACIJA", "LDM"),
                List.of("A-1", "BEOGRAD - LJUNGBY", "1"),
                List.of("A-1", "BEOGRAD - MALMO", "2"),
                List.of("S-101", "NIS - LUND 22222", "3")));
        long importId = service.create(FILE, fake()).importId();
        service.setMapping(importId, new ImportMapping("Sheet1", 1, Map.of("externalId", 0, "relation", 1, "ldm", 2)));
        List<ImportRow> rows = service.preview(importId).rows();
        assertThat(rows.get(0).errors()).containsExactly("ID „A-1“ se ponavlja u redovima 2, 3.");
        assertThat(rows.get(1).errors()).containsExactly("ID „A-1“ se ponavlja u redovima 2, 3.");
        assertThat(rows.get(2).errors()).containsExactly("ID „S-101“ već postoji među pošiljkama.");

        // Renaming one duplicate clears the error on both rows.
        service.updateRow(importId, 3, new ImportRowPatch("A-2", null, null, null, null));
        List<ImportRow> after = service.preview(importId).rows();
        assertThat(after.get(0).errors()).isEmpty();
        assertThat(after.get(1).errors()).isEmpty();
    }

    @Test
    void readsSeparatePickupDeliveryAndPostalCodeColumns() {
        var service = setup(List.of(
                List.of("Preuzimanje", "Isporuka", "PB", "LDM"),
                List.of("Beograd", "Malmo", "21145", "2,4")));
        long importId = service.create(FILE, fake()).importId();
        service.setMapping(importId, new ImportMapping("Sheet1", 1,
                Map.of("pickup", 0, "delivery", 1, "deliveryPostalCode", 2, "ldm", 3)));
        ImportRow row = service.preview(importId).rows().getFirst();
        assertThat(row.pickup().name()).isEqualTo("Beograd");
        assertThat(row.delivery()).isEqualTo(place("Malmo", "21145", null));
        assertThat(row.ldmTenths()).isEqualTo(24);
        assertThat(row.errors()).isEmpty();
    }
}
