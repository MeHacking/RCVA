package rs.rcva.optimization;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import rs.rcva.api.ApiException;
import rs.rcva.data.InMemoryStore;
import rs.rcva.domain.Model.JobStatus;
import rs.rcva.domain.Model.LoadPlan;
import rs.rcva.domain.Model.LoadPlanMode;
import rs.rcva.domain.Model.OptimizationResult;
import rs.rcva.domain.Model.RoutePlan;
import rs.rcva.domain.Model.RouteStop;
import rs.rcva.domain.Model.Shipment;
import rs.rcva.domain.Model.StopType;
import rs.rcva.domain.Model.Truck;
import rs.rcva.domain.Model.ValidationReport;

/** Same cases as the load plan part of frontend/tests/unit/tegoAdapter.test.ts, on the sample data. */
class SimpleLoadPlannerTest {

    private final InMemoryStore store = new InMemoryStore();
    private final Map<Long, Shipment> shipments =
            store.shipments().stream().collect(Collectors.toMap(Shipment::id, Function.identity()));
    private final Truck trailer = store.truck(1).orElseThrow();

    /** Truck 1 picks up S-105, S-103, S-104 (legs and loads do not matter here). */
    private static OptimizationResult result() {
        List<RouteStop> stops = List.of(
                new RouteStop(1, StopType.PICKUP, 105, 4, 0, 0),
                new RouteStop(2, StopType.PICKUP, 103, 3, 0, 0),
                new RouteStop(3, StopType.PICKUP, 104, 1, 0, 0),
                new RouteStop(4, StopType.DELIVERY, 105, 7, 0, 0));
        return new OptimizationResult(JobStatus.COMPLETED, true, 1, 1, 0, List.of(new RoutePlan(1, 0, 0, stops)),
                List.of(), new ValidationReport(true, List.of()));
    }

    private static List<String> rows(LoadPlan plan) {
        return plan.placements().stream()
                .map(p -> p.shipmentId() + " " + p.xMm() + " " + p.lengthMm() + " " + p.widthMm() + " " + p.heightMm())
                .toList();
    }

    @Test
    void isIllustrativeWhenAShipmentHasNoDimensions() {
        LoadPlan plan = SimpleLoadPlanner.plan(1, result(), trailer, shipments);
        assertThat(plan.mode()).isEqualTo(LoadPlanMode.ILLUSTRATIVE_LDM);
        assertThat(rows(plan)).containsExactly(
                "105 0 2400 2480 2700",
                "103 2400 6000 2480 2200", // S-103 has a height of 2200 mm
                "104 8400 5000 2480 2700");
        assertThat(plan.warnings()).isEmpty();
    }

    @Test
    void isDimensionalWhenEveryShipmentOnTheTruckHasDimensions() {
        Map<Long, Shipment> boxes = shipments.values().stream().collect(Collectors.toMap(Shipment::id,
                s -> new Shipment(s.id(), s.externalId(), null, s.ldmTenths(), s.pickupLocationId(), s.deliveryLocationId(),
                        false, null, 1200, 800, 1000)));
        LoadPlan plan = SimpleLoadPlanner.plan(1, result(), trailer, boxes);
        assertThat(plan.mode()).isEqualTo(LoadPlanMode.DIMENSIONAL);
        assertThat(plan.placements()).extracting(p -> p.xMm() + " " + p.lengthMm() + " " + p.widthMm())
                .containsExactly("0 1200 800", "1200 1200 800", "2400 1200 800");
    }

    @Test
    void warnsWhenTheRowIsLongerThanTheCargoSpace() {
        Truck shorter = new Truck(1, "Šleper 1", 136, true, 10000, 2480, 2700);
        assertThat(SimpleLoadPlanner.plan(1, result(), shorter, shipments).warnings())
                .containsExactly("Raspored je duži od tovarnog prostora (13400 mm > 10000 mm).");
    }

    @Test
    void rejectsATruckWithoutCargoDimensionsOrWithoutARoute() {
        Truck noDimensions = new Truck(1, "Šleper 1", 136, true, null, 2480, 2700);
        assertThatThrownBy(() -> SimpleLoadPlanner.plan(1, result(), noDimensions, shipments))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.status().value()).isEqualTo(409);
                    assertThat(e.detail()).isEqualTo("Kamion „Šleper 1“ nema unete dimenzije tovarnog prostora; 3D raspored nije moguć.");
                });
        assertThatThrownBy(() -> SimpleLoadPlanner.plan(1, result(), store.truck(2).orElseThrow(), shipments))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status().value()).isEqualTo(404));
    }
}
