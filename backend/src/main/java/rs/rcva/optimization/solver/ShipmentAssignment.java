package rs.rcva.optimization.solver;

import ai.timefold.solver.core.api.domain.common.PlanningId;
import ai.timefold.solver.core.api.domain.entity.PlanningEntity;
import ai.timefold.solver.core.api.domain.variable.PlanningVariable;

/**
 * The planning decision: which truck carries a shipment. Shipments are not divisible
 * (Spec v2), so every shipment goes on exactly one truck. The order of stops is not
 * planned here; {@link rs.rcva.optimization.routing.RoutePlanner} derives it.
 */
@PlanningEntity
public class ShipmentAssignment {

    @PlanningId
    private Long shipmentId;
    /** index into the RoutePlanner's arrays */
    private int index;
    private int ldmTenths;

    @PlanningVariable
    private Vehicle vehicle;

    public ShipmentAssignment() {
    }

    public ShipmentAssignment(long shipmentId, int index, int ldmTenths) {
        this.shipmentId = shipmentId;
        this.index = index;
        this.ldmTenths = ldmTenths;
    }

    public Long getShipmentId() {
        return shipmentId;
    }

    public int getIndex() {
        return index;
    }

    public int getLdmTenths() {
        return ldmTenths;
    }

    public Vehicle getVehicle() {
        return vehicle;
    }

    public void setVehicle(Vehicle vehicle) {
        this.vehicle = vehicle;
    }

    @Override
    public String toString() {
        return "Shipment " + shipmentId + " -> " + vehicle;
    }
}
