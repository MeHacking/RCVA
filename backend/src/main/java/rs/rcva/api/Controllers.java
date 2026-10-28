package rs.rcva.api;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.util.List;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import rs.rcva.data.InMemoryStore;
import rs.rcva.domain.Model.BaseSettings;
import rs.rcva.domain.Model.ImportCommitResult;
import rs.rcva.domain.Model.ImportCreated;
import rs.rcva.domain.Model.ImportMapping;
import rs.rcva.domain.Model.ImportPreview;
import rs.rcva.domain.Model.ImportRow;
import rs.rcva.domain.Model.ImportRowPatch;
import rs.rcva.domain.Model.LoadPlan;
import rs.rcva.domain.Model.Location;
import rs.rcva.domain.Model.OptimizationJob;
import rs.rcva.domain.Model.OptimizationJobCreated;
import rs.rcva.domain.Model.OptimizationJobRequest;
import rs.rcva.domain.Model.OptimizationResult;
import rs.rcva.domain.Model.Shipment;
import rs.rcva.domain.Model.Truck;
import rs.rcva.domain.Model.TruckInput;
import rs.rcva.imports.ImportService;
import rs.rcva.optimization.OptimizationService;
import rs.rcva.trucks.TruckService;

/** REST API under /api/v1 (Specifikacija v2, section 6). */
final class Controllers {

    private Controllers() {
    }

    @RestController
    @RequestMapping("/api/v1/trucks")
    static class TruckController {

        private final TruckService trucks;

        TruckController(TruckService trucks) {
            this.trucks = trucks;
        }

        @GetMapping
        List<Truck> list() {
            return trucks.list();
        }

        @GetMapping("/{id}")
        Truck get(@PathVariable long id) {
            return trucks.get(id);
        }

        @PostMapping
        ResponseEntity<Truck> create(@RequestBody(required = false) TruckInput input) {
            Truck created = trucks.create(input);
            return ResponseEntity.created(URI.create("/api/v1/trucks/" + created.id())).body(created);
        }

        @PutMapping("/{id}")
        Truck update(@PathVariable long id, @RequestBody(required = false) TruckInput input) {
            return trucks.update(id, input);
        }

        @DeleteMapping("/{id}")
        ResponseEntity<Void> delete(@PathVariable long id) {
            trucks.delete(id);
            return ResponseEntity.noContent().build();
        }
    }

    /** Excel import in four steps (dopuna 1, section 4). */
    @RestController
    @RequestMapping("/api/v1/imports")
    static class ImportController {

        private final ImportService imports;

        ImportController(ImportService imports) {
            this.imports = imports;
        }

        @PostMapping(path = "/excel", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
        ResponseEntity<ImportCreated> create(@RequestParam("file") MultipartFile file) throws IOException {
            try (InputStream content = file.getInputStream()) {
                ImportCreated created = imports.create(file.getOriginalFilename(), content);
                return ResponseEntity.created(URI.create("/api/v1/imports/" + created.importId())).body(created);
            }
        }

        @PutMapping("/{id}/mapping")
        ResponseEntity<Void> setMapping(@PathVariable long id, @RequestBody(required = false) ImportMapping mapping) {
            imports.setMapping(id, mapping);
            return ResponseEntity.ok().build();
        }

        @GetMapping("/{id}/preview")
        ImportPreview preview(@PathVariable long id) {
            return imports.preview(id);
        }

        @PutMapping("/{id}/rows/{rowNumber}")
        ImportRow updateRow(@PathVariable long id, @PathVariable int rowNumber,
                @RequestBody(required = false) ImportRowPatch patch) {
            return imports.updateRow(id, rowNumber, patch);
        }

        @PostMapping("/{id}/commit")
        ImportCommitResult commit(@PathVariable long id) {
            return imports.commit(id);
        }
    }

    /** Optimization jobs (Spec v2, section 6; dopuna 1, section 3). */
    @RestController
    @RequestMapping("/api/v1/optimization-jobs")
    static class OptimizationController {

        private final OptimizationService optimization;

        OptimizationController(OptimizationService optimization) {
            this.optimization = optimization;
        }

        /** 202 Accepted: the job runs in the background; poll GET /optimization-jobs/{id}. */
        @PostMapping
        ResponseEntity<OptimizationJobCreated> create(@RequestBody(required = false) OptimizationJobRequest request) {
            OptimizationJobCreated created = optimization.create(request);
            return ResponseEntity.accepted().location(URI.create("/api/v1/optimization-jobs/" + created.id())).body(created);
        }

        @GetMapping("/{id}")
        OptimizationJob get(@PathVariable long id) {
            return optimization.get(id);
        }

        @GetMapping("/{id}/result")
        OptimizationResult result(@PathVariable long id) {
            return optimization.result(id);
        }

        @GetMapping("/{id}/trucks/{truckId}/load-plan")
        LoadPlan loadPlan(@PathVariable long id, @PathVariable long truckId) {
            return optimization.loadPlan(id, truckId);
        }
    }

    @RestController
    @RequestMapping("/api/v1")
    static class ReadOnlyController {

        private final InMemoryStore store;

        ReadOnlyController(InMemoryStore store) {
            this.store = store;
        }

        @GetMapping("/shipments")
        List<Shipment> shipments() {
            return store.shipments();
        }

        @GetMapping("/locations")
        List<Location> locations() {
            return store.locations();
        }

        @GetMapping("/base")
        BaseSettings base() {
            return store.base();
        }

        /** OSRM is not connected yet (Spec v2: health covers the backend and OSRM). */
        @GetMapping("/health")
        Map<String, String> health() {
            return Map.of("status", "UP", "osrm", "NOT_CONFIGURED");
        }
    }
}
