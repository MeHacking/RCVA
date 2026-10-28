# RCVA: optimizacija utovara i ruta kamiona

Ovaj fajl je radni dnevnik projekta za ljude i za Claude sesije i agente. Claude Code ga
automatski učitava u svakoj sesiji pokrenutoj u `RCVA/` ili ispod. **Ažurirati ga na kraju
svakog većeg koraka** (odeljci „Stanje“ i „Sledeći koraci“).

Poslednje ažuriranje: 28.10.2026, backend kostur i HTTP klijent (posle commit-a `76aa489`).

## Šta aplikacija radi

Za zadate pošiljke i flotu kamiona dodeljuje pošiljke kamionima i određuje redosled obilaska.
Cilj je leksikografski: **prvo najmanji broj kamiona, zatim najmanja ukupna kilometraža**.
Rezultat se prikazuje kao spisak ruta (kasnije mapa) i kao 3D raspored robe u kamionu.

- Model (Spec v2): **PDP** (preuzimanje i isporuka) sa **više skladišta**, **dve faze po ruti**
  (prvo sva preuzimanja, pa sve isporuke; pretpostavka čeka potvrdu), kapacitet samo u LDM,
  pošiljke nedeljive. Izvan MVP-a: LIFO, vremenski prozori, težina kao ograničenje, više tura.
- Backend (kostur radi): Java 21, Spring Boot 4.1.1, Maven. Planirano: Timefold Solver
  (skor Hard/Medium/Soft: hard = prekršaji, medium = broj kamiona, soft = metri), nezavisni
  `SolutionValidator`, OSRM za rastojanja, kasnije PostgreSQL.
- Frontend: React + TypeScript + Vite. Radi nad mock API-jem; u režimu `server` kamione
  čita i menja preko backend-a.

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
    │   ├── trucks/TruckService   validacija i CRUD kamiona (poruke iste kao u mock-u)
    │   └── optimization/ActiveJobs  „ima li posla u toku“ (za 409 pri uklanjanju); sada uvek prazno
    └── src/test/java/            JUnit 6: TruckServiceTest, ApiContractTest (MockMvc)
```

## Komande

```bash
cd frontend
npm run dev                          # http://localhost:5173, sve na mock-u, scenario "small"
VITE_MOCK_SCENARIO=test7 npm run dev # i: proven, notFound
VITE_API_MODE=server npm run dev     # kamioni preko backend-a (Vite proxy /api -> :8080)
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
`mock` (podrazumevano) ili `server`. U režimu `server` sa backend-a idu samo kamioni i baza;
pošiljke, lokacije, uvoz, optimizacija i 3D raspored ostaju na mock-u, jer uvoz upisuje
pošiljke u mock. Backend endpoint-i za pošiljke i lokacije postoje, ali ih frontend još ne
koristi. Bočna traka uvek prikazuje izvor podataka.

Playwright pokreće po jedan dev server za scenarije `small` (5174), `proven` (5175) i
`notFound` (5176). Testovi u `tests/e2e/scenarios/<scenario>*.spec.ts` idu na server tog
scenarija.

Stanje (28.10.2026): frontend build i lint čisti, 164 Vitest, 40 Playwright (mock) i
4 Playwright (server) testa prolaze; backend `mvnw verify` prolazi, 15 testova.

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

Backend (kostur): `GET/POST /trucks`, `GET/PUT/DELETE /trucks/{id}` (validacija, 404, 409
dok posao radi), `GET /shipments`, `GET /locations`, `GET /base`, `GET /health`. Greške kao
Problem Details sa naslovima na srpskom i `errors` po polju. Podaci u memoriji; restart ih
vraća na početne. Runtime licence: Apache-2.0 (Spring, Tomcat, Jackson...), MIT (SLF4J),
EPL-2.0/LGPL-2.1 (Logback), EPL-2.0 (jakarta.annotation).

## Sledeći koraci

1. ~~Backend kostur~~ (urađeno 28.10.2026; PostgreSQL namerno odložen).
2. **Excel uvoz na serveru** (Apache POI), prenosom pravila iz
   `frontend/src/api/mock/import/` zajedno sa testovima. Posle toga frontend u režimu
   `server` može da čita i pošiljke i lokacije sa backend-a.
3. **Timefold optimizacija** (čeka odgovore vlasnika procesa, videti dole): PDP sa dve faze,
   provera PROVEN pre rešavanja, `SolutionValidator`, testovi 1–7, probni `DistanceProvider`.
4. **SimpleLoadPlanner** na serveru (`GET .../load-plan`), test 8 sa pravim podacima.
5. Kasnije: OSRM i geokodiranje, mapa (Leaflet), PostgreSQL, završno testiranje (svih 9 testova).

Predlozi iz dopune 1 koji čekaju odluku: `GET /optimization-jobs/latest` (poslednji posao se
sada gubi posle osvežavanja) i naziv i kapacitet kamiona u rezultatu (`inputSnapshot`).

## Otvorena pitanja

Za vlasnika procesa (Gojko, preko Luke); blokiraju Timefold model:

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
  `frontend/src/fixtures/smallScenario.ts` moraju imati iste id-jeve dok god deo frontenda
  radi na mock-u (mock optimizacija se odnosi na te id-jeve).
- **Mock ograničenja**: rezultat optimizacije je fiksan po scenariju (nema solvera);
  geokodiranje zna desetak gradova (`src/api/mock/import/gazetteer.ts`); rastojanja u
  scenariju `small` su vazdušna linija; poslednji posao se čuva samo u memoriji.
