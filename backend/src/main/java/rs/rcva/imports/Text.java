package rs.rcva.imports;

import java.util.regex.Pattern;

/**
 * Whitespace as JavaScript sees it. The rules were written for the frontend mock, where
 * {@code \s} and {@code trim()} also cover the no-break space that Excel cells often hold;
 * Java's {@code \s} and {@code strip()} do not.
 */
final class Text {

    /** JavaScript {@code \s}: ASCII whitespace, Unicode space separators and U+FEFF. */
    static final String WS = "[\\s\\p{Z}\\uFEFF]";

    private static final Pattern RUNS = Pattern.compile(WS + "+");
    private static final Pattern EDGES = Pattern.compile("^" + WS + "+|" + WS + "+\\z");

    private Text() {
    }

    /** JavaScript {@code trim()} */
    static String trim(String text) {
        return EDGES.matcher(text).replaceAll("");
    }

    /** Replaces every whitespace run with one space and trims. */
    static String collapse(String text) {
        return trim(RUNS.matcher(text).replaceAll(" "));
    }

    static String removeWhitespace(String text) {
        return RUNS.matcher(text).replaceAll("");
    }
}
