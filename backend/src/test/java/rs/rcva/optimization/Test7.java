package rs.rcva.optimization;

import java.util.List;
import java.util.Map;
import rs.rcva.domain.Model.BaseSettings;
import rs.rcva.domain.Model.GeocodeStatus;
import rs.rcva.domain.Model.Location;
import rs.rcva.domain.Model.Shipment;
import rs.rcva.domain.Model.Truck;
import rs.rcva.optimization.routing.DistanceProvider;

/**
 * Test 7 from Specifikacija v2, section 10, as in frontend/src/fixtures/test7Scenario.ts:
 * planar coordinates in km, straight-line distances, return to base. Expected: 2 trucks,
 * 1 001 489 m (S1+S3, S2+S4), although 3 trucks would give 921,5 km.
 */
final class Test7 {

    static final long BASE = 700;

    static final Map<Long, double[]> COORDINATES_KM = Map.of(
            700L, new double[] {0, 0},
            711L, new double[] {-50, 0}, // S1 pickup
            712L, new double[] {100, 0}, // S1 delivery
            721L, new double[] {-50, 10}, // S2 pickup
            722L, new double[] {100, 10}, // S2 delivery
            731L, new double[] {50, 0}, // S3 pickup
            732L, new double[] {-100, 0}, // S3 delivery
            741L, new double[] {50, 10}, // S4 pickup
            742L, new double[] {-100, 10}); // S4 delivery

    /** Straight line between planar points, rounded to whole metres. */
    static final DistanceProvider PLANAR = (from, to) -> {
        double[] a = COORDINATES_KM.get(from.id());
        double[] b = COORDINATES_KM.get(to.id());
        return Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * 1000);
    };

    private Test7() {
    }

    static JobInput input() {
        List<Location> locations = COORDINATES_KM.keySet().stream().sorted()
                .map(id -> new Location(id, "Tačka " + id, null, "XX", null, 0.0, 0.0, GeocodeStatus.OK))
                .toList();
        List<Shipment> shipments = List.of(
                shipment(71, "S1", 60, 711, 712),
                shipment(72, "S2", 60, 721, 722),
                shipment(73, "S3", 40, 731, 732),
                shipment(74, "S4", 40, 741, 742));
        List<Truck> trucks = List.of(truck(71, "Kamion A"), truck(72, "Kamion B"), truck(73, "Kamion C"), truck(74, "Kamion D"));
        return new JobInput(shipments, trucks, locations, new BaseSettings(BASE, true));
    }

    static Shipment shipment(long id, String externalId, int ldmTenths, long pickup, long delivery) {
        return new Shipment(id, externalId, null, ldmTenths, pickup, delivery, false, null, null, null, null);
    }

    private static Truck truck(long id, String name) {
        return new Truck(id, name, 100, true, 10000, 2480, 2700);
    }
}
