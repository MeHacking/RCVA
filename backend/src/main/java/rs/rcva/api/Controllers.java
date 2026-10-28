package rs.rcva.api;

import java.net.URI;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import rs.rcva.data.InMemoryStore;
import rs.rcva.domain.Model.BaseSettings;
import rs.rcva.domain.Model.Location;
import rs.rcva.domain.Model.Shipment;
import rs.rcva.domain.Model.Truck;
import rs.rcva.domain.Model.TruckInput;
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
