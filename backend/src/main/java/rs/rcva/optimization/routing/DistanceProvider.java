package rs.rcva.optimization.routing;

import rs.rcva.domain.Model.Location;

/** Road distance in whole metres. OSRM later; until then {@link HaversineDistanceProvider}. */
@FunctionalInterface
public interface DistanceProvider {

    /** Both locations have coordinates (checked before a job starts). */
    long meters(Location from, Location to);
}
