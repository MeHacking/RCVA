package rs.rcva.optimization.routing;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Orders the stops of one truck under {@link Assumptions#TWO_PHASES_PER_ROUTE}: start at
 * the base, all pickups, then all deliveries, then back to the base if
 * {@code returnToBase}. The solver only decides which shipments go on which truck; this
 * class gives the shortest order for that set:
 * <ul>
 * <li>up to {@value #EXACT_LIMIT} shipments exactly (Held-Karp dynamic programming over
 * the pickups from the base and over the deliveries back to the base);</li>
 * <li>above that with nearest neighbour plus 2-opt inside each phase (not guaranteed
 * optimal).</li>
 * </ul>
 * Shipments and locations are indices into the arrays and the distance matrix given to the
 * constructor. Results are cached per set of shipments. Not thread-safe: one per job.
 */
public final class RoutePlanner {

    public static final int EXACT_LIMIT = 9;

    private static final long INF = Long.MAX_VALUE / 4;
    private static final int CACHE_LIMIT = 200_000;

    /** {@code pickups} and {@code deliveries} are shipment indices in visiting order. */
    public record Route(int[] pickups, int[] deliveries, long meters) {
    }

    private final long[][] distance;
    private final int base;
    private final boolean returnToBase;
    private final int[] pickupLocation;
    private final int[] deliveryLocation;
    private final int exactLimit;
    private final Map<Key, Long> metersCache = new HashMap<>();

    /**
     * @param distance metres between location indices
     * @param pickupLocation location index of each shipment's pickup
     * @param deliveryLocation location index of each shipment's delivery
     */
    public RoutePlanner(long[][] distance, int base, boolean returnToBase, int[] pickupLocation, int[] deliveryLocation) {
        this(distance, base, returnToBase, pickupLocation, deliveryLocation, EXACT_LIMIT);
    }

    /** {@code exactLimit}: tests compare the heuristic with the exact order on the same data. */
    RoutePlanner(long[][] distance, int base, boolean returnToBase, int[] pickupLocation, int[] deliveryLocation,
            int exactLimit) {
        this.exactLimit = exactLimit;
        this.distance = distance;
        this.base = base;
        this.returnToBase = returnToBase;
        this.pickupLocation = pickupLocation.clone();
        this.deliveryLocation = deliveryLocation.clone();
    }

    /** Length of the best route found for these shipments (order of the argument does not matter). */
    public long meters(int[] shipments) {
        Key key = Key.of(shipments);
        Long cached = metersCache.get(key);
        if (cached != null) {
            return cached;
        }
        if (metersCache.size() >= CACHE_LIMIT) {
            metersCache.clear();
        }
        long meters = plan(key.sorted).meters();
        metersCache.put(key, meters);
        return meters;
    }

    public Route plan(int[] shipments) {
        int[] sorted = Key.of(shipments).sorted;
        if (sorted.length == 0) {
            return new Route(new int[0], new int[0], 0);
        }
        return sorted.length <= exactLimit ? exact(sorted) : heuristic(sorted);
    }

    /** Length of a route with this order, by the same rules (used by tests and the heuristic). */
    public long length(int[] pickups, int[] deliveries) {
        long meters = 0;
        int at = base;
        for (int s : pickups) {
            meters += distance[at][pickupLocation[s]];
            at = pickupLocation[s];
        }
        for (int s : deliveries) {
            meters += distance[at][deliveryLocation[s]];
            at = deliveryLocation[s];
        }
        return meters + endCost(at);
    }

    private long endCost(int location) {
        return returnToBase ? distance[location][base] : 0;
    }

    private Route exact(int[] shipments) {
        int n = shipments.length;
        int full = (1 << n) - 1;
        int[] p = new int[n];
        int[] d = new int[n];
        for (int i = 0; i < n; i++) {
            p[i] = pickupLocation[shipments[i]];
            d[i] = deliveryLocation[shipments[i]];
        }

        // toPickup[mask][i]: from the base through the pickups in mask, ending at pickup i
        long[][] toPickup = new long[1 << n][n];
        for (long[] row : toPickup) {
            Arrays.fill(row, INF);
        }
        for (int i = 0; i < n; i++) {
            toPickup[1 << i][i] = distance[base][p[i]];
        }
        for (int mask = 1; mask <= full; mask++) {
            for (int i = 0; i < n; i++) {
                long cost = toPickup[mask][i];
                if (cost >= INF || (mask & (1 << i)) == 0) {
                    continue;
                }
                for (int j = 0; j < n; j++) {
                    if ((mask & (1 << j)) == 0) {
                        int next = mask | (1 << j);
                        toPickup[next][j] = Math.min(toPickup[next][j], cost + distance[p[i]][p[j]]);
                    }
                }
            }
        }

        // fromDelivery[mask][i]: from delivery i through the deliveries in mask to the end
        long[][] fromDelivery = new long[1 << n][n];
        for (long[] row : fromDelivery) {
            Arrays.fill(row, INF);
        }
        for (int i = 0; i < n; i++) {
            fromDelivery[1 << i][i] = endCost(d[i]);
        }
        for (int mask = 1; mask <= full; mask++) {
            for (int i = 0; i < n; i++) {
                if ((mask & (1 << i)) == 0 || Integer.bitCount(mask) == 1) {
                    continue;
                }
                int rest = mask & ~(1 << i);
                long best = INF;
                for (int j = 0; j < n; j++) {
                    if ((rest & (1 << j)) != 0) {
                        best = Math.min(best, distance[d[i]][d[j]] + fromDelivery[rest][j]);
                    }
                }
                fromDelivery[mask][i] = best;
            }
        }

        long best = INF;
        int lastPickup = -1;
        int firstDelivery = -1;
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                long cost = toPickup[full][i] + distance[p[i]][d[j]] + fromDelivery[full][j];
                if (cost < best) {
                    best = cost;
                    lastPickup = i;
                    firstDelivery = j;
                }
            }
        }

        // Walk the tables back to recover the order.
        int[] pickups = new int[n];
        int mask = full;
        int current = lastPickup;
        for (int position = n - 1; position >= 0; position--) {
            pickups[position] = shipments[current];
            int rest = mask & ~(1 << current);
            if (rest == 0) {
                break;
            }
            for (int j = 0; j < n; j++) {
                if ((rest & (1 << j)) != 0 && toPickup[rest][j] + distance[p[j]][p[current]] == toPickup[mask][current]) {
                    mask = rest;
                    current = j;
                    break;
                }
            }
        }
        int[] deliveries = new int[n];
        mask = full;
        current = firstDelivery;
        for (int position = 0; position < n; position++) {
            deliveries[position] = shipments[current];
            int rest = mask & ~(1 << current);
            if (rest == 0) {
                break;
            }
            for (int j = 0; j < n; j++) {
                if ((rest & (1 << j)) != 0 && distance[d[current]][d[j]] + fromDelivery[rest][j] == fromDelivery[mask][current]) {
                    mask = rest;
                    current = j;
                    break;
                }
            }
        }
        return new Route(pickups, deliveries, best);
    }

    private Route heuristic(int[] shipments) {
        int[] pickups = nearestNeighbour(shipments, base, pickupLocation);
        int[] deliveries = nearestNeighbour(shipments, pickupLocation[pickups[pickups.length - 1]], deliveryLocation);
        long best = length(pickups, deliveries);
        boolean improved = true;
        while (improved) {
            improved = false;
            for (int[] segment : List.of(pickups, deliveries)) {
                for (int i = 0; i < segment.length - 1; i++) {
                    for (int j = i + 1; j < segment.length; j++) {
                        reverse(segment, i, j);
                        long candidate = length(pickups, deliveries);
                        if (candidate < best) {
                            best = candidate;
                            improved = true;
                        } else {
                            reverse(segment, i, j);
                        }
                    }
                }
            }
        }
        return new Route(pickups, deliveries, best);
    }

    private int[] nearestNeighbour(int[] shipments, int start, int[] location) {
        List<Integer> left = new ArrayList<>(Arrays.stream(shipments).boxed().toList());
        int[] order = new int[shipments.length];
        int at = start;
        for (int position = 0; position < order.length; position++) {
            int from = at;
            Integer next = left.stream().min((a, b) -> Long.compare(distance[from][location[a]], distance[from][location[b]]))
                    .orElseThrow();
            left.remove(next);
            order[position] = next;
            at = location[next];
        }
        return order;
    }

    private static void reverse(int[] array, int from, int to) {
        for (int i = from, j = to; i < j; i++, j--) {
            int tmp = array[i];
            array[i] = array[j];
            array[j] = tmp;
        }
    }

    /** A set of shipments: sorted copy, compared by content. */
    private record Key(int[] sorted) {

        static Key of(int[] shipments) {
            int[] sorted = shipments.clone();
            Arrays.sort(sorted);
            return new Key(sorted);
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof Key key && Arrays.equals(sorted, key.sorted);
        }

        @Override
        public int hashCode() {
            return Arrays.hashCode(sorted);
        }

        @Override
        public String toString() {
            return Arrays.toString(sorted);
        }
    }
}
