# RCVA: optimizacija utovara i ruta kamiona

Ovaj fajl je radni dnevnik projekta za ljude i za Claude sesije i agente. Claude Code ga
automatski učitava u svakoj sesiji pokrenutoj u `RCVA/` ili ispod. **Ažurirati ga na kraju
svakog većeg koraka** (odeljci „Stanje“ i „Sledeći koraci“).

Poslednje ažuriranje: 28.10.2026, pauza: čeka se odluka o arhitekturi (videti „Gde smo stali“).

## Gde smo stali (28.10.2026)

Rad je **pauziran na zahtev korisnika** dok ne stignu Gojkovi odgovori
(`docs/pitanja-za-vlasnika-procesa.md`). Tada korisnik bira pravac A ili B ispod. **Ne
počinjati ništa od ovoga bez njegove odluke.**

**Zahtevi korisnika o platformi** (dogovoreno u razgovoru):
- Aplikacija radi **na uređaju**: sada na ličnom računaru, kasnije i na telefonu, **bez
  hostinga** i bez postavljanja na internet. Internet samo za pozive ka servisima za
  koordinate i kilometraže.
- Aplikacija za telefon se pravi naknadno i treba da radi **isto što i aplikacija za PC**
  (uvoz, optimizacija, 3D), na samom telefonu.
- Razmotreno i odbačeno: Cloudflare Tunnel + Access (traži domen, oko 10 €/god.) i
  Tailscale (besplatan plan je samo za nekomercijalnu upotrebu). Otvaranje porta na ruteru
  ne dolazi u obzir (nema prijave korisnika).

**Otvorena odluka: A ili B** (Java backend na telefonu ne radi; Timefold i Spring nisu za
Android):
- **A)** PC ostaje na Javi (Spring + Timefold), a telefon se kasnije piše posebno u
  TypeScript-u. Mana: ista logika na dva mesta (uvoz, solver, validator, 3D raspored).
- **B)** (predlog) Jedna TypeScript aplikacija za oba uređaja: logika u frontendu, solver u
  Web Worker-u, podaci u IndexedDB, telefon kao Capacitor (MIT) aplikacija. Java kod ostaje
  kao referenca i test-orakl (isti slučajevi i nasumični primeri moraju dati iste
  rezultate). Mana: sopstveni solver umesto Timefold-a; njegov kvalitet dokazati poređenjem
  sa Timefold-om. Predloženi redosled: 1) geokodiranje i kilometraže u TS, 2) prenos
  `RoutePlanner`-a, validatora i 3D rasporeda, 3) solver, 4) čuvanje na uređaju i
  izvoz/uvoz fajla, 5) pakovanje (PC, pa telefon).
- U oba slučaja podaci na PC-u i telefonu su odvojeni, osim prenosa fajlom.
- Koraci 1 i 2 iz B koriste i putu A.

**Predlog za koordinate i kilometraže** (nije početo):
- Koordinate: javni **Nominatim**, uz poštovanje
  [pravila](https://operations.osmfoundation.org/policies/nominatim/): najviše 1 zahtev/s
  za celu aplikaciju, sopstveni User-Agent, svaki rezultat se trajno čuva i upit se ne
  ponavlja, samo traženje koje pokrene korisnik (uvoz), bez automatskog dopunjavanja,
  mogućnost isključivanja bez nove verzije, navođenje „© OpenStreetMap contributors“.
- Kilometraže: **OpenRouteService** (besplatan ključ, profil za teretna vozila), uz
  čuvanje rastojanja. Besplatna ograničenja se razlikuju po izvorima (500 matrica dnevno ili
  zajednička kvota od oko 8.000 zahteva); **proveriti na nalogu pre upotrebe**, kao i uslove
  za komercijalnu upotrebu. Ključ pravi korisnik i čuva se samo lokalno, nikad u repo-u.
  Ako ORS ne odgovori, posao pada sa jasnom porukom (bez tihe zamene vazdušnom linijom).
- Sopstveni OSRM odbačen: Docker i priprema mape na ličnom računaru su preteški za ovaj obim.
- Pitanje D3 (putevi za kamione ili za automobile) je i dalje otvoreno; od toga zavisi
  ORS profil.

## Šta aplikacija radi

Za zadate pošiljke i flotu kamiona dodeljuje pošiljke kamionima i određuje redosled obilaska.
Cilj je leksikografski: **prvo najmanji broj kamiona, zatim najmanja ukupna kilometraža**.
Rezultat se prikazuje kao spisak ruta (kasnije mapa) i kao 3D raspored robe u kamionu.

- Model (Spec v2): **PDP** (preuzimanje i isporuka) sa **više skladišta**, **dve faze po ruti**
  (prvo sva preuzimanja, pa sve isporuke; pretpostavka čeka potvrdu), kapacitet samo u LDM,
  pošiljke nedeljive. Izvan MVP-a: LIFO, vremenski prozori, težina kao ograničenje, više tura.
- Backend (ceo API iz `frontend/src/api/client.ts`): Java 21, Spring Boot 4.1.1, Maven,
  Apache POI, Timefold Solver 2.7.1 (skor Hard/Medium/Soft: hard = LDM preko kapaciteta,
  medium = broj kamiona, soft = metri), nezavisni `SolutionValidator`. Rastojanja su za sada
  vazdušna linija (haversine); planirano: OSRM, geokodiranje, PostgreSQL.
- Frontend: React + TypeScript + Vite. Radi nad mock API-jem (podrazumevano) ili, u režimu
  `server`, potpuno nad backend-om.

## Izvori istine

| Dokument | Gde | Napomena |
|---|---|---|
| Specifikacija v2 | **nije u repozitorijumu** | korisnik ju je dao u razgovoru; sažetak je u ovom fajlu |
| Dopuna 1 (API ugovor prema frontendu) | `docs/specifikacija-v2-dopuna-1.md` | obavezno pročitati pre rada na backend-u |
| Pitanja za vlasnika procesa | `docs/pitanja-za-vlasnika-procesa.md` | otvoreno; odgovori menjaju model |
| Tipovi i API koje frontend očekuje | `frontend/src/api/types.ts`, `frontend/src/api/client.ts` | ugovor u kodu |
| Licence preuzetog TeGo koda | `frontend/public/legacy/tego/NOTICE` | |

Iz Spec v2, važno za rad:

- Statusi posla: `QUEUED | RUNNING | COMPLETED | INFEASIBLE | CANCELLED | FAILED`;
  `INFEASIBLE` ima `infeasibilityKind`: `PROVEN` (dokazano pre rešavanja, `POST` vraća 422,
  posao se ne kreira) ili `NOT_FOUND` (solver nije našao rešenje u vremenu).
- Obavezan tekst za `NOT_FOUND`: „Solver nije našao rešenje u zadatom vremenu. To ne znači da
  rešenje ne postoji.“ PROVEN i NOT_FOUND se nikad ne smeju pomešati.
- Jedinice: LDM × 10 kao ceo broj (`ldmTenths`), rastojanja u metrima (ceo broj), 3D u mm.
- Test 7 (u fixture-u `test7`): 2 kamiona, 1 001 489 m = „1001,5 km“ (S1+S3, S2+S4), iako
  3 kamiona daju 921,5 km.
- Testovi 8 i 9 (3D): broj tela = broj pošiljki; 20 promena kamiona bez curenja (jedan canvas,
  isti broj slušalaca i GPU geometrija). Oba su u `frontend/tests/e2e/truck3d.spec.ts`.

## Struktura

```
RCVA/
├── CLAUDE.md                     ovaj fajl
├── docs/                         specifikacija i dopune
├── frontend/                     React + TS + Vite (urađeno)
│   ├── src/api/                  ApiClient interfejs, tipovi, mock (src/api/mock/)
│   ├── src/api/mock/import/      pravila čitanja Excel-a (referenca za backend)
│   ├── src/fixtures/             probni scenariji: small, test7, proven, notFound
│   ├── src/features/             ekrani: dashboard, shipments (+ import/), trucks,
│   │                             optimization, route-map, truck-3d (+ tego/)
│   ├── src/domain/capacity.ts    donja granica broja kamiona, provere kapaciteta
│   ├── src/format/               jedini modul za formatiranje jedinica (LDM, km, kg, vreme)
│   ├── src/styles/               tokens.css (sve boje), base, layout, components
│   ├── public/legacy/tego/       TeGo 3D vizuelizator (klasične skripte; packwidget.js izmenjen)
│   └── tests/unit, tests/e2e     Vitest i Playwright
└── backend/                      Java 21, Spring Boot 4.1.1, Maven Wrapper (mvnw)
    ├── src/main/java/rs/rcva/
    │   ├── api/                  kontroleri (/api/v1), ApiException, Problem Details handler
    │   ├── domain/Model.java     record-i, polje po polje kao frontend/src/api/types.ts
    │   ├── data/                 InMemoryStore + SampleData (isti podaci i id-jevi kao mock "small")
    │   ├── imports/              Excel uvoz: RelationParser, QuantityParser, Gazetteer, ImportRows,
    │   │                         ImportService, PoiWorkbookReader (prenos src/api/mock/import/)
    │   ├── trucks/TruckService   validacija i CRUD kamiona (poruke iste kao u mock-u)
    │   └── optimization/         OptimizationService (poslovi, jedna pozadinska nit), Feasibility
    │       │                     (PROVEN, donja granica), SolutionValidator, SimpleLoadPlanner, JobInput
    │       ├── routing/          Assumptions (pretpostavke koje čekaju Gojka), RoutePlanner
    │       │                     (redosled stanica), DistanceProvider + HaversineDistanceProvider
    │       └── solver/           Timefold: ShipmentAssignment → Vehicle, RoutingConstraints, RoutingSolver
    └── src/test/java/            JUnit 6: ApiContractTest (MockMvc), imports/*, optimization/*
                                  (TestWorkbooks pravi .xlsx u memoriji; Test7Data je test 7)
```

## Komande

```bash
cd frontend
npm run dev                          # http://localhost:5173, sve na mock-u, scenario "small"
VITE_MOCK_SCENARIO=test7 npm run dev # i: proven, notFound
VITE_API_MODE=server npm run dev     # sve preko backend-a (Vite proxy /api -> :8080)
npm run build                        # tsc -b && vite build
npm run lint
npm test                             # Vitest (logika, bez DOM-a)
npm run test:e2e                     # Playwright/Chromium nad mock-om; dev serveri 5174-5176
npm run test:e2e:server              # Playwright nad pravim backend-om (sam ga diže; treba Java 21)

cd backend
./mvnw spring-boot:run               # http://localhost:8080/api/v1/health (Windows: mvnw.cmd)
./mvnw test                          # ili verify
```

Izvor podataka bira `VITE_API_MODE` (`src/api/apiMode.ts`, `src/api/createApiClient.ts`):
`mock` (podrazumevano) ili `server`. U režimu `server` sve ide sa backend-a, a
`VITE_MOCK_SCENARIO` se ne koristi. Bočna traka uvek prikazuje izvor podataka.

Serverski e2e testovi dele jedan backend i izvršavaju se abecedno po fajlu:
`optimization.server` mora ići pre `shipmentImport.server`, jer uvoz dodaje pošiljke bez
koordinata, a sa njima server odbija optimizaciju (409).

Playwright pokreće po jedan dev server za scenarije `small` (5174), `proven` (5175) i
`notFound` (5176). Testovi u `tests/e2e/scenarios/<scenario>*.spec.ts` idu na server tog
scenarija.

Stanje (28.10.2026): frontend build i lint čisti, 167 Vitest, 40 Playwright (mock) i
9 Playwright (server) testova prolaze; backend `mvnw verify` prolazi, 99 testova.

## Pravila rada (dogovoreno sa korisnikom)

- **Jezik**: proza i UI na srpskom (latinica); kod, nazivi, fajlovi i commit poruke na engleskom.
- **Git**: jedna grana, `main`; commit-uje se direktno na nju, u malim commit-ima.
  **Push samo kada korisnik traži.** Ne prepisivati istoriju bez izričite dozvole.
- **Korak po korak**: predložiti plan i sačekati potvrdu korisnika pre većeg posla.
- **Iskrenost**: ne tvrditi da nešto radi ako nije pokrenuto. Uz rezultat navesti komandu i
  stvarni izlaz. Test koji dokazuje ispravku prvo mora da padne na neispravnom kodu.
- **Biblioteke**: pre instalacije proveriti licencu (npm i LICENSE u repozitorijumu) i
  verziju; uzimati verzije stare bar dve nedelje; instalirati sa `--save-exact`; navesti
  licencu i verziju u odgovoru. `react-leaflet` ne koristiti bez potvrde (Hippocratic-2.1);
  za mapu je predviđen Leaflet direktno (BSD-2-Clause).
- **Obim**: bez funkcionalnosti van dogovora (LIFO, vremenski prozori, autentifikacija,
  i18n, dark mode...). Ako nešto fali, predložiti, ne implementirati.
- **Podaci korisnika**: stvarni Excel (`C:\Users\Milos\Desktop\Relacija-tezina-dimenzija.xlsx`)
  sme da se čita, ali **ništa iz njega ne ide u repozitorijum** (ni redovi, ni tačne težine,
  ni nazivi mesta karakteristični za fajl). U kodu i testovima samo izmišljeni primeri istog
  oblika. Pre commit-a proveriti grep-om.
- **Stil**: sve boje su u `src/styles/tokens.css` (paleta Cream + Dark Grey + Black Cherry);
  samo svetla tema. Formatiranje jedinica isključivo kroz `src/format/`.

## Stanje: urađeno

Svih šest ekrana iz prompta radi nad mock API-jem:

| Ekran | Šta radi |
|---|---|
| Pregled | kartice (pošiljke, LDM, kamioni, greške), poslednja optimizacija, upozorenja (provere koje dokazuju neizvodljivost), brze akcije |
| Pošiljke | tabela sa izvedenim statusom, CSV izvoz (UTF-8 BOM, `;`, decimalni zarez), **uvoz Excel-a u 4 koraka** (fajl → mapiranje kolona → greške, duplikati, ručna ispravka i isključivanje reda → potvrda) |
| Kamioni | tabela, dodavanje i izmena sa validacijom, uklanjanje sa potvrdom u redu (409 dok posao radi) |
| Rezultati optimizacije | pokretanje sa vremenskim ograničenjem, praćenje statusa, rezime i skor, validator, tabela po kamionu sa redosledom stanica, nedodeljene pošiljke, PROVEN i NOT_FOUND |
| Mapa ruta | za sada spisak ruta i stanica, filter po kamionu (`?truck=`) |
| 3D prikaz | TeGo vizuelizator (`TruckVisualizer`), izbor kamiona, spisak pošiljki, oznaka „Ilustrativni raspored“ |

Gornja traka svuda prikazuje status poslednjeg posla i dugme „Pokreni optimizaciju“.

Backend: `GET/POST /trucks`, `GET/PUT/DELETE /trucks/{id}` (validacija, 404, 409
dok posao radi), `GET /shipments`, `GET /locations`, `GET /base`, `GET /health`.
Excel uvoz po dopuni 1, odeljak 4: `POST /imports/excel` (multipart, do 10 MB),
`PUT /imports/{id}/mapping`, `GET .../preview`, `PUT .../rows/{n}`, `POST .../commit`; ista
pravila, poruke i testni slučajevi kao mock (`ImportParsingTest`, `ImportServiceTest`).
Greške kao Problem Details sa naslovima na srpskom i `errors` po polju. Podaci u memoriji;
restart ih vraća na početne. Runtime licence: Apache-2.0 (Spring, Tomcat, Jackson, Apache
POI 5.5.1, Timefold 2.7.1, Micrometer, Gizmo, SmallRye Common, JBoss Logging...),
BSD-3-Clause (curvesapi, iz POI), BSD-2-Clause (HdrHistogram), EDL-1.0 (jakarta.xml.bind),
**GPL-2.0 sa Classpath Exception** (jdk-classfile-backport, iz Timefold-a; ista licenca kao
JDK), MIT (SLF4J), EPL-2.0/LGPL-2.1 (Logback), EPL-2.0 (jakarta.annotation).

Optimizacija na serveru:
- `POST /optimization-jobs` (202; 400; 409 za pošiljke bez koordinata; 422 PROVEN sa
  `causes`), `GET /optimization-jobs/{id}`, `GET .../result` (409 dok nije COMPLETED),
  `GET .../trucks/{truckId}/load-plan`. Posao kopira ulaz (`JobInput`); poslovi idu jedan
  po jedan; kamion se ne može ukloniti dok posao čeka ili radi.
- **Model**: Timefold odlučuje samo koji kamion nosi koju pošiljku (`ShipmentAssignment` →
  `Vehicle`); redosled stanica za taj skup daje `RoutePlanner` (dve faze; do 9 pošiljki po
  kamionu egzaktno, Held-Karp, iznad toga najbliži sused + 2-opt). Razlog: kod modela sa
  pojedinačnim stanicama zamena dve pošiljke između kamiona traži 4 poteza odjednom, što
  podrazumevani potezi ne nalaze.
- Testovi: test 7 (2 kamiona, 1 001 489 m, validator čist), test skora koji pokazuje da
  2 kamiona pobeđuju 3 kamiona od 921 489 m (pada bez ograničenja za broj kamiona), test 5b
  (NOT_FOUND), test 4 (PROVEN), 28 izmišljenih pošiljki veličine stvarnog fajla, test 8 nad
  rezultatom solvera (serverski e2e).
- Stvarni Excel je lokalno pušten kroz serverski uvoz: 28 redova, 25 bez greške, 3 greške,
  115,0 LDM, kao u dopuni 1. **Optimizacija nad njim još nema smisla**: probno geokodiranje
  zna desetak gradova, pa većina mesta nema koordinate (409).

## Sledeći koraci

1. ~~Backend kostur~~ (urađeno 28.10.2026; PostgreSQL namerno odložen).
2. ~~Excel uvoz na serveru~~ (urađeno 28.10.2026). Mock pravila u
   `frontend/src/api/mock/import/` i Java pravila moraju ostati ista dok mock postoji.
3. ~~Timefold optimizacija~~ (urađeno 28.10.2026, **na pretpostavkama** iz
   `optimization/routing/Assumptions.java`; kada Gojko odgovori, proveriti ih).
   Testovi 1–3, 5a i 6 iz Spec v2 nisu preneti: specifikacija nije u repozitorijumu, a ovde
   su opisani samo testovi 4, 5b, 7, 8 i 9.
4. ~~SimpleLoadPlanner na serveru~~ (urađeno 28.10.2026).
5. **Čeka odluku A/B** (videti „Gde smo stali“). Posle toga: geokodiranje (Nominatim) i
   kilometraže (ORS); bez njih stvarni podaci ne mogu u optimizaciju.
6. Kasnije: mapa (Leaflet), trajno čuvanje podataka (PostgreSQL samo na putu A; na putu B
   IndexedDB), završno testiranje (svih 9 testova).

Predlozi iz dopune 1 koji čekaju odluku: `GET /optimization-jobs/latest` (poslednji posao se
sada gubi posle osvežavanja) i naziv i kapacitet kamiona u rezultatu (`inputSnapshot`).

## Otvorena pitanja

Za vlasnika procesa (Gojko, preko Luke). Model trenutno radi na pretpostavkama: dve faze,
polazak iz baze, povratak po `BaseSettings.returnToBase`, bez ograničenja redosleda
(`optimization/routing/Assumptions.java`; menjaju se `RoutePlanner`, ograničenje kapaciteta
i `SolutionValidator`):

1. Da li kamion prvo preuzima svu robu, pa je isporučuje (dve faze po ruti)?
2. Gde kamion polazi i gde završava rutu (baza, povratak, otvorena ruta)?
3. Postoje li ograničenja redosleda magacina ili isporuka?

Sva pitanja za Gojka (model, kamioni, Excel podaci), napisana za slanje:
`docs/pitanja-za-vlasnika-procesa.md`. Kada odgovori stignu, upisati ih ovde i u Spec.
Pitanja za tim: odeljak 9 u `docs/specifikacija-v2-dopuna-1.md`.

## Zamke (naučeno u radu)

- **Windows, fajl sistem bez razlike velikih i malih slova**: `truckForm.ts` i
  `TruckForm.tsx` u istom folderu se sudaraju. Pomoćne module zvati drugačije
  (`truckFormValidation.ts`, `resultRows.ts`).
- **npm 10.9.0** pada sa `Cannot read properties of null (reading 'edgesOut')` pri dodavanju
  vitest-a; zaobiđeno jednokratnim `--legacy-peer-deps`. Obični `npm install` nad lock fajlom
  radi bez toga.
- **Pokrenut `npm run dev`** drži zaključan rolldown `.node` fajl; `npm ci` tada pada sa EPERM.
- **e2e testovi** importuju lokalne fajlove sa ekstenzijom (`./consoleGuard.ts`, nodenext).
  Kod u `page.evaluate` koristi DOM tipove, zato postoji `tsconfig.e2e.json`.
- **Tabele**: `max-width` ne važi za ćelije, pa se širine ograničavaju na unutrašnjim
  elementima. `.table-wrap` ima `position: relative`, da `.visually-hidden` ne širi stranicu.
- **TeGo (`public/legacy/tego/`)**: klasične skripte sa implicitnim globalnim promenljivama,
  pa se ne pakuju bundler-om. Učitava ih `loadTego()` jednom po stranici. Crtaju u **jedan
  deljeni canvas fiksiran iza stranice** (odluka „A“), pa **kontejner 3D prikaza i njegovi
  roditelji moraju biti providni**. `packwidget.js` je izmenjen (`destroy()`, oznaka
  „MODIFIED for RCVA“); fajl ima mešane završetke redova (LF/CRLF), pa automatske izmene
  moraju to da poštuju. `console.warn` „OrbitControls: target is now immutable“ dolazi iz
  r73 i nije greška.
- **Fast-forward spajanje** je jednom obrisalo korisnikov ignorisani fajl
  `pocetne instrukcije za react app.txt` sa diska, jer je bio praćen u starijem commit-u.
  Vraćen je iz istorije. Pre spajanja ili prebacivanja grana proveriti ignorisane fajlove.
- **Backend, Spring Boot 4**: `spring-boot-starter-web` je zastareo, pa se koristi
  `spring-boot-starter-webmvc`. Test anotacije su u novim modulima
  (`org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc`). Jackson je
  verzija 3 (`tools.jackson`). Naš `ApiExceptionHandler` ima `@Order(HIGHEST_PRECEDENCE)`,
  inače ugrađeni Problem Details handler daje engleske naslove.
- **Playwright + Maven na Windows-u**: `cmd.exe` ne nalazi `mvnw.cmd` po samom imenu, pa
  `playwright.server.config.ts` koristi apsolutnu putanju.
- **Dva izvora istih podataka**: `backend/.../SampleData.java` i
  `frontend/src/fixtures/smallScenario.ts` imaju iste podatke; serverski e2e testovi
  očekuju iste brojeve kao mock (npr. 20,9 LDM, 2 kamiona).
- **Timefold 2.x**: `HardMediumSoftScore` je u `ai.timefold.solver.core.api.score`,
  `@PlanningId` u `api.domain.common`. Naziv ograničenja (`asConstraint`) sme da sadrži samo
  ASCII slova, pa nazivi idu na engleskom. Koristi se samo `timefold-solver-core`, bez
  Spring startera.
- **Test koji prolazi i bez onoga što proverava**: test 7 sa pretragom prolazi i kada se
  ukloni ograničenje za broj kamiona (solver zaglavi u lokalnom optimumu sa 2 kamiona).
  Leksikografski cilj zato dokazuje poseban test skora. Kod testova solvera uvek probati
  i pokvareni kod.
- **Surefire i `@Nested`**: `-Dtest=ImportParsingTest` pokreće 0 testova; treba
  `'-Dtest=ImportParsingTest*'` (ugnežđene klase su `ImportParsingTest$ParseRelation`...).
- **JS i Java regex**: JS `\s` i `trim()` hvataju i neprelomljivi razmak (čest u Excel-u),
  Java ne; zato `imports/Text.java` (`WS`, `trim`). Java `$` prihvata i kraj ispred `\n`,
  pa se umesto JS `$` piše `\z`. Brojčane ćelije se pišu kao JS `String(number)` (`PoiWorkbookReader.number`).
- **Provera stvarnih podataka grep-om**: `grep -F -f spisak` u Git Bash-u je jednom tiho
  vratio prazno; proveravati reč po reč i prvo potvrditi da provera nalazi poznatu reč.
- **Ceo broj u JSON telu**: `ImportRowPatch.ldmTenths` je `Double`, a servis proverava da je
  ceo broj, pa `2.5` daje 400 (pokriveno testom). Kod Jackson 2 bi `2.5` u `Integer` polju
  bilo tiho odsečeno; za Jackson 3 to nije provereno.
- **Mock ograničenja**: rezultat optimizacije je fiksan po scenariju (nema solvera);
  geokodiranje zna desetak gradova (`src/api/mock/import/gazetteer.ts`); rastojanja u
  scenariju `small` su vazdušna linija; poslednji posao se čuva samo u memoriji.
