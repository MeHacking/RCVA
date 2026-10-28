package rs.rcva.optimization.routing;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Random;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class RoutePlannerTest {

    /** Random planar points (km); location 0 is the base, then a pickup and a delivery per shipment. */
    private record Instance(long[][] distance, int[] pickup, int[] delivery) {

        static Instance random(Random random, int shipments) {
            int locations = 1 + 2 * shipments;
            double[][] xy = new double[locations][];
            for (int i = 0; i < locations; i++) {
                xy[i] = new double[] {random.nextInt(1000), random.nextInt(1000)};
            }
            long[][] distance = new long[locations][locations];
            for (int a = 0; a < locations; a++) {
                for (int b = 0; b < locations; b++) {
                    distance[a][b] = Math.round(Math.hypot(xy[a][0] - xy[b][0], xy[a][1] - xy[b][1]) * 1000);
                }
            }
            return new Instance(distance,
                    IntStream.range(0, shipments).map(s -> 1 + 2 * s).toArray(),
                    IntStream.range(0, shipments).map(s -> 2 + 2 * s).toArray());
        }

        RoutePlanner planner(boolean returnToBase, int exactLimit) {
            return new RoutePlanner(distance, 0, returnToBase, pickup, delivery, exactLimit);
        }
    }

    private static List<int[]> permutations(int[] items) {
        List<int[]> result = new ArrayList<>();
        permute(items.clone(), 0, result);
        return result;
    }

    private static void permute(int[] items, int k, List<int[]> result) {
        if (k == items.length) {
            result.add(items.clone());
            return;
        }
        for (int i = k; i < items.length; i++) {
            int tmp = items[k];
            items[k] = items[i];
            items[i] = tmp;
            permute(items, k + 1, result);
            items[i] = items[k];
            items[k] = tmp;
        }
    }

    private static long bruteForce(RoutePlanner planner, int[] shipments) {
        long best = Long.MAX_VALUE;
        for (int[] pickups : permutations(shipments)) {
            for (int[] deliveries : permutations(shipments)) {
                best = Math.min(best, planner.length(pickups, deliveries));
            }
        }
        return best;
    }

    private static void assertIsAnOrderOf(RoutePlanner.Route route, int[] shipments) {
        int[] sorted = shipments.clone();
        Arrays.sort(sorted);
        assertThat(Arrays.stream(route.pickups()).sorted().toArray()).containsExactly(sorted);
        assertThat(Arrays.stream(route.deliveries()).sorted().toArray()).containsExactly(sorted);
    }

    @Test
    void findsTheShortestTwoPhaseOrderLikeBruteForce() {
        Random random = new Random(7);
        for (int round = 0; round < 40; round++) {
            int n = 1 + round % 5;
            Instance instance = Instance.random(random, n);
            boolean returnToBase = round % 2 == 0;
            RoutePlanner planner = instance.planner(returnToBase, RoutePlanner.EXACT_LIMIT);
            int[] shipments = IntStream.range(0, n).toArray();

            RoutePlanner.Route route = planner.plan(shipments);
            assertIsAnOrderOf(route, shipments);
            assertThat(planner.length(route.pickups(), route.deliveries())).isEqualTo(route.meters());
            assertThat(route.meters()).as("round %d", round).isEqualTo(bruteForce(planner, shipments));
            assertThat(planner.meters(shipments)).isEqualTo(route.meters());
        }
    }

    @Test
    void theHeuristicGivesAValidOrderNotFarFromTheExactOne() {
        Random random = new Random(11);
        for (int round = 0; round < 20; round++) {
            Instance instance = Instance.random(random, 8);
            int[] shipments = IntStream.range(0, 8).toArray();
            long exact = instance.planner(true, RoutePlanner.EXACT_LIMIT).plan(shipments).meters();
            RoutePlanner heuristic = instance.planner(true, 0);
            RoutePlanner.Route route = heuristic.plan(shipments);

            assertIsAnOrderOf(route, shipments);
            assertThat(heuristic.length(route.pickups(), route.deliveries())).isEqualTo(route.meters());
            assertThat(route.meters()).isGreaterThanOrEqualTo(exact).isLessThanOrEqualTo(exact * 13 / 10);
        }
    }

    @Test
    void anEmptyRouteHasNoLength() {
        RoutePlanner planner = Instance.random(new Random(1), 2).planner(true, RoutePlanner.EXACT_LIMIT);
        assertThat(planner.plan(new int[0]).meters()).isZero();
        assertThat(planner.meters(new int[0])).isZero();
    }

    /** Test 7 geometry (km): S1 (-50,0)->(100,0) and S3 (50,0)->(-100,0), base (0,0). */
    @Test
    void ordersTheTest7RouteOfS1AndS3() {
        double[][] xy = {{0, 0}, {-50, 0}, {100, 0}, {50, 0}, {-100, 0}};
        long[][] distance = new long[5][5];
        for (int a = 0; a < 5; a++) {
            for (int b = 0; b < 5; b++) {
                distance[a][b] = Math.round(Math.hypot(xy[a][0] - xy[b][0], xy[a][1] - xy[b][1]) * 1000);
            }
        }
        RoutePlanner planner = new RoutePlanner(distance, 0, true, new int[] {1, 3}, new int[] {2, 4});
        RoutePlanner.Route route = planner.plan(new int[] {0, 1});
        assertThat(route.meters()).isEqualTo(500_000);
        // The mirror image (S3 first, then S1) is just as long; both are optimal.
        String order = Arrays.toString(route.pickups()) + Arrays.toString(route.deliveries());
        assertThat(order).isIn("[0, 1][0, 1]", "[1, 0][1, 0]");
    }
}
