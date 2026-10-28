package rs.rcva.optimization;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import rs.rcva.api.ApiException;
import rs.rcva.data.InMemoryStore;
import rs.rcva.domain.Model.GeocodeStatus;
import rs.rcva.domain.Model.InfeasibilityKind;
import rs.rcva.domain.Model.JobStatus;
import rs.rcva.domain.Model.Location;
import rs.rcva.domain.Model.OptimizationJob;
import rs.rcva.domain.Model.OptimizationJobRequest;
import rs.rcva.domain.Model.OptimizationResult;
import rs.rcva.domain.Model.Shipment;
import rs.rcva.optimization.routing.HaversineDistanceProvider;

/** Jobs over the sample data: Šleper 1 and 2 available (13,6 LDM), Solo 1 not; 5 shipments, 20,9 LDM. */
class OptimizationServiceTest {

    private final InMemoryStore store = new InMemoryStore();
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final OptimizationService service = new OptimizationService(store, new HaversineDistanceProvider(), executor);

    @AfterEach
    void stop() {
        executor.shutdownNow();
    }

    private OptimizationJob finish(long id) throws InterruptedException {
        executor.shutdown();
        assertThat(executor.awaitTermination(30, TimeUnit.SECONDS)).isTrue();
        return service.get(id);
    }

    private static ApiException rejection(Executable call) {
        ApiException[] caught = new ApiException[1];
        assertThatThrownBy(call::execute).isInstanceOfSatisfying(ApiException.class, e -> caught[0] = e);
        return caught[0];
    }

    private void addShipments(int... ldmTenths) {
        for (int i = 0; i < ldmTenths.length; i++) {
            int ldm = ldmTenths[i];
            String externalId = "T-" + i;
            store.addShipment(id -> new Shipment(id, externalId, null, ldm, 1, 5, false, null, null, null, null));
        }
    }

    @Test
    void solvesTheSampleDataWithAValidatedResult() throws InterruptedException {
        var created = service.create(new OptimizationJobRequest(1, null, null));
        assertThat(created.status()).isEqualTo(JobStatus.QUEUED);

        OptimizationJob job = finish(created.id());
        assertThat(job.status()).isEqualTo(JobStatus.COMPLETED);
        assertThat(job.infeasibilityKind()).isNull();
        assertThat(job.feasible()).isTrue();
        assertThat(job.trucksLowerBound()).isEqualTo(2);
        assertThat(job.startedAt()).isNotNull();
        assertThat(job.finishedAt()).isNotNull();

        OptimizationResult result = service.result(created.id());
        assertThat(result.validation().violations()).isEmpty();
        assertThat(result.validation().passed()).isTrue();
        assertThat(result.trucksUsed()).isEqualTo(2);
        assertThat(result.unassignedShipmentIds()).isEmpty();
        assertThat(result.routes()).extracting(r -> r.truckId()).containsOnly(1L, 2L);
        assertThat(job.scoreMedium()).isEqualTo(-2);
        assertThat(job.scoreSoft()).isEqualTo(-result.totalMeters());
        assertThat(service.activeJobId()).isEmpty();
    }

    @Test
    void validatesTheRequest() {
        ApiException error = rejection(() -> service.create(new OptimizationJobRequest(0, List.of(1L, 9L), List.of(77L))));
        assertThat(error.status().value()).isEqualTo(400);
        assertThat(error.errors())
                .containsEntry("timeLimitSeconds", "Vremensko ograničenje mora biti veće od 0.")
                .containsEntry("truckIds", "Kamion ne postoji: 9.")
                .containsEntry("shipmentIds", "Pošiljka ne postoji: 77.");
        assertThat(rejection(() -> service.create(new OptimizationJobRequest(1, null, List.of()))).detail())
                .isEqualTo("Nema pošiljki za optimizaciju.");
    }

    @Test
    void answers422WhenInfeasibilityIsProvenAndCreatesNoJob() {
        ApiException error = rejection(() -> service.create(new OptimizationJobRequest(1, List.of(1L), null)));
        assertThat(error.status().value()).isEqualTo(422);
        assertThat(error.properties()).containsEntry("infeasibilityKind", InfeasibilityKind.PROVEN)
                .containsEntry("causes", List.of("Ukupno 20,9 LDM je više od kapaciteta dostupnih kamiona (13,6 LDM)."));
        // Solo 1 is not available, so it is not offered to the solver.
        assertThat(rejection(() -> service.create(new OptimizationJobRequest(1, List.of(3L), null))).properties())
                .containsEntry("causes", List.of("Nijedan kamion nije dostupan."));
        assertThat(rejection(() -> service.get(1)).status().value()).isEqualTo(404);
    }

    @Test
    void refusesShipmentsWithoutCoordinates() {
        Location unclear = store.addLocation(id -> new Location(id, "Vaxjo", null, "SE", "35230", null, null, GeocodeStatus.FAILED));
        store.addShipment(id -> new Shipment(id, "U-1", null, 10, 1, unclear.id(), false, null, null, null, null));
        ApiException error = rejection(() -> service.create(new OptimizationJobRequest(1, null, null)));
        assertThat(error.status().value()).isEqualTo(409);
        assertThat(error.detail()).startsWith("Pošiljke sa nejasnom lokacijom (1): U-1.");
    }

    /** Test 5b on the service: the job ends INFEASIBLE / NOT_FOUND, never PROVEN. */
    @Test
    void endsWithNotFoundWhenTheSolverFindsNoFeasibleSolution() throws InterruptedException {
        addShipments(70, 70, 70);
        List<Long> newShipments = store.shipments().stream().filter(s -> s.externalId().startsWith("T-")).map(Shipment::id).toList();
        long id = service.create(new OptimizationJobRequest(1, null, newShipments)).id();

        OptimizationJob job = finish(id);
        assertThat(job.status()).isEqualTo(JobStatus.INFEASIBLE);
        assertThat(job.infeasibilityKind()).isEqualTo(InfeasibilityKind.NOT_FOUND);
        assertThat(job.feasible()).isFalse();
        assertThat(job.scoreHard()).isNegative();
        assertThat(rejection(() -> service.result(id)).detail())
                .isEqualTo("Posao " + id + " je u statusu INFEASIBLE; rezultat postoji samo za COMPLETED.");
    }

    @Test
    void reportsAQueuedJobAsActive() {
        ExecutorService idle = Executors.newSingleThreadExecutor();
        idle.execute(() -> {
            try {
                Thread.sleep(60_000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        try {
            OptimizationService busy = new OptimizationService(store, new HaversineDistanceProvider(), idle);
            long id = busy.create(new OptimizationJobRequest(1, null, null)).id();
            assertThat(busy.get(id).status()).isEqualTo(JobStatus.QUEUED);
            assertThat(busy.activeJobId()).contains(id);
            assertThat(rejection(() -> busy.result(id)).status().value()).isEqualTo(409);
        } finally {
            idle.shutdownNow();
        }
    }
}
