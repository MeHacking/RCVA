package rs.rcva.api;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The HTTP contract the frontend relies on (frontend/src/api/types.ts, docs/specifikacija-v2-dopuna-1.md).
 * Tests that change data reset the context, so every test starts from the sample data.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ApiContractTest {

    private static final MediaType PROBLEM = MediaType.APPLICATION_PROBLEM_JSON;

    @Autowired
    private MockMvc mvc;

    @Test
    void listsTrucksWithTheFrontendFieldNames() throws Exception {
        mvc.perform(get("/api/v1/trucks"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(3)))
                .andExpect(jsonPath("$[0].id").value(1))
                .andExpect(jsonPath("$[0].name").value("Šleper 1"))
                .andExpect(jsonPath("$[0].capacityLdmTenths").value(136))
                .andExpect(jsonPath("$[0].available").value(true))
                .andExpect(jsonPath("$[0].innerLengthMm").value(13600))
                .andExpect(jsonPath("$[0].innerWidthMm").value(2480))
                .andExpect(jsonPath("$[0].innerHeightMm").value(2700));
    }

    @Test
    void listsShipmentsLocationsAndBaseIncludingNulls() throws Exception {
        mvc.perform(get("/api/v1/shipments"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(5)))
                .andExpect(jsonPath("$[0].externalId").value("S-101"))
                .andExpect(jsonPath("$[0].ldmTenths").value(40))
                .andExpect(jsonPath("$[0].pickupLocationId").value(2))
                .andExpect(jsonPath("$[0].deliveryLocationId").value(5))
                .andExpect(jsonPath("$[0].splittable").value(false))
                .andExpect(jsonPath("$[0].weightKg").value(3200.0))
                .andExpect(jsonPath("$[0].lengthMm").value(nullValue()))
                .andExpect(jsonPath("$[2].lengthMm").value(6000));
        mvc.perform(get("/api/v1/locations"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(7)))
                .andExpect(jsonPath("$[4].name").value("Ljungby"))
                .andExpect(jsonPath("$[4].postalCode").value("34131"))
                .andExpect(jsonPath("$[4].address").value(nullValue()))
                .andExpect(jsonPath("$[4].geocodeStatus").value("OK"));
        mvc.perform(get("/api/v1/base"))
                .andExpect(jsonPath("$.baseLocationId").value(1))
                .andExpect(jsonPath("$.returnToBase").value(true));
    }

    @Test
    @DirtiesContext
    void createsATruckWith201AndLocation() throws Exception {
        mvc.perform(post("/api/v1/trucks").contentType(MediaType.APPLICATION_JSON).content("""
                        {"name":"Solo 2","capacityLdmTenths":70,"available":true,
                         "innerLengthMm":null,"innerWidthMm":null,"innerHeightMm":null}"""))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "/api/v1/trucks/4"))
                .andExpect(jsonPath("$.id").value(4))
                .andExpect(jsonPath("$.innerLengthMm").value(nullValue()));
        mvc.perform(get("/api/v1/trucks")).andExpect(jsonPath("$", hasSize(4)));
    }

    @Test
    void answersInvalidInputWithProblemDetailsAndFieldErrors() throws Exception {
        mvc.perform(put("/api/v1/trucks/1").contentType(MediaType.APPLICATION_JSON).content("""
                        {"name":"","capacityLdmTenths":0,"available":true,
                         "innerLengthMm":null,"innerWidthMm":null,"innerHeightMm":null}"""))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.title").value("Neispravni podaci o kamionu"))
                .andExpect(jsonPath("$.errors.name").value("Naziv je obavezan."))
                .andExpect(jsonPath("$.errors.capacityLdmTenths").value("Kapacitet mora biti veći od 0."));
    }

    @Test
    void answersBrokenJsonWith400() throws Exception {
        mvc.perform(post("/api/v1/trucks").contentType(MediaType.APPLICATION_JSON).content("{\"name\":"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM))
                .andExpect(jsonPath("$.title").value("Neispravan zahtev"));
    }

    @Test
    @DirtiesContext
    void deletesWith204ThenAnswers404() throws Exception {
        mvc.perform(delete("/api/v1/trucks/3")).andExpect(status().isNoContent());
        mvc.perform(delete("/api/v1/trucks/3"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM))
                .andExpect(jsonPath("$.title").value("Ne postoji"))
                .andExpect(jsonPath("$.detail").value("Kamion 3 ne postoji."));
    }

    @Test
    void answersAnUnknownPathAsProblemDetails() throws Exception {
        mvc.perform(get("/api/v1/does-not-exist"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM));
    }

    @Test
    void reportsHealth() throws Exception {
        mvc.perform(get("/api/v1/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }
}
