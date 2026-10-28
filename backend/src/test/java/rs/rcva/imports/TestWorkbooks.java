package rs.rcva.imports;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.LocalDate;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

/**
 * Builds .xlsx files in memory, so no binary test file (and no real data) is in the
 * repository. Cell values: String, Number, Boolean, LocalDate, {@link Formula} or null (no cell).
 */
public final class TestWorkbooks {

    public record Formula(String expression) {
    }

    private TestWorkbooks() {
    }

    /** One sheet named "Sheet1". */
    public static byte[] xlsx(Object[][] rows) {
        try (XSSFWorkbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            CellStyle dateStyle = workbook.createCellStyle();
            dateStyle.setDataFormat(workbook.getCreationHelper().createDataFormat().getFormat("dd.mm.yyyy"));
            Sheet sheet = workbook.createSheet("Sheet1");
            for (int r = 0; r < rows.length; r++) {
                Row row = sheet.createRow(r);
                for (int c = 0; c < rows[r].length; c++) {
                    Object value = rows[r][c];
                    if (value == null) {
                        continue;
                    }
                    Cell cell = row.createCell(c);
                    switch (value) {
                        case String s -> cell.setCellValue(s);
                        case Number n -> cell.setCellValue(n.doubleValue());
                        case Boolean b -> cell.setCellValue(b);
                        case LocalDate d -> {
                            cell.setCellValue(d);
                            cell.setCellStyle(dateStyle);
                        }
                        case Formula f -> cell.setCellFormula(f.expression());
                        default -> throw new IllegalArgumentException("Unsupported cell value: " + value);
                    }
                }
            }
            workbook.getCreationHelper().createFormulaEvaluator().evaluateAll();
            workbook.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
