package rs.rcva.imports;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import rs.rcva.imports.TestWorkbooks.Formula;
import rs.rcva.imports.WorkbookReader.Sheet;

class PoiWorkbookReaderTest {

    private final PoiWorkbookReader reader = new PoiWorkbookReader();

    private List<Sheet> read(Object[][] rows) throws IOException {
        return reader.read(new ByteArrayInputStream(TestWorkbooks.xlsx(rows)));
    }

    @Test
    void readsCellsAsTextLikeTheFrontendDoes() throws IOException {
        List<Sheet> sheets = read(new Object[][] {
                {"RELACIJA", "TEŽINA", "DIMENZIJE", "DATUM"},
                {"NOVI SAD 21000 - MALMO", 1200, 2.4, LocalDate.of(2026, 10, 28)},
                {"NIS - LUND", "5,3t", new Formula("1+1"), true},
        });
        assertThat(sheets).singleElement().satisfies(sheet -> {
            assertThat(sheet.name()).isEqualTo("Sheet1");
            assertThat(sheet.rows()).containsExactly(
                    List.of("RELACIJA", "TEŽINA", "DIMENZIJE", "DATUM"),
                    List.of("NOVI SAD 21000 - MALMO", "1200", "2.4", "2026-10-28"),
                    List.of("NIS - LUND", "5,3t", "2", "true"));
        });
    }

    @Test
    void keepsSpreadsheetRowNumbersAndPadsMissingCells() throws IOException {
        List<List<String>> rows = read(new Object[][] {
                {"A", "B", "C"},
                {},
                {null, "x"},
        }).getFirst().rows();
        assertThat(rows).containsExactly(List.of("A", "B", "C"), List.of("", "", ""), List.of("", "x", ""));
    }

    @Test
    void writesNumbersAsJavaScriptDoes() {
        assertThat(PoiWorkbookReader.number(1200.0)).isEqualTo("1200");
        assertThat(PoiWorkbookReader.number(2.4)).isEqualTo("2.4");
        assertThat(PoiWorkbookReader.number(0.1)).isEqualTo("0.1");
        assertThat(PoiWorkbookReader.number(-3.0)).isEqualTo("-3");
    }

    @Test
    void failsOnSomethingThatIsNotAWorkbook() {
        assertThatThrownBy(() -> reader.read(new ByteArrayInputStream("RELACIJA;LDM".getBytes())))
                .isNotNull();
    }
}
