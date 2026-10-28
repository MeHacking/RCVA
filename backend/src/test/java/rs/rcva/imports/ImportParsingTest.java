package rs.rcva.imports;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import rs.rcva.domain.Model.PlaceGuess;
import rs.rcva.imports.QuantityParser.ParsedWeight;
import rs.rcva.imports.RelationParser.RelationParse;

/**
 * Same cases as frontend/tests/unit/importParsing.test.ts. Invented rows with the same
 * shapes as the real Excel file (the real data stays local).
 */
class ImportParsingTest {

    private static PlaceGuess place(String name, String postalCode, String country) {
        return new PlaceGuess(name, postalCode, country);
    }

    @Nested
    class ParseRelation {

        static Stream<Arguments> relations() {
            return Stream.of(
                    Arguments.of("NOVI SAD 21000 - MALMO", place("Novi Sad", null, null), place("Malmo", "21000", null)),
                    Arguments.of("NIS / RS / -/ SE / 55555 VAXJO", place("Nis", null, "RS"), place("Vaxjo", "55555", "SE")),
                    Arguments.of("SOMBOR - NO 1234 DRAMMEN", place("Sombor", null, null), place("Drammen", "1234", "NO")),
                    Arguments.of("Valjevo 12345- umea", place("Valjevo", null, null), place("Umea", "12345", null)),
                    Arguments.of("Bitola / MK / - Lund 22222", place("Bitola", null, "MK"), place("Lund", "22222", null)),
                    Arguments.of("INDJIJA-KALMAR 39234", place("Indjija", null, null), place("Kalmar", "39234", null)),
                    Arguments.of("Bihac / BIH / - / Lulea 97234/", place("Bihac", null, "BIH"), place("Lulea", "97234", null)));
        }

        @ParameterizedTest(name = "{0}")
        @MethodSource("relations")
        void splitsPickupAndDelivery(String text, PlaceGuess pickup, PlaceGuess delivery) {
            assertThat(RelationParser.parseRelation(text)).isEqualTo(new RelationParse(pickup, delivery, List.of()));
        }

        @Test
        void assignsAPostalCodeWrittenNextToThePickupToTheDelivery() {
            RelationParse parsed = RelationParser.parseRelation("ČAČAK 34131 - LJUNGBY");
            assertThat(parsed.pickup()).isEqualTo(place("Čačak", null, null));
            assertThat(parsed.delivery().postalCode()).isEqualTo("34131");
        }

        @Test
        void reportsARelationWithoutAPickupPlace() {
            RelationParse parsed = RelationParser.parseRelation("12345 SODERTALJE");
            assertThat(parsed.pickup()).isNull();
            assertThat(parsed.delivery()).isEqualTo(place("Sodertalje", "12345", null));
        }

        @Test
        void reportsSeveralDestinationsInOneRelation() {
            RelationParse parsed = RelationParser.parseRelation("ZAJECAR 11111-YSTAD, 22222 LUND");
            assertThat(parsed.issues()).containsExactly(
                    "Više odredišta u jednoj relaciji; podelite ih na posebne redove ili ispravite ručno.");
            assertThat(parsed.delivery().postalCode()).isNull();
        }

        @Test
        void reportsAPostalCodeThatIsNeither4Nor5Digits() {
            RelationParse parsed = RelationParser.parseRelation("BEOGRAD 123456 - KIRUNA");
            assertThat(parsed.issues()).containsExactly("Neispravan poštanski broj „123456“ (očekuje se 4 ili 5 cifara).");
            assertThat(parsed.delivery()).isEqualTo(place("Kiruna", null, null));
        }

        /** Java-only: Excel cells often hold no-break spaces, which JavaScript's \s covers. */
        @Test
        void treatsNoBreakSpacesAsSpaces() {
            assertThat(RelationParser.parseRelation("NOVI SAD - SE 21000 MALMO"))
                    .isEqualTo(new RelationParse(place("Novi Sad", null, null), place("Malmo", "21000", "SE"), List.of()));
        }
    }

    @Nested
    class ParsePlace {

        @Test
        void takesThePostalCodeFromItsOwnColumnFirstThenFromTheText() {
            assertThat(RelationParser.parsePlace("Malmo", "21145")).isEqualTo(place("Malmo", "21145", null));
            assertThat(RelationParser.parsePlace("SE 21145 MALMO", null)).isEqualTo(place("Malmo", "21145", "SE"));
            assertThat(RelationParser.parsePlace("  ", null)).isNull();
        }
    }

    @Nested
    class ParseWeight {

        @ParameterizedTest(name = "{0} -> {1} kg without warning")
        @CsvSource(delimiter = '|', value = {
                "4,200 kg | 4200", "12,800 kg | 12800", "1,200kg | 1200", "500kg | 500",
                "30kg | 30", "5,3t | 5300", "2t | 2000", "1.5 t | 1500"})
        void readsKilogramsAndTonnes(String text, double kg) {
            assertThat(QuantityParser.parseWeight(text)).isEqualTo(new ParsedWeight(kg, null));
        }

        @Test
        void warnsWhenACommaDoesNotLookLikeThousands() {
            assertThat(QuantityParser.parseWeight("1,5 kg")).isEqualTo(new ParsedWeight(1.5,
                    "Zarez u težini „1,5 kg“ ne liči na hiljade; protumačeno kao decimala. Proverite."));
        }

        @Test
        void assumesKgWithoutAUnitWithAWarning() {
            assertThat(QuantityParser.parseWeight("800").kg()).isEqualTo(800);
            assertThat(QuantityParser.parseWeight("800").warning()).contains("nema jedinicu");
        }

        @Test
        void acceptsAnEmptyCellAndRejectsText() {
            assertThat(QuantityParser.parseWeight("")).isEqualTo(new ParsedWeight(null, null));
            assertThat(QuantityParser.parseWeight("teško").kg()).isNull();
            assertThat(QuantityParser.parseWeight("teško").warning()).contains("nije prepoznata");
        }
    }

    @Nested
    class ParseLdmCell {

        @ParameterizedTest(name = "{0} -> {1} tenths")
        @CsvSource(delimiter = '|', value = {
                "2,4m | 24", "3.6m | 36", "1m | 10", "0.1m | 1", "11,5m | 115", "2,4 | 24", "7 LDM | 70"})
        void readsLdmAsTenths(String text, int tenths) {
            assertThat(QuantityParser.parseLdmCell(text)).isEqualTo(tenths);
        }

        @ParameterizedTest(name = "rejects \"{0}\"")
        @ValueSource(strings = {"", "abc", "2,45m", "-1m", "2,4 m2", "99999999999m"})
        void rejectsAnythingElse(String text) {
            assertThat(QuantityParser.parseLdmCell(text)).isNull();
        }
    }

    @Nested
    class MockGeocoding {

        @Test
        void ignoresCaseAndDiacritics() {
            assertThat(Gazetteer.normalizePlaceName("  Göteborg ")).isEqualTo("goteborg");
            assertThat(Gazetteer.normalizePlaceName("Đakovo")).isEqualTo("djakovo");
            assertThat(Gazetteer.geocode("NIŠ")).isPresent();
            assertThat(Gazetteer.geocode("Vaxjo")).isEmpty();
        }
    }
}
