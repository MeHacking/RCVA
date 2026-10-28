package rs.rcva.optimization.solver;

import ai.timefold.solver.core.api.domain.common.PlanningId;
import java.util.List;
import rs.rcva.optimization.routing.RoutePlanner;

/** A truck the solver may use (problem fact). */
public class Vehicle {

    @PlanningId
    private Long truckId;
    private int capacityLdmTenths;
    private RoutePlanner planner;

    public Vehicle() {
    }

    public Vehicle(long truckId, int capacityLdmTenths, RoutePlanner planner) {
        this.truckId = truckId;
        this.capacityLdmTenths = capacityLdmTenths;
        this.planner = planner;
    }

    public Long getTruckId() {
        return truckId;
    }

    public int getCapacityLdmTenths() {
        return capacityLdmTenths;
    }

    /** Length of the best route for these shipments on this truck. */
    public long routeMeters(List<ShipmentAssignment> shipments) {
        return planner.meters(shipments.stream().mapToInt(ShipmentAssignment::getIndex).toArray());
    }

    @Override
    public String toString() {
        return "Vehicle " + truckId;
    }
}
