package rs.rcva.data;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.LongFunction;
import java.util.stream.LongStream;
import org.springframework.stereotype.Component;
import rs.rcva.domain.Model.BaseSettings;
import rs.rcva.domain.Model.Location;
import rs.rcva.domain.Model.Shipment;
import rs.rcva.domain.Model.Truck;
import rs.rcva.domain.Model.TruckInput;

/**
 * Data kept in memory until PostgreSQL (Spec v2: memory is enough for the first prototype).
 * Starts with {@link SampleData}; a restart resets everything. Insertion order is kept.
 */
@Component
public class InMemoryStore {

    private final Map<Long, Truck> trucks = new LinkedHashMap<>();
    private final List<Shipment> shipments;
    private final List<Location> locations;
    private final BaseSettings base;
    private long nextTruckId;

    public InMemoryStore() {
        SampleData.trucks().forEach(t -> trucks.put(t.id(), t));
        shipments = new ArrayList<>(SampleData.shipments());
        locations = new ArrayList<>(SampleData.locations());
        base = SampleData.base();
        nextTruckId = trucks.keySet().stream().mapToLong(Long::longValue).max().orElse(0) + 1;
    }

    public synchronized List<Truck> trucks() {
        return new ArrayList<>(trucks.values());
    }

    public synchronized Optional<Truck> truck(long id) {
        return Optional.ofNullable(trucks.get(id));
    }

    /** Expects validated input. */
    public synchronized Truck addTruck(TruckInput input) {
        Truck truck = toTruck(nextTruckId++, input);
        trucks.put(truck.id(), truck);
        return truck;
    }

    /** Expects validated input; empty when the truck does not exist. */
    public synchronized Optional<Truck> replaceTruck(long id, TruckInput input) {
        if (!trucks.containsKey(id)) {
            return Optional.empty();
        }
        Truck truck = toTruck(id, input);
        trucks.put(id, truck);
        return Optional.of(truck);
    }

    public synchronized boolean removeTruck(long id) {
        return trucks.remove(id) != null;
    }

    public synchronized List<Shipment> shipments() {
        return List.copyOf(shipments);
    }

    /** {@code create} gets the next free id. */
    public synchronized Shipment addShipment(LongFunction<Shipment> create) {
        Shipment shipment = create.apply(nextId(shipments.stream().mapToLong(Shipment::id)));
        shipments.add(shipment);
        return shipment;
    }

    public synchronized List<Location> locations() {
        return List.copyOf(locations);
    }

    /** {@code create} gets the next free id. */
    public synchronized Location addLocation(LongFunction<Location> create) {
        Location location = create.apply(nextId(locations.stream().mapToLong(Location::id)));
        locations.add(location);
        return location;
    }

    public BaseSettings base() {
        return base;
    }

    private static long nextId(LongStream ids) {
        return ids.max().orElse(0) + 1;
    }

    private static Truck toTruck(long id, TruckInput input) {
        return new Truck(
                id,
                input.name().trim(),
                input.capacityLdmTenths(),
                input.available() == null || input.available(),
                input.innerLengthMm(),
                input.innerWidthMm(),
                input.innerHeightMm());
    }
}
