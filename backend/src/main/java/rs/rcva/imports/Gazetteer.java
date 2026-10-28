package rs.rcva.imports;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Stand-in for geocoding until OSRM/Nominatim: only these places are "found". Everything
 * else is stored with geocodeStatus FAILED, which the shipments table shows as "Nejasna
 * lokacija". Coordinates are approximate city centres. Same list as
 * frontend/src/api/mock/import/gazetteer.ts.
 */
public final class Gazetteer {

    public record Coordinates(double lat, double lon) {
    }

    private static final Map<String, Coordinates> PLACES = Map.ofEntries(
            Map.entry("beograd", new Coordinates(44.8125, 20.4612)),
            Map.entry("subotica", new Coordinates(46.1003, 19.6658)),
            Map.entry("kragujevac", new Coordinates(44.0128, 20.9114)),
            Map.entry("leskovac", new Coordinates(42.9981, 21.9461)),
            Map.entry("novi sad", new Coordinates(45.2671, 19.8335)),
            Map.entry("nis", new Coordinates(43.3209, 21.8958)),
            Map.entry("ljungby", new Coordinates(56.8333, 13.9333)),
            Map.entry("stenkullen", new Coordinates(57.792, 12.317)),
            Map.entry("landskrona", new Coordinates(55.8708, 12.8302)),
            Map.entry("malmo", new Coordinates(55.605, 13.0038)),
            Map.entry("goteborg", new Coordinates(57.7089, 11.9746)),
            Map.entry("jonkoping", new Coordinates(57.7826, 14.1618)));

    private static final Pattern MARKS = Pattern.compile("\\p{M}");
    private static final Pattern DJ = Pattern.compile("đ", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    private Gazetteer() {
    }

    public static Optional<Coordinates> geocode(String name) {
        return Optional.ofNullable(PLACES.get(normalizePlaceName(name)));
    }

    /** Lower case without diacritics: "Niš" -> "nis", "Göteborg" -> "goteborg" */
    public static String normalizePlaceName(String name) {
        String withoutMarks = MARKS.matcher(Normalizer.normalize(name, Normalizer.Form.NFD)).replaceAll("");
        return Text.collapse(DJ.matcher(withoutMarks).replaceAll("dj").toLowerCase(Locale.ROOT));
    }
}
