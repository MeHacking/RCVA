package rs.rcva.optimization.solver;

import ai.timefold.solver.core.api.domain.solution.PlanningEntityCollectionProperty;
import ai.timefold.solver.core.api.domain.solution.PlanningScore;
import ai.timefold.solver.core.api.domain.solution.PlanningSolution;
import ai.timefold.solver.core.api.domain.solution.ProblemFactCollectionProperty;
import ai.timefold.solver.core.api.domain.valuerange.ValueRangeProvider;
import ai.timefold.solver.core.api.score.HardMediumSoftScore;
import java.util.List;

/**
 * Score (Spec v2): hard = violated constraints, medium = trucks used, soft = metres.
 * Lexicographic: fewer trucks always beats fewer kilometres.
 */
@PlanningSolution
public class RoutingSolution {

    @ProblemFactCollectionProperty
    @ValueRangeProvider
    private List<Vehicle> vehicles;

    @PlanningEntityCollectionProperty
    private List<ShipmentAssignment> assignments;

    @PlanningScore
    private HardMediumSoftScore score;

    public RoutingSolution() {
    }

    public RoutingSolution(List<Vehicle> vehicles, List<ShipmentAssignment> assignments) {
        this.vehicles = vehicles;
        this.assignments = assignments;
    }

    public List<Vehicle> getVehicles() {
        return vehicles;
    }

    public List<ShipmentAssignment> getAssignments() {
        return assignments;
    }

    public HardMediumSoftScore getScore() {
        return score;
    }

    public void setScore(HardMediumSoftScore score) {
        this.score = score;
    }
}
