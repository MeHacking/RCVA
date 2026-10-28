package rs.rcva.imports;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

/** Reads every sheet of a workbook as text cells; replaceable so tests need no real .xlsx file. */
@FunctionalInterface
public interface WorkbookReader {

    /** {@code rows.get(i)} is spreadsheet row i + 1; empty cells are "", never null. */
    record Sheet(String name, List<List<String>> rows) {
    }

    /** Throws when the content is not a readable workbook. */
    List<Sheet> read(InputStream content) throws IOException;
}
