package rs.rcva.optimization.solver;

import static ai.timefold.solver.core.api.score.stream.ConstraintCollectors.sum;
import static ai.timefold.solver.core.api.score.stream.ConstraintCollectors.toList;

import ai.timefold.solver.core.api.score.HardMediumSoftScore;
import ai.timefold.solver.core.api.score.stream.Constraint;
import ai.timefold.solver.core.api.score.stream.ConstraintFactory;
import ai.timefold.solver.core.api.score.stream.ConstraintProvider;

/**
 * Constraints of Spec v2 under {@link rs.rcva.optimization.routing.Assumptions}. With two
 * phases per route the whole load is on the truck at once, so capacity limits the sum of
 * LDM per truck. Pickup before delivery and the phase order hold by construction (the
 * route planner builds the order).
 */
public class RoutingConstraints implements ConstraintProvider {

    @Override
    public Constraint[] defineConstraints(ConstraintFactory factory) {
        return new Constraint[] {capacity(factory), trucksUsed(factory), routeLength(factory)};
    }

    /** hard: LDM tenths over the truck's capacity */
    Constraint capacity(ConstraintFactory factory) {
        return factory.forEach(ShipmentAssignment.class)
                .groupBy(ShipmentAssignment::getVehicle, sum(ShipmentAssignment::getLdmTenths))
                .filter((vehicle, load) -> load > vehicle.getCapacityLdmTenths())
                .penalize(HardMediumSoftScore.ONE_HARD, (vehicle, load) -> load - vehicle.getCapacityLdmTenths())
                .asConstraint("Truck capacity");
    }

    /** medium: one per truck with at least one shipment */
    Constraint trucksUsed(ConstraintFactory factory) {
        return factory.forEach(ShipmentAssignment.class)
                .groupBy(ShipmentAssignment::getVehicle)
                .penalize(HardMediumSoftScore.ONE_MEDIUM)
                .asConstraint("Trucks used");
    }

    /** soft: metres of each used truck's route, from the base and back if returnToBase */
    Constraint routeLength(ConstraintFactory factory) {
        return factory.forEach(ShipmentAssignment.class)
                .groupBy(ShipmentAssignment::getVehicle, toList())
                .penalize(HardMediumSoftScore.ONE_SOFT, Vehicle::routeMeters)
                .asConstraint("Route length");
    }
}
