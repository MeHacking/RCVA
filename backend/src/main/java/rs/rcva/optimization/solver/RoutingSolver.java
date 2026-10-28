package rs.rcva.optimization.solver;

import ai.timefold.solver.core.api.score.HardMediumSoftScore;
import ai.timefold.solver.core.api.solver.SolutionManager;
import ai.timefold.solver.core.api.solver.SolverFactory;
import ai.timefold.solver.core.config.solver.SolverConfig;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import rs.rcva.domain.Model.JobStatus;
import rs.rcva.domain.Model.Location;
import rs.rcva.domain.Model.OptimizationResult;
import rs.rcva.domain.Model.RoutePlan;
import rs.rcva.domain.Model.RouteStop;
import rs.rcva.domain.Model.Shipment;
import rs.rcva.domain.Model.StopType;
import rs.rcva.domain.Model.Truck;
import rs.rcva.domain.Model.ValidationReport;
import rs.rcva.optimization.Feasibility;
import rs.rcva.optimization.JobInput;
import rs.rcva.optimization.routing.DistanceProvider;
import rs.rcva.optimization.routing.RoutePlanner;

/**
 * Runs Timefold on one job input and turns the best solution into an
 * {@link OptimizationResult}. Distances are computed once into a matrix through the
 * {@link DistanceProvider}. The result's {@code validation} is a placeholder; the caller
 * fills it with SolutionValidator.
 */
public final class RoutingSolver {

    /** {@code result} is null when the best solution breaks a hard constraint. */
    public record Outcome(HardMediumSoftScore score, OptimizationResult result) {
    }

    private final JobInput input;
    private final List<Location> locations;
    private final long[][] distance;
    private final RoutePlanner planner;
    private final int base;

    public RoutingSolver(JobInput input, DistanceProvider distances) {
        this.input = input;
        this.locations = input.locations();
        Map<Long, Integer> indexOf = new HashMap<>();
        for (int i = 0; i < locations.size(); i++) {
            indexOf.put(locations.get(i).id(), i);
        }
        distance = new long[locations.size()][locations.size()];
        for (int a = 0; a < locations.size(); a++) {
            for (int b = 0; b < locations.size(); b++) {
                distance[a][b] = a == b ? 0 : distances.meters(locations.get(a), locations.get(b));
            }
        }
        List<Shipment> shipments = input.shipments();
        base = indexOf.get(input.base().baseLocationId());
        planner = new RoutePlanner(distance, base, input.base().returnToBase(),
                shipments.stream().mapToInt(s -> indexOf.get(s.pickupLocationId())).toArray(),
                shipments.stream().mapToInt(s -> indexOf.get(s.deliveryLocationId())).toArray());
    }

    public Outcome solve(Duration timeLimit) {
        RoutingSolution best = SolverFactory.<RoutingSolution>create(config(timeLimit)).buildSolver().solve(problem());
        HardMediumSoftScore score = best.getScore();
        return new Outcome(score, score.isFeasible() ? toResult(best) : null);
    }

    /** Score of a given assignment (shipment id -> truck id), without solving; for tests. */
    public HardMediumSoftScore score(Map<Long, Long> truckOfShipment) {
        RoutingSolution solution = problem();
        Map<Long, Vehicle> vehicles = new HashMap<>();
        solution.getVehicles().forEach(v -> vehicles.put(v.getTruckId(), v));
        solution.getAssignments().forEach(a -> a.setVehicle(vehicles.get(truckOfShipment.get(a.getShipmentId()))));
        return SolutionManager.<RoutingSolution, HardMediumSoftScore>create(
                SolverFactory.create(config(Duration.ofSeconds(1)))).update(solution);
    }

    private RoutingSolution problem() {
        List<Vehicle> vehicles = input.trucks().stream()
                .map(t -> new Vehicle(t.id(), t.capacityLdmTenths(), planner))
                .toList();
        List<ShipmentAssignment> assignments = new ArrayList<>();
        for (int i = 0; i < input.shipments().size(); i++) {
            Shipment shipment = input.shipments().get(i);
            assignments.add(new ShipmentAssignment(shipment.id(), i, shipment.ldmTenths()));
        }
        return new RoutingSolution(vehicles, assignments);
    }

    private static SolverConfig config(Duration timeLimit) {
        return new SolverConfig()
                .withSolutionClass(RoutingSolution.class)
                .withEntityClasses(ShipmentAssignment.class)
                .withConstraintProviderClass(RoutingConstraints.class)
                .withTerminationSpentLimit(timeLimit);
    }

    private OptimizationResult toResult(RoutingSolution solution) {
        Map<Long, List<Integer>> byTruck = new HashMap<>();
        for (ShipmentAssignment assignment : solution.getAssignments()) {
            byTruck.computeIfAbsent(assignment.getVehicle().getTruckId(), id -> new ArrayList<>()).add(assignment.getIndex());
        }
        List<RoutePlan> routes = new ArrayList<>();
        for (Truck truck : input.trucks()) {
            List<Integer> shipments = byTruck.get(truck.id());
            if (shipments != null) {
                routes.add(route(truck, planner.plan(shipments.stream().mapToInt(Integer::intValue).toArray())));
            }
        }
        long totalMeters = routes.stream().mapToLong(RoutePlan::totalMeters).sum();
        Integer lowerBound = Feasibility.trucksLowerBound(input.shipments(), input.trucks());
        return new OptimizationResult(JobStatus.COMPLETED, true, routes.size(),
                lowerBound == null ? routes.size() : lowerBound, totalMeters, routes, List.of(),
                new ValidationReport(true, List.of()));
    }

    private RoutePlan route(Truck truck, RoutePlanner.Route order) {
        List<RouteStop> stops = new ArrayList<>();
        int at = base;
        int load = 0;
        int maxLoad = 0;
        long meters = 0;
        for (StopType type : StopType.values()) {
            for (int index : type == StopType.PICKUP ? order.pickups() : order.deliveries()) {
                Shipment shipment = input.shipments().get(index);
                long locationId = type == StopType.PICKUP ? shipment.pickupLocationId() : shipment.deliveryLocationId();
                int location = indexOf(locationId);
                load += type == StopType.PICKUP ? shipment.ldmTenths() : -shipment.ldmTenths();
                maxLoad = Math.max(maxLoad, load);
                long leg = distance[at][location];
                meters += leg;
                stops.add(new RouteStop(stops.size() + 1, type, shipment.id(), locationId, load, leg));
                at = location;
            }
        }
        if (input.base().returnToBase()) {
            meters += distance[at][base];
        }
        return new RoutePlan(truck.id(), maxLoad, meters, List.copyOf(stops));
    }

    private int indexOf(long locationId) {
        for (int i = 0; i < locations.size(); i++) {
            if (locations.get(i).id() == locationId) {
                return i;
            }
        }
        throw new IllegalArgumentException("Unknown location " + locationId);
    }
}
