package rs.rcva.domain;

import java.util.List;
import java.util.Map;

/**
 * Domain records, field for field the JSON contract of frontend/src/api/types.ts
 * (Specifikacija v2, section 5; dopuna 1). Units: LDM x 10 as int, millimetres, metres.
 * Nullable fields are boxed types.
 */
public final class Model {

    private Model() {
    }

    public enum GeocodeStatus { OK, MANUAL, FAILED }

    public record Location(
            long id,
            String name,
            String address,
            String country,
            String postalCode,
            Double lat,
            Double lon,
            GeocodeStatus geocodeStatus) {
    }

    public record Shipment(
            long id,
            String externalId,
            String description,
            int ldmTenths,
            long pickupLocationId,
            long deliveryLocationId,
            boolean splittable,
            Double weightKg,
            Integer lengthMm,
            Integer widthMm,
            Integer heightMm) {
    }

    public record Truck(
            long id,
            String name,
            int capacityLdmTenths,
            boolean available,
            Integer innerLengthMm,
            Integer innerWidthMm,
            Integer innerHeightMm) {
    }

    /** Body of POST /trucks and PUT /trucks/{id}; boxed so missing values can be reported. */
    public record TruckInput(
            String name,
            Integer capacityLdmTenths,
            Boolean available,
            Integer innerLengthMm,
            Integer innerWidthMm,
            Integer innerHeightMm) {
    }

    public record BaseSettings(long baseLocationId, boolean returnToBase) {
    }

    public enum JobStatus { QUEUED, RUNNING, COMPLETED, INFEASIBLE, CANCELLED, FAILED }

    /**
     * PROVEN: infeasibility proven before solving (POST returns 422, no job is created).
     * NOT_FOUND: the solver found no feasible solution within the time limit.
     */
    public enum InfeasibilityKind { PROVEN, NOT_FOUND }

    public enum StopType { PICKUP, DELIVERY }

    /** Body of POST /optimization-jobs; null ids = all available trucks / all shipments. */
    public record OptimizationJobRequest(Integer timeLimitSeconds, List<Long> truckIds, List<Long> shipmentIds) {
    }

    /** Body of 202 Accepted from POST /optimization-jobs */
    public record OptimizationJobCreated(long id, JobStatus status) {
    }

    /** GET /optimization-jobs/{id}; times are ISO 8601 */
    public record OptimizationJob(
            long id,
            JobStatus status,
            InfeasibilityKind infeasibilityKind,
            String createdAt,
            String startedAt,
            String finishedAt,
            int timeLimitSeconds,
            Long scoreHard,
            Long scoreMedium,
            Long scoreSoft,
            Boolean feasible,
            Integer trucksLowerBound) {
    }

    /** {@code legMeters}: from the previous stop, or from the base for the first stop */
    public record RouteStop(
            int sequence,
            StopType type,
            long shipmentId,
            long locationId,
            int loadAfterLdmTenths,
            long legMeters) {
    }

    /** {@code totalMeters} includes the return leg to the base, which is not a stop */
    public record RoutePlan(long truckId, int usedLdmTenths, long totalMeters, List<RouteStop> stops) {
    }

    public record ValidationReport(boolean passed, List<String> violations) {
    }

    /** GET /optimization-jobs/{id}/result; {@code validation} comes from SolutionValidator, not the solver */
    public record OptimizationResult(
            JobStatus status,
            boolean feasible,
            int trucksUsed,
            int trucksLowerBound,
            long totalMeters,
            List<RoutePlan> routes,
            List<Long> unassignedShipmentIds,
            ValidationReport validation) {
    }

    public enum LoadPlanMode { ILLUSTRATIVE_LDM, DIMENSIONAL }

    /**
     * Coordinates in mm from a corner of the cargo space: x along the length, y across,
     * z up. Length and width are as placed (after rotation); {@code rotated} is informative.
     */
    public record Placement(long shipmentId, int xMm, int yMm, int zMm, int lengthMm, int widthMm, int heightMm,
            boolean rotated) {
    }

    /** GET /optimization-jobs/{id}/trucks/{truckId}/load-plan (dopuna 1, section 6) */
    public record LoadPlan(long jobId, long truckId, LoadPlanMode mode, List<Placement> placements, List<String> warnings) {
    }

    /** A place as read from the Excel file, before it becomes a Location. */
    public record PlaceGuess(String name, String postalCode, String country) {
    }

    /** {@code previewRows}: first rows as text, for choosing the header row and columns */
    public record ImportSheetInfo(String name, int rowCount, List<List<String>> previewRows) {
    }

    /** 201 from POST /imports/excel */
    public record ImportCreated(long importId, String fileName, List<ImportSheetInfo> sheets) {
    }

    /**
     * Body of PUT /imports/{id}/mapping. {@code headerRow} is the 1-based row holding the
     * column names; {@code columns} maps an import field (externalId, relation, pickup,
     * delivery, deliveryPostalCode, ldm, weight, description) to a 0-based column.
     */
    public record ImportMapping(String sheetName, Integer headerRow, Map<String, Integer> columns) {
    }

    /** One row of the import preview; {@code errors} block the row, {@code warnings} do not. */
    public record ImportRow(
            int rowNumber,
            String sourceText,
            String externalId,
            PlaceGuess pickup,
            PlaceGuess delivery,
            Integer ldmTenths,
            Double weightKg,
            String description,
            List<String> errors,
            List<String> warnings,
            boolean excluded,
            boolean corrected) {
    }

    public record ImportPreview(long importId, String fileName, List<ImportRow> rows) {
    }

    /**
     * Body of PUT /imports/{id}/rows/{rowNumber} (dopuna 1, 4.5); null = not sent.
     * {@code ldmTenths} is a Double so that 2.5 is reported instead of silently truncated.
     */
    public record ImportRowPatch(String externalId, PlaceGuess pickup, PlaceGuess delivery, Double ldmTenths,
            Boolean excluded) {
    }

    /** POST /imports/{id}/commit: valid, non-excluded rows are written, the rest skipped */
    public record ImportCommitResult(int created, int skipped) {
    }
}
