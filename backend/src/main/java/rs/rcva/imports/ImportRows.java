package rs.rcva.imports;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import rs.rcva.domain.Model.ImportMapping;
import rs.rcva.domain.Model.ImportRow;
import rs.rcva.domain.Model.ImportRowPatch;
import rs.rcva.domain.Model.PlaceGuess;
import rs.rcva.imports.QuantityParser.ParsedWeight;
import rs.rcva.imports.RelationParser.RelationParse;

/**
 * Reading, validating and correcting rows (dopuna 1, sections 4.4 and 4.5).
 * Port of frontend/src/api/mock/import/importRows.ts.
 */
final class ImportRows {

    /**
     * Server-side state of one row: parsed values plus what validation needs to recompute.
     * {@code ldmRaw} is the LDM cell as written, for the error message; {@code placeIssues}
     * are problems found in the relation text, cleared when places are corrected by hand.
     */
    record RowState(
            int rowNumber,
            String sourceText,
            String externalId,
            PlaceGuess pickup,
            PlaceGuess delivery,
            Integer ldmTenths,
            String ldmRaw,
            Double weightKg,
            String weightWarning,
            String description,
            List<String> placeIssues,
            boolean excluded,
            boolean corrected) {
    }

    private ImportRows() {
    }

    /** Reads data rows below the header row. Fully empty rows are skipped. */
    static List<RowState> readRows(List<List<String>> sheetRows, ImportMapping mapping, String idPrefix) {
        List<RowState> result = new ArrayList<>();
        for (int index = 0; index < sheetRows.size(); index++) {
            List<String> cells = sheetRows.get(index);
            int rowNumber = index + 1;
            if (rowNumber <= mapping.headerRow() || cells.stream().allMatch(c -> Text.trim(c).isEmpty())) {
                continue;
            }
            Cells row = new Cells(cells, mapping.columns());

            PlaceGuess pickup;
            PlaceGuess delivery;
            List<String> placeIssues = List.of();
            String sourceText;
            String postalCell = emptyToNull(row.get("deliveryPostalCode"));
            String relation = row.get("relation");
            if (relation != null) {
                RelationParse parsed = RelationParser.parseRelation(relation);
                pickup = parsed.pickup();
                delivery = parsed.delivery();
                if (delivery != null && postalCell != null && delivery.postalCode() == null) {
                    delivery = new PlaceGuess(delivery.name(), postalCell, delivery.country());
                }
                placeIssues = parsed.issues();
                sourceText = relation;
            } else {
                String pickupText = orEmpty(row.get("pickup"));
                String deliveryText = orEmpty(row.get("delivery"));
                pickup = RelationParser.parsePlace(pickupText, null);
                delivery = RelationParser.parsePlace(deliveryText, postalCell);
                sourceText = pickupText + " → " + deliveryText;
            }

            String ldmRaw = orEmpty(row.get("ldm"));
            ParsedWeight weight = QuantityParser.parseWeight(orEmpty(row.get("weight")));
            String externalId = emptyToNull(row.get("externalId"));
            result.add(new RowState(
                    rowNumber,
                    sourceText,
                    externalId != null ? externalId : idPrefix + "-" + rowNumber,
                    pickup,
                    delivery,
                    QuantityParser.parseLdmCell(ldmRaw),
                    ldmRaw,
                    weight.kg(),
                    weight.warning(),
                    emptyToNull(row.get("description")),
                    placeIssues,
                    false,
                    false));
        }
        return result;
    }

    /** Validates all rows together, since duplicate IDs depend on the other rows. */
    static List<ImportRow> toImportRows(List<RowState> rows, Set<String> existingIds) {
        Map<String, List<Integer>> rowsById = new LinkedHashMap<>();
        for (RowState row : rows) {
            if (!row.excluded()) {
                rowsById.computeIfAbsent(row.externalId(), id -> new ArrayList<>()).add(row.rowNumber());
            }
        }

        return rows.stream().map(row -> {
            List<String> errors = new ArrayList<>(row.placeIssues());
            List<String> warnings = new ArrayList<>();

            if (isBlank(row.pickup())) {
                errors.add("Nedostaje mesto preuzimanja.");
            }
            if (isBlank(row.delivery())) {
                errors.add("Nedostaje mesto isporuke.");
            }
            if (row.ldmTenths() == null) {
                errors.add(row.ldmRaw().isEmpty()
                        ? "Nedostaje LDM."
                        : "LDM „" + row.ldmRaw() + "“ nije prepoznat (primer: 2,4 ili 2,4m).");
            } else if (row.ldmTenths() <= 0) {
                errors.add("LDM mora biti veći od 0.");
            }

            List<Integer> sameId = rowsById.getOrDefault(row.externalId(), List.of());
            if (!row.excluded() && sameId.size() > 1) {
                errors.add("ID „" + row.externalId() + "“ se ponavlja u redovima "
                        + sameId.stream().map(String::valueOf).collect(Collectors.joining(", ")) + ".");
            }
            if (existingIds.contains(row.externalId())) {
                errors.add("ID „" + row.externalId() + "“ već postoji među pošiljkama.");
            }

            if (row.weightWarning() != null) {
                warnings.add(row.weightWarning());
            }
            for (PlaceGuess place : new PlaceGuess[] {row.pickup(), row.delivery()}) {
                if (!isBlank(place) && Gazetteer.geocode(place.name()).isEmpty()) {
                    warnings.add("„" + place.name() + "“ nije pronađeno pri probnom geokodiranju; "
                            + "pošiljka će imati status „Nejasna lokacija“.");
                }
            }

            return new ImportRow(row.rowNumber(), row.sourceText(), row.externalId(), row.pickup(), row.delivery(),
                    row.ldmTenths(), row.weightKg(), row.description(), List.copyOf(errors), List.copyOf(warnings),
                    row.excluded(), row.corrected());
        }).toList();
    }

    /** Expects {@code patch.ldmTenths()}, if sent, to be a whole number > 0 (checked by the caller). */
    static RowState applyPatch(RowState row, ImportRowPatch patch) {
        boolean excluded = patch.excluded() != null ? patch.excluded() : row.excluded();
        boolean edits = patch.externalId() != null || patch.pickup() != null || patch.delivery() != null
                || patch.ldmTenths() != null;
        if (!edits) {
            return new RowState(row.rowNumber(), row.sourceText(), row.externalId(), row.pickup(), row.delivery(),
                    row.ldmTenths(), row.ldmRaw(), row.weightKg(), row.weightWarning(), row.description(),
                    row.placeIssues(), excluded, row.corrected());
        }

        // The relation text no longer decides the places, so its problems no longer apply.
        boolean placesEdited = patch.pickup() != null || patch.delivery() != null;
        Integer ldmTenths = patch.ldmTenths() != null ? Integer.valueOf(patch.ldmTenths().intValue()) : row.ldmTenths();
        return new RowState(
                row.rowNumber(),
                row.sourceText(),
                patch.externalId() != null ? Text.trim(patch.externalId()) : row.externalId(),
                patch.pickup() != null ? cleanPlace(patch.pickup()) : row.pickup(),
                patch.delivery() != null ? cleanPlace(patch.delivery()) : row.delivery(),
                ldmTenths,
                patch.ldmTenths() != null ? String.valueOf(ldmTenths) : row.ldmRaw(),
                row.weightKg(),
                row.weightWarning(),
                row.description(),
                placesEdited ? List.of() : row.placeIssues(),
                excluded,
                true);
    }

    private static PlaceGuess cleanPlace(PlaceGuess place) {
        String name = Text.trim(orEmpty(place.name()));
        if (name.isEmpty()) {
            return null;
        }
        String country = emptyToNull(place.country() == null ? null : Text.trim(place.country()));
        return new PlaceGuess(
                name,
                emptyToNull(place.postalCode() == null ? null : Text.trim(place.postalCode())),
                country == null ? null : country.toUpperCase(Locale.ROOT));
    }

    private static boolean isBlank(PlaceGuess place) {
        return place == null || place.name() == null || place.name().isEmpty();
    }

    private static String orEmpty(String text) {
        return text == null ? "" : text;
    }

    private static String emptyToNull(String text) {
        return text == null || text.isEmpty() ? null : text;
    }

    /** The mapped cells of one row; null when the field has no column, "" when the cell is empty. */
    private record Cells(List<String> cells, Map<String, Integer> columns) {

        String get(String field) {
            Integer column = columns.get(field);
            if (column == null) {
                return null;
            }
            return column < cells.size() ? Text.trim(cells.get(column)) : "";
        }
    }
}
