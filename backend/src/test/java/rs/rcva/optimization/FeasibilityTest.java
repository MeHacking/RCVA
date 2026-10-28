package rs.rcva.optimization;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import rs.rcva.domain.Model.Shipment;
import rs.rcva.domain.Model.Truck;

class FeasibilityTest {

    private static final List<Truck> TWO_TRAILERS = List.of(
            new Truck(1, "Šleper 1", 136, true, null, null, null),
            new Truck(2, "Šleper 2", 136, true, null, null, null));

    private static Shipment shipment(long id, String externalId, int ldmTenths) {
        return Test7Data.shipment(id, externalId, ldmTenths, 1, 5);
    }

    /** Test 4: one shipment larger than the largest truck (text as in dopuna 1, section 8). */
    @Test
    void provesAShipmentLargerThanTheLargestTruck() {
        assertThat(Feasibility.provenCauses(List.of(shipment(401, "S-401", 140)), TWO_TRAILERS))
                .containsExactly("Pošiljka S-401 (14,0 LDM) je veća od najvećeg kamiona (13,6 LDM).");
    }

    @Test
    void provesMoreLdmThanTheWholeFleetAndNoTrucks() {
        List<Shipment> shipments = List.of(shipment(1, "A", 130), shipment(2, "B", 130), shipment(3, "C", 20));
        assertThat(Feasibility.provenCauses(shipments, TWO_TRAILERS))
                .containsExactly("Ukupno 28,0 LDM je više od kapaciteta dostupnih kamiona (27,2 LDM).");
        assertThat(Feasibility.provenCauses(shipments, List.of())).containsExactly("Nijedan kamion nije dostupan.");
        assertThat(Feasibility.trucksLowerBound(shipments, TWO_TRAILERS)).isNull();
    }

    /** Test 5b: the total fits, so nothing is proven; the solver has to find out. */
    @Test
    void provesNothingWhenOnlyThePackingFails() {
        List<Shipment> shipments = List.of(shipment(501, "S-501", 70), shipment(502, "S-502", 70), shipment(503, "S-503", 70));
        assertThat(Feasibility.provenCauses(shipments, TWO_TRAILERS)).isEmpty();
        assertThat(Feasibility.trucksLowerBound(shipments, TWO_TRAILERS)).isEqualTo(2);
        assertThat(Feasibility.trucksLowerBound(List.of(), TWO_TRAILERS)).isZero();
    }
}
