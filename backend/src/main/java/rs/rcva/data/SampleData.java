package rs.rcva.data;

import java.util.List;
import rs.rcva.domain.Model.BaseSettings;
import rs.rcva.domain.Model.GeocodeStatus;
import rs.rcva.domain.Model.Location;
import rs.rcva.domain.Model.Shipment;
import rs.rcva.domain.Model.Truck;

/**
 * Starting data until there is a database: the same "small" data set as the frontend mock
 * (frontend/src/fixtures/smallScenario.ts), with the same ids, so the parts of the frontend
 * that still run on the mock (optimization, import) refer to the same shipments and trucks.
 * Keep both in sync until the mock goes away. Coordinates are approximate city centres.
 */
final class SampleData {

    private SampleData() {
    }

    static List<Location> locations() {
        return List.of(
                location(1, "Beograd – magacin", "RS", "11000", 44.8125, 20.4612),
                location(2, "Subotica", "RS", "24000", 46.1003, 19.6658),
                location(3, "Kragujevac", "RS", "34000", 44.0128, 20.9114),
                location(4, "Leskovac", "RS", "16000", 42.9981, 21.9461),
                location(5, "Ljungby", "SE", "34131", 56.8333, 13.9333),
                location(6, "Stenkullen", "SE", "44361", 57.792, 12.317),
                location(7, "Landskrona", "SE", "26100", 55.8708, 12.8302));
    }

    static List<Shipment> shipments() {
        return List.of(
                new Shipment(101, "S-101", "Paletirana roba", 40, 2, 5, false, 3200.0, null, null, null),
                new Shipment(102, "S-102", "Nameštaj", 35, 1, 5, false, 2100.0, null, null, null),
                new Shipment(103, "S-103", "Mašinski delovi", 60, 3, 6, false, 5400.0, 6000, 2400, 2200),
                new Shipment(104, "S-104", "Ambalaža", 50, 1, 7, false, 4100.0, null, null, null),
                new Shipment(105, "S-105", "Tekstil", 24, 4, 7, false, 1500.0, null, null, null));
    }

    static List<Truck> trucks() {
        return List.of(
                new Truck(1, "Šleper 1", 136, true, 13600, 2480, 2700),
                new Truck(2, "Šleper 2", 136, true, 13600, 2480, 2700),
                new Truck(3, "Solo 1", 70, false, 7000, 2480, 2600));
    }

    static BaseSettings base() {
        return new BaseSettings(1, true);
    }

    private static Location location(long id, String name, String country, String postalCode, double lat, double lon) {
        return new Location(id, name, null, country, postalCode, lat, lon, GeocodeStatus.OK);
    }
}
