package rs.rcva.imports;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.MatchResult;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import rs.rcva.domain.Model.PlaceGuess;

/**
 * Splits a free-text relation such as "NOVI SAD 34131 - LJUNGBY" or
 * "NIS / RS / -/ SE / 55555 VAXJO" into pickup and delivery (dopuna 1, section 4.6):
 * <ul>
 * <li>pickup and delivery are separated by the first hyphen (with or without spaces);</li>
 * <li>a postal code belongs to the DELIVERY place even when written next to the pickup
 * ("NOVI SAD 34131 - LJUNGBY": 34131 is Ljungby);</li>
 * <li>countries appear as "/ RS /" or as a code in front of the postal code ("NO 1234 DRAMMEN").</li>
 * </ul>
 * Port of frontend/src/api/mock/import/parseRelation.ts.
 */
public final class RelationParser {

    /** {@code issues}: blocking problems with the text itself (postal codes, several destinations) */
    public record RelationParse(PlaceGuess pickup, PlaceGuess delivery, List<String> issues) {
    }

    private static final List<String> COUNTRY_CODES =
            List.of("RS", "SE", "NO", "MK", "BIH", "BA", "HR", "ME", "SI", "DK", "DE", "FI", "HU", "RO", "BG");
    private static final Pattern COUNTRY_TOKEN = Pattern.compile(
            "(?:^|[" + Text.WS + "/])(" + String.join("|", COUNTRY_CODES) + ")(?=\\z|[" + Text.WS + "/])",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern NUMBER_TOKEN = Pattern.compile("\\d+");
    private static final Pattern VALID_POSTAL = Pattern.compile("\\d{4,5}");
    private static final Pattern SEPARATOR = Pattern.compile("[-–]");
    private static final Pattern PUNCTUATION = Pattern.compile("[/,;]");
    private static final Pattern WORD_START = Pattern.compile("(^|" + Text.WS + "|-)(\\p{L})");
    private static final Locale SERBIAN_LATIN = Locale.forLanguageTag("sr-Latn");

    private RelationParser() {
    }

    public static RelationParse parseRelation(String text) {
        List<String> issues = new ArrayList<>();
        String normalized = Text.collapse(text);
        Matcher separator = SEPARATOR.matcher(normalized);
        String left = "";
        String right = normalized;
        if (separator.find()) {
            left = normalized.substring(0, separator.start());
            right = normalized.substring(separator.start() + 1);
        }

        List<String> postalCodes = NUMBER_TOKEN.matcher(normalized).results().map(MatchResult::group).toList();
        for (String code : postalCodes) {
            if (!VALID_POSTAL.matcher(code).matches()) {
                issues.add("Neispravan poštanski broj „" + code + "“ (očekuje se 4 ili 5 cifara).");
            }
        }
        List<String> validCodes = postalCodes.stream().filter(c -> VALID_POSTAL.matcher(c).matches()).toList();
        if (validCodes.size() > 1 || right.contains(",")) {
            issues.add("Više odredišta u jednoj relaciji; podelite ih na posebne redove ili ispravite ručno.");
        }

        // Missing places are reported by row validation, which also runs after corrections.
        String pickupName = placeName(left);
        String deliveryName = placeName(right);

        return new RelationParse(
                pickupName.isEmpty() ? null : new PlaceGuess(pickupName, null, countryOf(left)),
                deliveryName.isEmpty() ? null : new PlaceGuess(
                        deliveryName, validCodes.size() == 1 ? validCodes.getFirst() : null, countryOf(right)),
                List.copyOf(issues));
    }

    /** Builds a place from separate pickup/delivery cells (no relation column). */
    public static PlaceGuess parsePlace(String text, String postalCode) {
        String name = placeName(text);
        if (name.isEmpty()) {
            return null;
        }
        String inText = NUMBER_TOKEN.matcher(text).results().map(MatchResult::group)
                .filter(c -> VALID_POSTAL.matcher(c).matches()).findFirst().orElse(null);
        String fromColumn = postalCode == null ? "" : Text.trim(postalCode);
        return new PlaceGuess(name, fromColumn.isEmpty() ? inText : fromColumn, countryOf(text));
    }

    private static String countryOf(String part) {
        List<MatchResult> matches = COUNTRY_TOKEN.matcher(part).results().toList();
        return matches.isEmpty() ? null : matches.getLast().group(1).toUpperCase(Locale.ROOT);
    }

    /** Removes codes, numbers and separators, then writes the name in title case. */
    private static String placeName(String part) {
        String cleaned = COUNTRY_TOKEN.matcher(part).replaceAll(" ");
        cleaned = NUMBER_TOKEN.matcher(cleaned).replaceAll(" ");
        cleaned = Text.collapse(PUNCTUATION.matcher(cleaned).replaceAll(" "));
        return WORD_START.matcher(cleaned.toLowerCase(SERBIAN_LATIN))
                .replaceAll(m -> Matcher.quoteReplacement(m.group(1) + m.group(2).toUpperCase(SERBIAN_LATIN)));
    }
}
