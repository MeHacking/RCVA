package rs.rcva.optimization.routing;

/**
 * Model assumptions that wait for the process owner's answers (CLAUDE.md, "Otvorena
 * pitanja"). Everything that depends on them reads them from here.
 * <ul>
 * <li>Two phases per route: a truck first picks up all its shipments, then delivers them.
 * Then the whole load is on the truck at once, so capacity limits the sum of LDM per
 * route, and {@link RoutePlanner} orders pickups and deliveries separately.</li>
 * <li>Start and end of a route: every truck starts at the base; whether it returns is
 * {@code BaseSettings.returnToBase} (data, not code).</li>
 * </ul>
 * If an answer differs, {@link RoutePlanner}, the capacity constraint and
 * {@code SolutionValidator} change; the solver model (shipment -> truck) can stay.
 */
public final class Assumptions {

    public static final boolean TWO_PHASES_PER_ROUTE = true;

    private Assumptions() {
    }
}
