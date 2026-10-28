package rs.rcva.domain;

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
}
