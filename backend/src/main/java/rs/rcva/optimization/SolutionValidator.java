package rs.rcva.optimization;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import rs.rcva.domain.Model.Location;
import rs.rcva.domain.Model.OptimizationResult;
import rs.rcva.domain.Model.RoutePlan;
import rs.rcva.domain.Model.RouteStop;
import rs.rcva.domain.Model.Shipment;
import rs.rcva.domain.Model.StopType;
import rs.rcva.domain.Model.Truck;
import rs.rcva.domain.Model.ValidationReport;
import rs.rcva.domain.Units;
import rs.rcva.optimization.routing.Assumptions;
import rs.rcva.optimization.routing.DistanceProvider;

/**
 * Checks a result against the job input without using anything from the solver (Spec v2:
 * independent SolutionValidator). It recomputes loads and distances itself, so a bug in the
 * solver model or in building the result shows up as a violation instead of a wrong answer.
 * Messages are shown to users.
 */
public class SolutionValidator {

    private final DistanceProvider distances;

    public SolutionValidator(DistanceProvider distances) {
        this.distances = distances;
    }

    public ValidationReport validate(JobInput input, OptimizationResult result) {
        List<String> violations = new ArrayList<>();
        Map<Long, Shipment> shipments = input.shipmentsById();
        Map<Long, Truck> trucks = input.trucksById();
        Map<Long, Location> locations = input.locationsById();
        Location base = locations.get(input.base().baseLocationId());

        Map<Long, Integer> pickedUp = new HashMap<>();
        Map<Long, Integer> delivered = new HashMap<>();
        Set<Long> usedTrucks = new HashSet<>();
        long totalMeters = 0;
        int trucksUsed = 0;

        for (RoutePlan route : result.routes()) {
            Truck truck = trucks.get(route.truckId());
            String name = truck == null ? "Kamion #" + route.truckId() : truck.name();
            if (truck == null) {
                violations.add(name + " nije među kamionima ovog posla.");
            }
            if (!usedTrucks.add(route.truckId())) {
                violations.add(name + " ima više od jedne rute.");
            }
            if (!route.stops().isEmpty()) {
                trucksUsed++;
            }

            Set<Long> onBoard = new HashSet<>();
            boolean deliveringStarted = false;
            int load = 0;
            int maxLoad = 0;
            long meters = 0;
            Location previous = base;
            for (int i = 0; i < route.stops().size(); i++) {
                RouteStop stop = route.stops().get(i);
                String where = name + ", stanica " + (i + 1);
                if (stop.sequence() != i + 1) {
                    violations.add(where + ": redni broj je " + stop.sequence() + ".");
                }
                Shipment shipment = shipments.get(stop.shipmentId());
                if (shipment == null) {
                    violations.add(where + ": pošiljka #" + stop.shipmentId() + " nije u ovom poslu.");
                    continue;
                }
                String label = shipment.externalId();
                boolean pickup = stop.type() == StopType.PICKUP;
                long expectedLocation = pickup ? shipment.pickupLocationId() : shipment.deliveryLocationId();
                if (stop.locationId() != expectedLocation) {
                    violations.add(where + ": " + label + " se " + (pickup ? "preuzima" : "isporučuje")
                            + " na lokaciji #" + expectedLocation + ", ne #" + stop.locationId() + ".");
                }
                if (pickup) {
                    pickedUp.merge(shipment.id(), 1, Integer::sum);
                    onBoard.add(shipment.id());
                    load += shipment.ldmTenths();
                    if (deliveringStarted && Assumptions.TWO_PHASES_PER_ROUTE) {
                        violations.add(where + ": preuzimanje " + label + " posle prve isporuke (ruta ima dve faze).");
                    }
                } else {
                    delivered.merge(shipment.id(), 1, Integer::sum);
                    if (!onBoard.remove(shipment.id())) {
                        violations.add(where + ": " + label + " se isporučuje pre preuzimanja ili drugim kamionom.");
                    }
                    load -= shipment.ldmTenths();
                    deliveringStarted = true;
                }
                maxLoad = Math.max(maxLoad, load);
                if (stop.loadAfterLdmTenths() != load) {
                    violations.add(where + ": teret posle stanice je " + Units.ldm(load) + " LDM, ne "
                            + Units.ldm(stop.loadAfterLdmTenths()) + ".");
                }
                Location at = locations.get(expectedLocation);
                long leg = distances.meters(previous, at);
                if (stop.legMeters() != leg) {
                    violations.add(where + ": deonica je " + leg + " m, ne " + stop.legMeters() + " m.");
                }
                meters += leg;
                previous = at;
            }
            if (!onBoard.isEmpty()) {
                violations.add(name + ": pošiljke preuzete a neisporučene: " + onBoard.size() + ".");
            }
            if (truck != null && maxLoad > truck.capacityLdmTenths()) {
                violations.add(name + ": teret " + Units.ldm(maxLoad) + " LDM je veći od kapaciteta "
                        + Units.ldm(truck.capacityLdmTenths()) + " LDM.");
            }
            if (route.usedLdmTenths() != maxLoad) {
                violations.add(name + ": najveći teret je " + Units.ldm(maxLoad) + " LDM, ne "
                        + Units.ldm(route.usedLdmTenths()) + ".");
            }
            if (input.base().returnToBase() && !route.stops().isEmpty()) {
                meters += distances.meters(previous, base);
            }
            if (route.totalMeters() != meters) {
                violations.add(name + ": dužina rute je " + meters + " m, ne " + route.totalMeters() + " m.");
            }
            totalMeters += meters;
        }

        Set<Long> unassigned = new HashSet<>(result.unassignedShipmentIds());
        for (Shipment shipment : input.shipments()) {
            int p = pickedUp.getOrDefault(shipment.id(), 0);
            int d = delivered.getOrDefault(shipment.id(), 0);
            boolean listedUnassigned = unassigned.contains(shipment.id());
            if (listedUnassigned ? p + d > 0 : p != 1 || d != 1) {
                violations.add("Pošiljka " + shipment.externalId() + " je preuzeta " + p + " i isporučena " + d
                        + " put(a)" + (listedUnassigned ? ", a navedena je kao nedodeljena." : "; očekuje se po jednom."));
            }
        }
        if (result.trucksUsed() != trucksUsed) {
            violations.add("Broj korišćenih kamiona je " + trucksUsed + ", ne " + result.trucksUsed() + ".");
        }
        if (result.totalMeters() != totalMeters) {
            violations.add("Ukupna dužina je " + totalMeters + " m, ne " + result.totalMeters() + " m.");
        }
        return new ValidationReport(violations.isEmpty(), List.copyOf(violations));
    }
}
