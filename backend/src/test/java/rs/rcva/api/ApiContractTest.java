package rs.rcva.api;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import rs.rcva.imports.TestWorkbooks;

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

    // --- Excel import (dopuna 1, section 4); invented rows with the shapes of the real file

    private static MockMultipartFile excel(String name, byte[] content) {
        return new MockMultipartFile("file", name, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", content);
    }

    @Test
    @DirtiesContext
    void importsAnExcelFileInFourSteps() throws Exception {
        byte[] workbook = TestWorkbooks.xlsx(new Object[][] {
                {"RELACIJA", "TEŽINA", "DIMENZIJE"},
                {"BEOGRAD 34131 - LJUNGBY", "1,200 kg", "2,4m"},
                {"12345 SODERTALJE", "2,300 kg", 3.2},
        });
        mvc.perform(multipart("/api/v1/imports/excel").file(excel("Relacije oktobar.xlsx", workbook)))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "/api/v1/imports/1"))
                .andExpect(jsonPath("$.importId").value(1))
                .andExpect(jsonPath("$.fileName").value("Relacije oktobar.xlsx"))
                .andExpect(jsonPath("$.sheets[0].name").value("Sheet1"))
                .andExpect(jsonPath("$.sheets[0].rowCount").value(3))
                .andExpect(jsonPath("$.sheets[0].previewRows[2][2]").value("3.2"));

        mvc.perform(get("/api/v1/imports/1/preview"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Mapiranje nije zadato"));
        mvc.perform(put("/api/v1/imports/1/mapping").contentType(MediaType.APPLICATION_JSON).content("""
                        {"sheetName":"Sheet1","headerRow":1,"columns":{"relation":0,"weight":1,"ldm":2}}"""))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/imports/1/preview"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows", hasSize(2)))
                .andExpect(jsonPath("$.rows[0].rowNumber").value(2))
                .andExpect(jsonPath("$.rows[0].externalId").value("Relacije-oktobar-2"))
                .andExpect(jsonPath("$.rows[0].pickup.name").value("Beograd"))
                .andExpect(jsonPath("$.rows[0].pickup.postalCode").value(nullValue()))
                .andExpect(jsonPath("$.rows[0].delivery.postalCode").value("34131"))
                .andExpect(jsonPath("$.rows[0].ldmTenths").value(24))
                .andExpect(jsonPath("$.rows[0].weightKg").value(1200.0))
                .andExpect(jsonPath("$.rows[0].description").value(nullValue()))
                .andExpect(jsonPath("$.rows[0].errors", hasSize(0)))
                .andExpect(jsonPath("$.rows[1].pickup").value(nullValue()))
                .andExpect(jsonPath("$.rows[1].ldmTenths").value(32))
                .andExpect(jsonPath("$.rows[1].errors[0]").value("Nedostaje mesto preuzimanja."));

        mvc.perform(put("/api/v1/imports/1/rows/3").contentType(MediaType.APPLICATION_JSON).content("""
                        {"pickup":{"name":"Subotica","postalCode":null,"country":"rs"}}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pickup.country").value("RS"))
                .andExpect(jsonPath("$.corrected").value(true))
                .andExpect(jsonPath("$.errors", hasSize(0)));

        mvc.perform(post("/api/v1/imports/1/commit"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(2))
                .andExpect(jsonPath("$.skipped").value(0));
        mvc.perform(post("/api/v1/imports/1/commit"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Uvoz je već potvrđen"));

        mvc.perform(get("/api/v1/shipments"))
                .andExpect(jsonPath("$", hasSize(7)))
                .andExpect(jsonPath("$[6].id").value(107))
                .andExpect(jsonPath("$[6].externalId").value("Relacije-oktobar-3"));
        // Ljungby 34131 already exists; a place matches only with the same name and postal code.
        mvc.perform(get("/api/v1/locations"))
                .andExpect(jsonPath("$", hasSize(10)))
                .andExpect(jsonPath("$[7].name").value("Beograd"))
                .andExpect(jsonPath("$[7].geocodeStatus").value("OK"))
                .andExpect(jsonPath("$[8].name").value("Subotica"))
                .andExpect(jsonPath("$[8].geocodeStatus").value("MANUAL"))
                .andExpect(jsonPath("$[9].name").value("Sodertalje"))
                .andExpect(jsonPath("$[9].lat").value(nullValue()))
                .andExpect(jsonPath("$[9].geocodeStatus").value("FAILED"));
    }

    @Test
    void rejectsWrongFilesWithProblemDetails() throws Exception {
        mvc.perform(multipart("/api/v1/imports/excel").file(excel("posiljke.csv", "a;b".getBytes())))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM))
                .andExpect(jsonPath("$.title").value("Nepodržan tip fajla"));
        mvc.perform(multipart("/api/v1/imports/excel").file(excel("pokvaren.xlsx", "nije zip".getBytes())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Fajl nije pročitan"));
        mvc.perform(multipart("/api/v1/imports/excel"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Fajl nedostaje"));
    }

    @Test
    @DirtiesContext
    void validatesMappingAndRowCorrections() throws Exception {
        byte[] workbook = TestWorkbooks.xlsx(new Object[][] {{"RELACIJA", "LDM"}, {"NIS - LUND", "1"}});
        mvc.perform(multipart("/api/v1/imports/excel").file(excel("a.xlsx", workbook))).andExpect(status().isCreated());

        mvc.perform(put("/api/v1/imports/1/mapping").contentType(MediaType.APPLICATION_JSON).content("""
                        {"sheetName":"Sheet1","headerRow":1,"columns":{"relation":0,"pickup":1}}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Neispravno mapiranje kolona"))
                .andExpect(jsonPath("$.errors.ldm").value("Kolona sa LDM je obavezna."))
                .andExpect(jsonPath("$.errors.relation").exists());
        mvc.perform(put("/api/v1/imports/1/mapping").contentType(MediaType.APPLICATION_JSON).content("""
                        {"sheetName":"Sheet1","headerRow":1,"columns":{"relation":0,"ldm":1}}"""))
                .andExpect(status().isOk());

        mvc.perform(put("/api/v1/imports/1/rows/2").contentType(MediaType.APPLICATION_JSON).content("{\"ldmTenths\":2.5}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.ldmTenths").value("LDM mora biti veći od 0."));
        mvc.perform(put("/api/v1/imports/1/rows/9").contentType(MediaType.APPLICATION_JSON).content("{\"excluded\":true}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Red 9 ne postoji."));
        mvc.perform(get("/api/v1/imports/7/preview"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Uvoz 7 ne postoji."));
    }

    // --- Optimization jobs (Spec v2, section 6; dopuna 1, section 3)

    private String waitUntilFinished(long id) throws Exception {
        for (int attempt = 0; attempt < 100; attempt++) {
            String body = mvc.perform(get("/api/v1/optimization-jobs/" + id)).andReturn().getResponse().getContentAsString();
            if (!body.contains("\"QUEUED\"") && !body.contains("\"RUNNING\"")) {
                return body;
            }
            Thread.sleep(200);
        }
        throw new AssertionError("Job " + id + " did not finish");
    }

    @Test
    @DirtiesContext
    void runsAJobAndReturnsAValidatedResult() throws Exception {
        mvc.perform(post("/api/v1/optimization-jobs").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"timeLimitSeconds\":1,\"truckIds\":null,\"shipmentIds\":null}"))
                .andExpect(status().isAccepted())
                .andExpect(header().string("Location", "/api/v1/optimization-jobs/1"))
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.status").value("QUEUED"));

        // A truck cannot be removed while the job may use it.
        mvc.perform(delete("/api/v1/trucks/1"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("Optimizacija #1 je u toku; kamion se može ukloniti kada se završi."));

        waitUntilFinished(1);
        mvc.perform(get("/api/v1/optimization-jobs/1"))
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.infeasibilityKind").value(nullValue()))
                .andExpect(jsonPath("$.timeLimitSeconds").value(1))
                .andExpect(jsonPath("$.scoreHard").value(0))
                .andExpect(jsonPath("$.scoreMedium").value(-2))
                .andExpect(jsonPath("$.feasible").value(true))
                .andExpect(jsonPath("$.trucksLowerBound").value(2))
                .andExpect(jsonPath("$.createdAt").isString());
        mvc.perform(get("/api/v1/optimization-jobs/1/result"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.trucksUsed").value(2))
                .andExpect(jsonPath("$.routes", hasSize(2)))
                .andExpect(jsonPath("$.routes[0].stops[0].sequence").value(1))
                .andExpect(jsonPath("$.routes[0].stops[0].type").value("PICKUP"))
                .andExpect(jsonPath("$.routes[0].stops[0].legMeters").isNumber())
                .andExpect(jsonPath("$.unassignedShipmentIds", hasSize(0)))
                .andExpect(jsonPath("$.validation.passed").value(true))
                .andExpect(jsonPath("$.validation.violations", hasSize(0)));
        mvc.perform(delete("/api/v1/trucks/3")).andExpect(status().isNoContent());
    }

    @Test
    void answersProvenInfeasibilityWith422AndCauses() throws Exception {
        mvc.perform(post("/api/v1/optimization-jobs").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"timeLimitSeconds\":1,\"truckIds\":[1],\"shipmentIds\":null}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM))
                .andExpect(jsonPath("$.title").value("Dokazano neizvodljivo"))
                .andExpect(jsonPath("$.detail").value("Provera pre pokretanja je dokazala da rešenje ne postoji. Solver nije pokrenut."))
                .andExpect(jsonPath("$.infeasibilityKind").value("PROVEN"))
                .andExpect(jsonPath("$.causes[0]").value("Ukupno 20,9 LDM je više od kapaciteta dostupnih kamiona (13,6 LDM)."));
        mvc.perform(post("/api/v1/optimization-jobs").contentType(MediaType.APPLICATION_JSON).content("{\"timeLimitSeconds\":0}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.timeLimitSeconds").value("Vremensko ograničenje mora biti veće od 0."));
        mvc.perform(get("/api/v1/optimization-jobs/42/result"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Posao optimizacije 42 ne postoji."));
    }

    @Test
    void reportsHealth() throws Exception {
        mvc.perform(get("/api/v1/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }
}
