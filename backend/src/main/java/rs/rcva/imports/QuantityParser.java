package rs.rcva.imports;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Weight and LDM cells as written in the Excel file: "4,200 kg", "5,3t", "500kg", "2,4m",
 * "3.6m" (dopuna 1, section 4.6). Port of frontend/src/api/mock/import/parseQuantities.ts.
 */
public final class QuantityParser {

    /** Weight is informative only, so problems are warnings, never errors. */
    public record ParsedWeight(Double kg, String warning) {
    }

    private static final Pattern WEIGHT = Pattern.compile("(\\d[\\d.,]*)(kg|t)?");
    private static final Pattern DECIMAL = Pattern.compile("\\d+([.,]\\d+)?");
    private static final Pattern THOUSANDS = Pattern.compile("\\d{1,3}(,\\d{3})+");
    private static final Pattern INTEGER = Pattern.compile("\\d+");
    private static final Pattern ONE_SEPARATOR = Pattern.compile("\\d+[.,]\\d+");
    private static final Pattern LDM = Pattern.compile(
            "(\\d+)(?:[.,](\\d))?" + Text.WS + "*(?:m|ldm)?", Pattern.CASE_INSENSITIVE);

    private QuantityParser() {
    }

    /**
     * "4,200 kg" -> 4200 (comma as thousands separator for kg, as confirmed for this file),
     * "5,3t" -> 5300 (comma as decimal for tonnes), "500kg" -> 500.
     */
    public static ParsedWeight parseWeight(String text) {
        String compact = Text.removeWhitespace(text).toLowerCase(Locale.ROOT);
        if (compact.isEmpty()) {
            return new ParsedWeight(null, null);
        }
        String notRecognized = "Težina „" + text + "“ nije prepoznata.";

        Matcher match = WEIGHT.matcher(compact);
        if (!match.matches()) {
            return new ParsedWeight(null, notRecognized);
        }
        String number = match.group(1);
        String unit = match.group(2);

        if ("t".equals(unit)) {
            if (!DECIMAL.matcher(number).matches()) {
                return new ParsedWeight(null, notRecognized);
            }
            return new ParsedWeight((double) Math.round(Double.parseDouble(number.replace(',', '.')) * 1000), null);
        }

        String warningNoUnit = unit != null ? null : "Težina „" + text + "“ nema jedinicu; pretpostavljeni su kilogrami.";
        if (THOUSANDS.matcher(number).matches()) {
            return new ParsedWeight(Double.parseDouble(number.replace(",", "")), warningNoUnit);
        }
        if (INTEGER.matcher(number).matches()) {
            return new ParsedWeight(Double.parseDouble(number), warningNoUnit);
        }
        if (ONE_SEPARATOR.matcher(number).matches()) {
            return new ParsedWeight(Double.parseDouble(number.replace(',', '.')),
                    "Zarez u težini „" + text + "“ ne liči na hiljade; protumačeno kao decimala. Proverite.");
        }
        return new ParsedWeight(null, notRecognized);
    }

    /**
     * "2,4m" / "3.6m" / "1m" / "2,4" -> LDM x 10; null if not a number with at most one
     * decimal, or too large for an int (the frontend would accept it and fail later on > 0).
     */
    public static Integer parseLdmCell(String text) {
        Matcher match = LDM.matcher(Text.trim(text));
        if (!match.matches()) {
            return null;
        }
        try {
            int tenths = match.group(2) == null ? 0 : Integer.parseInt(match.group(2));
            return Math.addExact(Math.multiplyExact(Integer.parseInt(match.group(1)), 10), tenths);
        } catch (NumberFormatException | ArithmeticException e) {
            return null;
        }
    }
}
