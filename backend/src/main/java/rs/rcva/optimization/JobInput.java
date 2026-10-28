package rs.rcva.optimization;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import rs.rcva.domain.Model.BaseSettings;
import rs.rcva.domain.Model.Location;
import rs.rcva.domain.Model.Shipment;
import rs.rcva.domain.Model.Truck;

/**
 * The input of one job as it was when the job was created (Spec v2: inputSnapshot), so
 * later edits do not change a running job or a finished result. {@code trucks} are only
 * the trucks the solver may use (selected and available).
 */
public record JobInput(List<Shipment> shipments, List<Truck> trucks, List<Location> locations, BaseSettings base) {

    public JobInput {
        shipments = List.copyOf(shipments);
        trucks = List.copyOf(trucks);
        locations = List.copyOf(locations);
    }

    public Map<Long, Location> locationsById() {
        return locations.stream().collect(Collectors.toMap(Location::id, Function.identity()));
    }

    public Map<Long, Shipment> shipmentsById() {
        return shipments.stream().collect(Collectors.toMap(Shipment::id, Function.identity()));
    }

    public Map<Long, Truck> trucksById() {
        return trucks.stream().collect(Collectors.toMap(Truck::id, Function.identity()));
    }
}
