package rs.rcva.optimization;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import rs.rcva.domain.Model.Shipment;
import rs.rcva.domain.Model.Truck;
import rs.rcva.domain.Units;

/**
 * Checks before solving (Spec v2, section 4) under the two-phase assumption: the whole
 * load is on a truck at once. Same rules as frontend/src/domain/capacity.ts, which the
 * dashboard shows as warnings before a job is started. {@code trucks} are the trucks the
 * job may use (selected and available).
 */
public final class Feasibility {

    private Feasibility() {
    }

    /** Reasons the job cannot have a solution; empty when nothing is proven (POST answers 422 otherwise). */
    public static List<String> provenCauses(List<Shipment> shipments, List<Truck> trucks) {
        List<String> causes = new ArrayList<>();
        if (shipments.isEmpty()) {
            return causes;
        }
        if (trucks.isEmpty()) {
            causes.add("Nijedan kamion nije dostupan.");
            return causes;
        }
        int largest = trucks.stream().mapToInt(Truck::capacityLdmTenths).max().orElseThrow();
        for (Shipment shipment : shipments) {
            if (shipment.ldmTenths() > largest) {
                causes.add("Pošiljka " + shipment.externalId() + " (" + Units.ldm(shipment.ldmTenths())
                        + " LDM) je veća od najvećeg kamiona (" + Units.ldm(largest) + " LDM).");
            }
        }
        int total = totalLdm(shipments);
        int capacity = trucks.stream().mapToInt(Truck::capacityLdmTenths).sum();
        if (total > capacity) {
            causes.add("Ukupno " + Units.ldm(total) + " LDM je više od kapaciteta dostupnih kamiona ("
                    + Units.ldm(capacity) + " LDM).");
        }
        return causes;
    }

    /**
     * Lower bound on trucks: the smallest k for which the k largest capacities cover the
     * total LDM; null if the whole fleet is not enough.
     */
    public static Integer trucksLowerBound(List<Shipment> shipments, List<Truck> trucks) {
        int total = totalLdm(shipments);
        List<Integer> capacities = trucks.stream().map(Truck::capacityLdmTenths).sorted(Comparator.reverseOrder()).toList();
        int covered = 0;
        for (int k = 0; k < capacities.size(); k++) {
            if (covered >= total) {
                return k;
            }
            covered += capacities.get(k);
        }
        return covered >= total ? capacities.size() : null;
    }

    private static int totalLdm(List<Shipment> shipments) {
        return shipments.stream().mapToInt(Shipment::ldmTenths).sum();
    }
}
