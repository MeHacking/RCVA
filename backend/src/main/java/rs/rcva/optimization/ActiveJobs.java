package rs.rcva.optimization;

import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * Which optimization job is queued or running, if any. Trucks must not be removed while a
 * job may use them (dopuna 1, section 2.1). Until the Timefold part exists there are never
 * active jobs; the solver integration replaces this implementation.
 */
public interface ActiveJobs {

    Optional<Long> activeJobId();

    @Component
    class NoSolverYet implements ActiveJobs {
        @Override
        public Optional<Long> activeJobId() {
            return Optional.empty();
        }
    }
}
