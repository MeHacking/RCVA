package rs.rcva.optimization;

import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import rs.rcva.api.ApiException;
import rs.rcva.data.InMemoryStore;
import rs.rcva.domain.Model.InfeasibilityKind;
import rs.rcva.domain.Model.JobStatus;
import rs.rcva.domain.Model.Location;
import rs.rcva.domain.Model.OptimizationJob;
import rs.rcva.domain.Model.OptimizationJobCreated;
import rs.rcva.domain.Model.OptimizationJobRequest;
import rs.rcva.domain.Model.OptimizationResult;
import rs.rcva.domain.Model.Shipment;
import rs.rcva.domain.Model.Truck;
import rs.rcva.optimization.routing.DistanceProvider;
import rs.rcva.optimization.solver.RoutingSolver;

/**
 * Optimization jobs (Spec v2, section 6; dopuna 1, section 3). A job copies its input when
 * it is created, waits in QUEUED and runs on one background thread, one job at a time. Jobs
 * live in memory like the rest of the data.
 */
@Service
public class OptimizationService implements ActiveJobs {

    private static final Logger log = LoggerFactory.getLogger(OptimizationService.class);

    private final InMemoryStore store;
    private final DistanceProvider distances;
    private final ExecutorService executor;
    private final Map<Long, Job> jobs = new LinkedHashMap<>();
    private long nextJobId = 1;

    /** Mutable state of one job; guarded by the service's lock. */
    private static final class Job {
        final long id;
        final JobInput input;
        final int timeLimitSeconds;
        final Instant createdAt = Instant.now();
        final Integer trucksLowerBound;
        JobStatus status = JobStatus.QUEUED;
        InfeasibilityKind infeasibilityKind;
        Instant startedAt;
        Instant finishedAt;
        Long scoreHard;
        Long scoreMedium;
        Long scoreSoft;
        OptimizationResult result;

        Job(long id, JobInput input, int timeLimitSeconds) {
            this.id = id;
            this.input = input;
            this.timeLimitSeconds = timeLimitSeconds;
            this.trucksLowerBound = Feasibility.trucksLowerBound(input.shipments(), input.trucks());
        }
    }

    @Autowired
    public OptimizationService(InMemoryStore store, DistanceProvider distances) {
        this(store, distances, Executors.newSingleThreadExecutor(r -> new Thread(r, "optimization")));
    }

    /** Tests pass their own executor. */
    OptimizationService(InMemoryStore store, DistanceProvider distances, ExecutorService executor) {
        this.store = store;
        this.distances = distances;
        this.executor = executor;
    }

    @PreDestroy
    void stop() {
        executor.shutdownNow();
    }

    /** 400 invalid request, 409 locations without coordinates, 422 proven infeasible. */
    public OptimizationJobCreated create(OptimizationJobRequest request) {
        JobInput input = input(request);
        List<String> causes = Feasibility.provenCauses(input.shipments(), input.trucks());
        if (!causes.isEmpty()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "Dokazano neizvodljivo",
                    "Provera pre pokretanja je dokazala da rešenje ne postoji. Solver nije pokrenut.", Map.of(),
                    Map.of("infeasibilityKind", InfeasibilityKind.PROVEN, "causes", causes));
        }
        requireCoordinates(input);
        Job job;
        synchronized (this) {
            job = new Job(nextJobId++, input, request.timeLimitSeconds());
            jobs.put(job.id, job);
        }
        executor.execute(() -> run(job));
        return new OptimizationJobCreated(job.id, JobStatus.QUEUED);
    }

    public synchronized OptimizationJob get(long id) {
        return view(find(id));
    }

    /** 409 unless the job is COMPLETED (dopuna 1, section 3.3). */
    public synchronized OptimizationResult result(long id) {
        Job job = find(id);
        if (job.status != JobStatus.COMPLETED) {
            throw new ApiException(HttpStatus.CONFLICT, "Rezultat nije dostupan",
                    "Posao " + id + " je u statusu " + job.status + "; rezultat postoji samo za COMPLETED.");
        }
        return job.result;
    }

    /** The input of a job, for the load plan. */
    public synchronized JobInput input(long id) {
        return find(id).input;
    }

    @Override
    public synchronized Optional<Long> activeJobId() {
        return jobs.values().stream()
                .filter(j -> j.status == JobStatus.QUEUED || j.status == JobStatus.RUNNING)
                .map(j -> j.id)
                .findFirst();
    }

    private void run(Job job) {
        synchronized (this) {
            job.status = JobStatus.RUNNING;
            job.startedAt = Instant.now();
        }
        try {
            RoutingSolver.Outcome outcome = new RoutingSolver(job.input, distances)
                    .solve(Duration.ofSeconds(job.timeLimitSeconds));
            OptimizationResult result = outcome.result();
            if (result != null) {
                result = new OptimizationResult(result.status(), result.feasible(), result.trucksUsed(),
                        result.trucksLowerBound(), result.totalMeters(), result.routes(), result.unassignedShipmentIds(),
                        new SolutionValidator(distances).validate(job.input, result));
            }
            synchronized (this) {
                job.scoreHard = outcome.score().hardScore();
                job.scoreMedium = outcome.score().mediumScore();
                job.scoreSoft = outcome.score().softScore();
                job.result = result;
                job.status = result != null ? JobStatus.COMPLETED : JobStatus.INFEASIBLE;
                job.infeasibilityKind = result != null ? null : InfeasibilityKind.NOT_FOUND;
                job.finishedAt = Instant.now();
            }
        } catch (RuntimeException e) {
            log.error("Optimization job {} failed", job.id, e);
            synchronized (this) {
                job.status = JobStatus.FAILED;
                job.finishedAt = Instant.now();
            }
        }
    }

    private JobInput input(OptimizationJobRequest request) {
        if (request == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Neispravan zahtev", "Telo zahteva nedostaje.");
        }
        Map<String, String> errors = new LinkedHashMap<>();
        if (request.timeLimitSeconds() == null || request.timeLimitSeconds() <= 0) {
            errors.put("timeLimitSeconds", "Vremensko ograničenje mora biti veće od 0.");
        }
        List<Truck> allTrucks = store.trucks();
        List<Shipment> allShipments = store.shipments();
        List<Truck> trucks = select(allTrucks, Truck::id, request.truckIds(), "truckIds", "Kamion", errors);
        List<Shipment> shipments = select(allShipments, Shipment::id, request.shipmentIds(), "shipmentIds", "Pošiljka", errors);
        if (!errors.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Neispravan zahtev", null, errors);
        }
        if (shipments.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Neispravan zahtev", "Nema pošiljki za optimizaciju.");
        }

        // Unavailable trucks are not sent to the solver (Spec v2).
        trucks = trucks.stream().filter(Truck::available).toList();
        Map<Long, Location> locations = store.locations().stream().collect(Collectors.toMap(Location::id, Function.identity()));
        long baseId = store.base().baseLocationId();
        Set<Long> used = new HashSet<>(Set.of(baseId));
        shipments.forEach(s -> {
            used.add(s.pickupLocationId());
            used.add(s.deliveryLocationId());
        });
        return new JobInput(shipments, trucks, used.stream().sorted().map(locations::get).toList(), store.base());
    }

    /** 409: distances need coordinates (geocodeStatus FAILED = "Nejasna lokacija"). */
    private static void requireCoordinates(JobInput input) {
        Map<Long, Location> locations = input.locationsById();
        if (!hasCoordinates(locations.get(input.base().baseLocationId()))) {
            throw new ApiException(HttpStatus.CONFLICT, "Nejasne lokacije", "Baza nema koordinate.");
        }
        List<String> unclear = new ArrayList<>();
        for (Shipment shipment : input.shipments()) {
            if (!hasCoordinates(locations.get(shipment.pickupLocationId()))
                    || !hasCoordinates(locations.get(shipment.deliveryLocationId()))) {
                unclear.add(shipment.externalId());
            }
        }
        if (!unclear.isEmpty()) {
            throw new ApiException(HttpStatus.CONFLICT, "Nejasne lokacije",
                    "Pošiljke sa nejasnom lokacijom (" + unclear.size() + "): " + String.join(", ", unclear)
                            + ". Bez koordinata ne mogu da uđu u rutu; ispravite ih ili ih izostavite iz optimizacije.");
        }
    }

    private static <T> List<T> select(List<T> all, Function<T, Long> id, List<Long> wanted, String field, String noun,
            Map<String, String> errors) {
        if (wanted == null) {
            return all;
        }
        Map<Long, T> byId = all.stream().collect(Collectors.toMap(id, Function.identity()));
        List<Long> unknown = wanted.stream().filter(w -> !byId.containsKey(w)).toList();
        if (!unknown.isEmpty()) {
            errors.put(field, noun + " ne postoji: " + unknown.stream().map(String::valueOf).collect(Collectors.joining(", ")) + ".");
            return List.of();
        }
        return wanted.stream().distinct().map(byId::get).toList();
    }

    private static boolean hasCoordinates(Location location) {
        return location != null && location.lat() != null && location.lon() != null;
    }

    private Job find(long id) {
        Job job = jobs.get(id);
        if (job == null) {
            throw ApiException.notFound("Posao optimizacije " + id + " ne postoji.");
        }
        return job;
    }

    private static OptimizationJob view(Job job) {
        return new OptimizationJob(job.id, job.status, job.infeasibilityKind, job.createdAt.toString(),
                job.startedAt == null ? null : job.startedAt.toString(),
                job.finishedAt == null ? null : job.finishedAt.toString(),
                job.timeLimitSeconds, job.scoreHard, job.scoreMedium, job.scoreSoft,
                job.status == JobStatus.COMPLETED ? Boolean.TRUE : job.status == JobStatus.INFEASIBLE ? Boolean.FALSE : null,
                job.trucksLowerBound);
    }
}
