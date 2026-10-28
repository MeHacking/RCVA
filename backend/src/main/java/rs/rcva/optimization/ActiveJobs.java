package rs.rcva.optimization;

import java.util.Optional;

/**
 * Which optimization job is queued or running, if any. Trucks must not be removed while a
 * job may use them (dopuna 1, section 2.1). Implemented by {@link OptimizationService}.
 */
public interface ActiveJobs {

    Optional<Long> activeJobId();
}
