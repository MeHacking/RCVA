package rs.rcva.optimization;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import rs.rcva.domain.Model.JobStatus;
import rs.rcva.domain.Model.OptimizationResult;
import rs.rcva.domain.Model.RoutePlan;
import rs.rcva.domain.Model.RouteStop;
import rs.rcva.domain.Model.StopType;
import rs.rcva.domain.Model.ValidationReport;

class SolutionValidatorTest {

    private final SolutionValidator validator = new SolutionValidator(Test7Data.PLANAR);

    private static RouteStop stop(int sequence, StopType type, long shipmentId, long locationId, int load, long leg) {
        return new RouteStop(sequence, type, shipmentId, locationId, load, leg);
    }

    /** The expected test 7 answer, written out by hand (legs in metres). */
    private static List<RoutePlan> expectedRoutes() {
        return List.of(
                new RoutePlan(71, 100, 500_000, List.of(
                        stop(1, StopType.PICKUP, 71, 711, 60, 50_000),
                        stop(2, StopType.PICKUP, 73, 731, 100, 100_000),
                        stop(3, StopType.DELIVERY, 71, 712, 40, 50_000),
                        stop(4, StopType.DELIVERY, 73, 732, 0, 200_000))),
                new RoutePlan(72, 100, 501_489, List.of(
                        stop(1, StopType.PICKUP, 72, 721, 60, 50_990),
                        stop(2, StopType.PICKUP, 74, 741, 100, 100_000),
                        stop(3, StopType.DELIVERY, 72, 722, 40, 50_000),
                        stop(4, StopType.DELIVERY, 74, 742, 0, 200_000))));
    }

    private static OptimizationResult result(List<RoutePlan> routes, int trucksUsed, long totalMeters, List<Long> unassigned) {
        return new OptimizationResult(JobStatus.COMPLETED, true, trucksUsed, 2, totalMeters, routes, unassigned,
                new ValidationReport(true, List.of()));
    }

    private ValidationReport validate(List<RoutePlan> routes) {
        return validator.validate(Test7Data.input(), result(routes, 2, 1_001_489, List.of()));
    }

    @Test
    void acceptsTheExpectedTest7Answer() {
        assertThat(validate(expectedRoutes())).isEqualTo(new ValidationReport(true, List.of()));
    }

    @Test
    void reportsALoadOverCapacity() {
        List<RoutePlan> routes = new ArrayList<>(expectedRoutes());
        RoutePlan b = routes.get(1);
        // S4 moved onto truck A, after S3's pickup: 140 LDM tenths on a 100 truck.
        List<RouteStop> a = List.of(
                stop(1, StopType.PICKUP, 71, 711, 60, 50_000),
                stop(2, StopType.PICKUP, 73, 731, 100, 100_000),
                stop(3, StopType.PICKUP, 74, 741, 140, 10_000),
                stop(4, StopType.DELIVERY, 71, 712, 80, 50_990),
                stop(5, StopType.DELIVERY, 73, 732, 40, 200_000),
                stop(6, StopType.DELIVERY, 74, 742, 0, 10_000));
        routes.set(0, new RoutePlan(71, 140, 520_990, a));
        routes.set(1, new RoutePlan(72, 60, b.totalMeters(), b.stops().subList(0, 1)));
        ValidationReport report = validator.validate(Test7Data.input(), result(routes, 2, 1_001_489, List.of()));
        assertThat(report.passed()).isFalse();
        assertThat(report.violations()).contains("Kamion A: teret 14,0 LDM je veći od kapaciteta 10,0 LDM.");
    }

    @Test
    void reportsADeliveryBeforeItsPickupAndAPickupAfterTheFirstDelivery() {
        List<RoutePlan> routes = new ArrayList<>(expectedRoutes());
        routes.set(0, new RoutePlan(71, 60, 600_000, List.of(
                stop(1, StopType.DELIVERY, 71, 712, -60, 100_000),
                stop(2, StopType.PICKUP, 71, 711, 0, 150_000),
                stop(3, StopType.PICKUP, 73, 731, 40, 100_000),
                stop(4, StopType.DELIVERY, 73, 732, 0, 150_000))));
        assertThat(validate(routes).violations()).contains(
                "Kamion A, stanica 1: S1 se isporučuje pre preuzimanja ili drugim kamionom.",
                "Kamion A, stanica 2: preuzimanje S1 posle prve isporuke (ruta ima dve faze).",
                "Kamion A: pošiljke preuzete a neisporučene: 1.");
    }

    @Test
    void recomputesLegsLoadsAndTotals() {
        List<RoutePlan> routes = new ArrayList<>(expectedRoutes());
        RoutePlan a = routes.get(0);
        List<RouteStop> stops = new ArrayList<>(a.stops());
        stops.set(1, stop(2, StopType.PICKUP, 73, 731, 90, 99_000));
        routes.set(0, new RoutePlan(71, 100, 499_000, stops));
        assertThat(validate(routes).violations()).containsExactly(
                "Kamion A, stanica 2: teret posle stanice je 10,0 LDM, ne 9,0.",
                "Kamion A, stanica 2: deonica je 100000 m, ne 99000 m.",
                "Kamion A: dužina rute je 500000 m, ne 499000 m.");
    }

    @Test
    void reportsMissingShipmentsWrongLocationsAndWrongTotals() {
        List<RoutePlan> routes = List.of(new RoutePlan(71, 100, 500_000, List.of(
                stop(1, StopType.PICKUP, 71, 711, 60, 50_000),
                stop(2, StopType.PICKUP, 73, 731, 100, 100_000),
                stop(3, StopType.DELIVERY, 71, 712, 40, 50_000),
                stop(4, StopType.DELIVERY, 73, 999, 0, 200_000))));
        ValidationReport report = validator.validate(Test7Data.input(), result(routes, 2, 1_001_489, List.of(72L)));
        assertThat(report.violations()).containsExactly(
                "Kamion A, stanica 4: S3 se isporučuje na lokaciji #732, ne #999.",
                "Pošiljka S4 je preuzeta 0 i isporučena 0 put(a); očekuje se po jednom.",
                "Broj korišćenih kamiona je 1, ne 2.",
                "Ukupna dužina je 500000 m, ne 1001489 m.");
    }

    @Test
    void reportsAnUnknownTruckAndATruckUsedTwice() {
        List<RoutePlan> routes = new ArrayList<>(expectedRoutes());
        routes.set(1, new RoutePlan(71, 100, 501_489, routes.get(1).stops()));
        routes.add(new RoutePlan(99, 0, 0, List.of()));
        assertThat(validator.validate(Test7Data.input(), result(routes, 2, 1_001_489, List.of())).violations())
                .containsExactly("Kamion A ima više od jedne rute.", "Kamion #99 nije među kamionima ovog posla.");
    }
}
