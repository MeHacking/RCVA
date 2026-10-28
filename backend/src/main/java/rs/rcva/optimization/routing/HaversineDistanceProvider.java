package rs.rcva.optimization.routing;

import org.springframework.stereotype.Component;
import rs.rcva.domain.Model.Location;

/**
 * Great-circle distance from lat/lon: a stand-in for OSRM road distances until OSRM is
 * connected. Same formula as the frontend mock (frontend/src/fixtures/builders.ts).
 */
@Component
public class HaversineDistanceProvider implements DistanceProvider {

    private static final double EARTH_RADIUS_KM = 6371;

    @Override
    public long meters(Location from, Location to) {
        double lat1 = Math.toRadians(from.lat());
        double lat2 = Math.toRadians(to.lat());
        double dLat = lat2 - lat1;
        double dLon = Math.toRadians(to.lon() - from.lon());
        double a = Math.pow(Math.sin(dLat / 2), 2)
                + Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(dLon / 2), 2);
        return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a)) * 1000);
    }
}
