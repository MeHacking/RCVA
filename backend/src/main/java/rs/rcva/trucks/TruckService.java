package rs.rcva.trucks;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import rs.rcva.api.ApiException;
import rs.rcva.data.InMemoryStore;
import rs.rcva.domain.Model.Truck;
import rs.rcva.domain.Model.TruckInput;
import rs.rcva.optimization.ActiveJobs;

/** Trucks: list, add, change, remove. Messages match the frontend mock (src/api/mock/mockClient.ts). */
@Service
public class TruckService {

    private final InMemoryStore store;
    private final ActiveJobs activeJobs;

    public TruckService(InMemoryStore store, ActiveJobs activeJobs) {
        this.store = store;
        this.activeJobs = activeJobs;
    }

    public List<Truck> list() {
        return store.trucks();
    }

    public Truck get(long id) {
        return store.truck(id).orElseThrow(() -> missing(id));
    }

    public Truck create(TruckInput input) {
        validate(input);
        return store.addTruck(input);
    }

    public Truck update(long id, TruckInput input) {
        get(id);
        validate(input);
        return store.replaceTruck(id, input).orElseThrow(() -> missing(id));
    }

    /** 409 while a job is queued or running; finished results keep their own snapshot. */
    public void delete(long id) {
        get(id);
        activeJobs.activeJobId().ifPresent(jobId -> {
            throw new ApiException(HttpStatus.CONFLICT, "Kamion se koristi",
                    "Optimizacija #" + jobId + " je u toku; kamion se može ukloniti kada se završi.");
        });
        if (!store.removeTruck(id)) {
            throw missing(id);
        }
    }

    static void validate(TruckInput input) {
        Map<String, String> errors = new LinkedHashMap<>();
        if (input == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Neispravni podaci o kamionu", "Telo zahteva nedostaje.");
        }
        if (input.name() == null || input.name().isBlank()) {
            errors.put("name", "Naziv je obavezan.");
        }
        if (input.capacityLdmTenths() == null || input.capacityLdmTenths() <= 0) {
            errors.put("capacityLdmTenths", "Kapacitet mora biti veći od 0.");
        }
        checkDimension(errors, "innerLengthMm", input.innerLengthMm());
        checkDimension(errors, "innerWidthMm", input.innerWidthMm());
        checkDimension(errors, "innerHeightMm", input.innerHeightMm());
        if (!errors.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Neispravni podaci o kamionu", null, errors);
        }
    }

    private static void checkDimension(Map<String, String> errors, String field, Integer value) {
        if (value != null && value <= 0) {
            errors.put(field, "Mora biti pozitivan ceo broj.");
        }
    }

    private static ApiException missing(long id) {
        return ApiException.notFound("Kamion " + id + " ne postoji.");
    }
}
