package rs.rcva.trucks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import rs.rcva.api.ApiException;
import rs.rcva.data.InMemoryStore;
import rs.rcva.domain.Model.TruckInput;

class TruckServiceTest {

    private static final TruckInput VALID = new TruckInput("  Novi  ", 136, true, null, null, null);

    private final TruckService service = new TruckService(new InMemoryStore(), Optional::empty);

    @Test
    void startsWithTheSameTrucksAsTheFrontendMock() {
        assertThat(service.list()).extracting(t -> t.id() + " " + t.name() + " " + t.capacityLdmTenths())
                .containsExactly("1 Šleper 1 136", "2 Šleper 2 136", "3 Solo 1 70");
    }

    @Test
    void createsWithTheNextIdAndATrimmedName() {
        var created = service.create(VALID);
        assertThat(created.id()).isEqualTo(4);
        assertThat(created.name()).isEqualTo("Novi");
        assertThat(service.list()).hasSize(4);
    }

    @Test
    void rejectsInvalidInputWithOneMessagePerField() {
        var invalid = new TruckInput(" ", 0, true, 13600, -1, null);
        assertThatThrownBy(() -> service.create(invalid))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.status()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(e.errors()).containsOnlyKeys("name", "capacityLdmTenths", "innerWidthMm")
                            .containsEntry("capacityLdmTenths", "Kapacitet mora biti veći od 0.");
                });
    }

    @Test
    void reportsMissingCapacityAsInvalid() {
        assertThatThrownBy(() -> service.create(new TruckInput("X", null, null, null, null, null)))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.errors()).containsOnlyKeys("capacityLdmTenths"));
    }

    @Test
    void updatesAnExistingTruckAndReports404ForAnUnknownOne() {
        assertThat(service.update(2, new TruckInput("Šleper 2a", 125, false, null, null, null)))
                .satisfies(t -> {
                    assertThat(t.capacityLdmTenths()).isEqualTo(125);
                    assertThat(t.available()).isFalse();
                });
        assertThatThrownBy(() -> service.update(99, VALID))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status()).isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void deletesAndThenReports404() {
        service.delete(3);
        assertThat(service.list()).extracting(t -> t.id()).containsExactly(1L, 2L);
        assertThatThrownBy(() -> service.delete(3))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status()).isEqualTo(HttpStatus.NOT_FOUND));
    }

    @Test
    void refusesDeletionWhileAJobIsActive() {
        var busy = new TruckService(new InMemoryStore(), () -> Optional.of(7L));
        assertThatThrownBy(() -> busy.delete(1))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.status()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(e.getMessage()).isEqualTo("Optimizacija #7 je u toku; kamion se može ukloniti kada se završi.");
                });
        assertThat(busy.list()).hasSize(3);
    }
}
