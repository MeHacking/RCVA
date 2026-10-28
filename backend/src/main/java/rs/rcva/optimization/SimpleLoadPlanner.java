package rs.rcva.optimization;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import rs.rcva.api.ApiException;
import rs.rcva.domain.Model.LoadPlan;
import rs.rcva.domain.Model.LoadPlanMode;
import rs.rcva.domain.Model.OptimizationResult;
import rs.rcva.domain.Model.Placement;
import rs.rcva.domain.Model.RoutePlan;
import rs.rcva.domain.Model.RouteStop;
import rs.rcva.domain.Model.Shipment;
import rs.rcva.domain.Model.StopType;
import rs.rcva.domain.Model.Truck;

/**
 * Load plan for the 3D view (Spec v2, section 7; dopuna 1, section 6): one row of blocks
 * along the cargo length, in pickup order. Not a packing algorithm.
 * <ul>
 * <li>ILLUSTRATIVE_LDM (some shipment has no dimensions): full-width blocks whose length
 * follows LDM (1 LDM = 1000 mm of a full-width trailer).</li>
 * <li>DIMENSIONAL (all shipments have dimensions): the real boxes, side by side.</li>
 * </ul>
 * Same rules and messages as frontend/src/api/mock/loadPlan.ts.
 */
public final class SimpleLoadPlanner {

    private SimpleLoadPlanner() {
    }

    /** {@code truck} and {@code shipments} as in the job's input; 404 no route, 409 no cargo dimensions. */
    public static LoadPlan plan(long jobId, OptimizationResult result, Truck truck, Map<Long, Shipment> shipments) {
        RoutePlan route = result.routes().stream().filter(r -> r.truckId() == truck.id()).findFirst()
                .orElseThrow(() -> ApiException.notFound("Kamion " + truck.id() + " nema rutu u poslu " + jobId + "."));
        Integer innerLength = truck.innerLengthMm();
        Integer innerWidth = truck.innerWidthMm();
        Integer innerHeight = truck.innerHeightMm();
        if (innerLength == null || innerWidth == null || innerHeight == null) {
            throw new ApiException(HttpStatus.CONFLICT, "Nedostaju dimenzije kamiona",
                    "Kamion „" + truck.name() + "“ nema unete dimenzije tovarnog prostora; 3D raspored nije moguć.");
        }

        List<Shipment> loaded = route.stops().stream()
                .filter(stop -> stop.type() == StopType.PICKUP)
                .map(RouteStop::shipmentId)
                .map(shipments::get)
                .toList();
        boolean dimensional = loaded.stream().allMatch(s -> s.lengthMm() != null && s.widthMm() != null && s.heightMm() != null);

        List<Placement> placements = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        int x = 0;
        for (Shipment shipment : loaded) {
            int length = dimensional ? shipment.lengthMm() : shipment.ldmTenths() * 100;
            int width = dimensional ? shipment.widthMm() : innerWidth;
            int height = Math.min(shipment.heightMm() != null ? shipment.heightMm() : innerHeight, innerHeight);
            placements.add(new Placement(shipment.id(), x, 0, 0, length, width, height, false));
            if (width > innerWidth) {
                warnings.add("Pošiljka " + shipment.externalId() + " je šira od tovarnog prostora.");
            }
            x += length;
        }
        if (x > innerLength) {
            warnings.add("Raspored je duži od tovarnog prostora (" + x + " mm > " + innerLength + " mm).");
        }
        return new LoadPlan(jobId, truck.id(), dimensional ? LoadPlanMode.DIMENSIONAL : LoadPlanMode.ILLUSTRATIVE_LDM,
                List.copyOf(placements), List.copyOf(warnings));
    }
}
