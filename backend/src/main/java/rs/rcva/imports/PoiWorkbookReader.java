package rs.rcva.imports;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;

/**
 * Reads .xlsx files with Apache POI. Cells become text the way the frontend mock's
 * read-excel-file does: numbers as JavaScript writes them ("2.4", "1200"), dates as
 * yyyy-mm-dd, formulas as their cached result. Rows keep their spreadsheet numbers
 * (row i + 1 is at index i, empty rows included); every row has the same number of cells.
 */
@Component
public class PoiWorkbookReader implements WorkbookReader {

    @Override
    public List<Sheet> read(InputStream content) throws IOException {
        try (XSSFWorkbook workbook = new XSSFWorkbook(content)) {
            List<Sheet> sheets = new ArrayList<>();
            for (org.apache.poi.ss.usermodel.Sheet sheet : workbook) {
                sheets.add(new Sheet(sheet.getSheetName(), rows(sheet)));
            }
            return sheets;
        }
    }

    private static List<List<String>> rows(org.apache.poi.ss.usermodel.Sheet sheet) {
        int width = 0;
        for (Row row : sheet) {
            width = Math.max(width, row.getLastCellNum());
        }
        List<List<String>> rows = new ArrayList<>();
        for (int r = 0; r <= sheet.getLastRowNum(); r++) {
            Row row = sheet.getRow(r);
            List<String> cells = new ArrayList<>(Collections.nCopies(width, ""));
            if (row != null) {
                for (Cell cell : row) {
                    cells.set(cell.getColumnIndex(), text(cell, cell.getCellType()));
                }
            }
            rows.add(List.copyOf(cells));
        }
        // Formatted but empty rows at the end are not data.
        while (!rows.isEmpty() && rows.getLast().stream().allMatch(String::isEmpty)) {
            rows.removeLast();
        }
        return List.copyOf(rows);
    }

    private static String text(Cell cell, CellType type) {
        return switch (type) {
            case STRING -> cell.getStringCellValue();
            case NUMERIC -> DateUtil.isCellDateFormatted(cell)
                    ? cell.getLocalDateTimeCellValue().toLocalDate().toString()
                    : number(cell.getNumericCellValue());
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            case FORMULA -> text(cell, cell.getCachedFormulaResultType());
            case BLANK, ERROR, _NONE -> "";
        };
    }

    /** As JavaScript's String(number) for ordinary values: 2.4 -> "2.4", 1200.0 -> "1200". */
    static String number(double value) {
        return BigDecimal.valueOf(value).stripTrailingZeros().toPlainString();
    }
}
