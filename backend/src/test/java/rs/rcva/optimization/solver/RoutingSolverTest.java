package rs.rcva.optimization.solver;

import static org.assertj.core.api.Assertions.assertThat;

import ai.timefold.solver.core.api.score.HardMediumSoftScore;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import rs.rcva.domain.Model.BaseSettings;
import rs.rcva.domain.Model.GeocodeStatus;
import rs.rcva.domain.Model.Location;
import rs.rcva.domain.Model.OptimizationResult;
import rs.rcva.domain.Model.RoutePlan;
import rs.rcva.domain.Model.RouteStop;
import rs.rcva.domain.Model.Shipment;
import rs.rcva.domain.Model.StopType;
import rs.rcva.domain.Model.Truck;
import rs.rcva.optimization.JobInput;
import rs.rcva.optimization.SolutionValidator;
import rs.rcva.optimization.Test7Data;
import rs.rcva.optimization.routing.HaversineDistanceProvider;

class RoutingSolverTest {

    private static String shipmentsPerTruck(OptimizationResult result) {
        return result.routes().stream()
                .map(r -> r.stops().stream().filter(s -> s.type() == StopType.PICKUP)
                        .map(RouteStop::shipmentId).sorted().map(String::valueOf).collect(Collectors.joining("+")))
                .sorted()
                .collect(Collectors.joining(", "));
    }

    /** Test 7 (Spec v2, section 10): 2 trucks, 1 001 489 m, S1+S3 and S2+S4. */
    @Test
    void test7PrefersTwoTrucksOverAShorterRouteWithThree() {
        JobInput input = Test7Data.input();
        RoutingSolver.Outcome outcome = new RoutingSolver(input, Test7Data.PLANAR).solve(Duration.ofSeconds(3));

        assertThat(outcome.score().hardScore()).isZero();
        assertThat(outcome.score().mediumScore()).isEqualTo(-2);
        assertThat(outcome.score().softScore()).isEqualTo(-1_001_489);
        OptimizationResult result = outcome.result();
        assertThat(result.trucksUsed()).isEqualTo(2);
        assertThat(result.trucksLowerBound()).isEqualTo(2);
        assertThat(result.totalMeters()).isEqualTo(1_001_489);
        assertThat(shipmentsPerTruck(result)).isEqualTo("71+73, 72+74");
        assertThat(new SolutionValidator(Test7Data.PLANAR).validate(input, result).violations()).isEmpty();
    }

    /**
     * Test 7, the point of it: 3 trucks (S3+S4, S1, S2) are 921 489 m, shorter than the
     * 2-truck answer, and the score must still prefer 2 trucks. The search test above
     * cannot show this alone: without the trucks-used constraint it also ends at 2 trucks
     * (local optimum), so the scores are compared directly.
     */
    @Test
    void test7ScorePutsFewerTrucksBeforeFewerMetres() {
        RoutingSolver solver = new RoutingSolver(Test7Data.input(), Test7Data.PLANAR);
        HardMediumSoftScore twoTrucks = solver.score(Map.of(71L, 71L, 73L, 71L, 72L, 72L, 74L, 72L));
        HardMediumSoftScore threeTrucks = solver.score(Map.of(73L, 71L, 74L, 71L, 71L, 72L, 72L, 73L));

        assertThat(twoTrucks).isEqualTo(HardMediumSoftScore.of(0, -2, -1_001_489));
        assertThat(threeTrucks).isEqualTo(HardMediumSoftScore.of(0, -3, -921_489));
        assertThat(twoTrucks).isGreaterThan(threeTrucks);
        assertThat(solver.score(Map.of(71L, 71L, 72L, 71L, 73L, 72L, 74L, 72L)).hardScore())
                .as("S1+S2 = 12,0 LDM on a 10,0 truck").isEqualTo(-20);
    }

    /** Test 5b: 3 x 7,0 LDM on 2 x 13,6 LDM fits in total, but no packing exists. */
    @Test
    void test5bEndsWithoutAFeasibleSolution() {
        List<Location> locations = List.of(
                new Location(1, "Beograd – magacin", null, "RS", "11000", 44.8125, 20.4612, GeocodeStatus.OK),
                new Location(5, "Ljungby", null, "SE", "34131", 56.8333, 13.9333, GeocodeStatus.OK));
        List<Shipment> shipments = List.of(
                Test7Data.shipment(501, "S-501", 70, 1, 5),
                Test7Data.shipment(502, "S-502", 70, 1, 5),
                Test7Data.shipment(503, "S-503", 70, 1, 5));
        List<Truck> trucks = List.of(
                new Truck(1, "Šleper 1", 136, true, null, null, null),
                new Truck(2, "Šleper 2", 136, true, null, null, null));
        JobInput input = new JobInput(shipments, trucks, locations, new BaseSettings(1, true));

        RoutingSolver.Outcome outcome = new RoutingSolver(input, new HaversineDistanceProvider()).solve(Duration.ofSeconds(1));
        assertThat(outcome.score().isFeasible()).isFalse();
        assertThat(outcome.result()).isNull();
    }

    /** Invented data of the real file's size: 28 shipments (93,8 LDM), Serbia -> Sweden, 10 trailers. */
    @Test
    void solvesAProblemOfTheRealFilesSizeWithAValidResult() {
        java.util.Random random = new java.util.Random(28);
        List<Location> locations = new java.util.ArrayList<>();
        locations.add(new Location(1, "Baza", null, "RS", null, 44.8125, 20.4612, GeocodeStatus.OK));
        List<Shipment> shipments = new java.util.ArrayList<>();
        int[] ldm = {24, 36, 10, 32, 60, 12, 48, 20, 24, 40, 36, 24, 30, 50, 16, 24, 72, 36, 24, 40, 12, 60, 44, 20, 36, 48, 24, 36};
        for (int i = 0; i < ldm.length; i++) {
            long pickup = 100 + i;
            long delivery = 200 + i;
            locations.add(new Location(pickup, "P" + i, null, "RS", null,
                    43 + random.nextDouble() * 3, 19 + random.nextDouble() * 3, GeocodeStatus.OK));
            locations.add(new Location(delivery, "D" + i, null, "SE", null,
                    55.5 + random.nextDouble() * 4, 12 + random.nextDouble() * 6, GeocodeStatus.OK));
            shipments.add(Test7Data.shipment(1000 + i, "X-" + i, ldm[i], pickup, delivery));
        }
        List<Truck> trucks = java.util.stream.IntStream.rangeClosed(1, 10)
                .mapToObj(i -> new Truck(i, "Šleper " + i, 136, true, null, null, null)).toList();
        JobInput input = new JobInput(shipments, trucks, locations, new BaseSettings(1, true));

        HaversineDistanceProvider distances = new HaversineDistanceProvider();
        RoutingSolver.Outcome outcome = new RoutingSolver(input, distances).solve(Duration.ofSeconds(5));
        assertThat(outcome.score().isFeasible()).isTrue();
        assertThat(outcome.result().trucksLowerBound()).isEqualTo(7);
        assertThat(outcome.result().trucksUsed()).isBetween(7, 8);
        assertThat(-outcome.score().softScore()).isEqualTo(outcome.result().totalMeters());
        assertThat(new SolutionValidator(distances).validate(input, outcome.result()).violations()).isEmpty();
    }

    @Test
    void anOpenRouteHasNoReturnLeg() {
        JobInput closed = Test7Data.input();
        JobInput open = new JobInput(closed.shipments(), closed.trucks(), closed.locations(), new BaseSettings(Test7Data.BASE, false));
        OptimizationResult result = new RoutingSolver(open, Test7Data.PLANAR).solve(Duration.ofSeconds(2)).result();

        assertThat(result.trucksUsed()).isEqualTo(2);
        assertThat(new SolutionValidator(Test7Data.PLANAR).validate(open, result).violations()).isEmpty();
        Map<Long, Long> lastLegs = result.routes().stream().collect(Collectors.toMap(RoutePlan::truckId,
                r -> r.stops().stream().mapToLong(RouteStop::legMeters).sum()));
        assertThat(result.routes()).allSatisfy(r -> assertThat(r.totalMeters()).isEqualTo(lastLegs.get(r.truckId())));
    }
}
