# RCVA: optimizacija utovara i ruta kamiona

Ovaj fajl je radni dnevnik projekta za ljude i za Claude sesije i agente. Claude Code ga
automatski učitava u svakoj sesiji pokrenutoj u `RCVA/` ili ispod. **Ažurirati ga na kraju
svakog većeg koraka** (odeljci „Stanje“ i „Sledeći koraci“).

Poslednje ažuriranje: 01.11.2026, kraj sesije (linije po putu, nova ORS adresa, izvoz/uvoz
podataka, upozorenja na Pregledu, režim `local` podrazumevano, aplikacija za PC); videti
„Gde smo stali“. Sve je push-ovano na `origin/main` 01.11.2026.

## Gde smo stali (01.11.2026)

**Sledeće**: aplikacija za **telefon** (Capacitor, isti web kod); plan predložiti i potvrditi
pre početka. Urađeno 01.11.2026 redom koji je korisnik izabrao: 1. upozorenja na Pregledu,
2. podrazumevani režim `local`, 3. aplikacija za PC (Electron). Korisnik još nije
instalirao `RCVA-Setup-1.0.0.exe` ni preneo podatke iz pregledača (izvoz/uvoz fajla).
Moguće dorade za PC (nisu tražene): sopstvena ikonica (sada podrazumevana Electron-ova),
instaler na srpskom, potpisivanje (bez njega Windows SmartScreen upozorava).

**Aplikacija za PC (urađeno 01.11.2026)**. Odluke korisnika: **Electron** (ne Tauri),
**klasična instalacija** (NSIS), Node podignut na **24 LTS**.
- **Node**: Electron 42+ traži Node ≥ 22.12 za instalaciju paketa, a Node 20 je bez ispravki od
  30.04.2026; instaliran Node **24.22.1** (`winget install OpenJS.NodeJS.LTS --version
  24.22.1`; bezbednosno izdanje, 12 dana, odstupanje od pravila dve nedelje), npm 11.19.1.
  Ceo projekat posle toga prolazi sve testove.
- `electron` **44.9.3** (MIT; 21.10.2026, 11 dana: 44.9.0 ima ranjivost visokog nivoa
  GHSA-jr5w-w6x2-84p9, ispravljena u 44.9.1, a 44.9.3 donosi i ispravke Chromium/V8) i
  `electron-builder` **26.17.0** (MIT), `--save-exact`, dev. `npm audit`: 26 umerenih, sve
  `minimatch` u razvojnim alatima; `--omit=dev` 0. Paket nosi `LICENSE.electron.txt` i
  `LICENSES.chromium.html`. npm 11 nije pokrenuo instalacionu skriptu `electron-winstaller`
  (Squirrel, ne koristimo ga); nije odobravana.
- `frontend/electron/`: aplikacija sa sopstvenim `package.json` (bez zavisnosti) i
  `main.mjs` (`// @ts-check`, proverava ga `tsc -b` preko `tsconfig.node.json`): web verzija
  (`electron/web/`, kopija `dist/`, `scripts/prepare-desktop.mjs`; nije u git-u) se služi
  sa `app://rcva/` (standardna i sigurna šema: IndexedDB, Web Worker, fetch; nepoznata
  putanja dobija `index.html`, ništa van `web/` se ne služi), User-Agent `RCVA/1.0.0
  (desktop aplikacija za planiranje utovara i ruta)` za Nominatim/ORS/OSM, linkovi i
  `target="_blank"` idu u podrazumevani pregledač, bez menija, jedna instanca. Podaci u
  `%APPDATA%\RCVA` (odvojeni od pregledača; prenos preko izvoza/uvoza fajla).
  `RCVA_USER_DATA` menja folder podataka (samo za testove).
- `electron-builder.yml`: `directories.app: electron`, izlaz `release/` (nije u git-u),
  `RCVA-Setup-1.0.0.exe` oko 115 MB, nepotpisan, podrazumevana ikonica. `app.asar` sadrži
  samo `main.mjs`, `package.json` i `web/` (videti „Zamke“).
- Testovi: `tests/desktop/desktop.spec.ts` (4, Playwright `_electron`, privremeni folder
  podataka, lažni servisi): prazan početak na `app://rcva/` i osvežavanje na svakom ekranu,
  bez služenja fajlova van `web/`, sopstveni User-Agent, uvoz + optimizacija u Worker-u +
  podaci posle ponovnog pokretanja, linkovi u pregledaču bez novog prozora. Isti testovi
  prolaze i nad spakovanim `release/win-unpacked/RCVA.exe` (`RCVA_DESKTOP_EXE`). Provereno
  na pokvarenom kodu glavnog procesa (6 izmena): svaka obara testove (ignorisanje
  `RCVA_USER_DATA` namerno nije probano: pisalo bi u prave podatke). Sam NSIS instaler nije
  pokretan.

**Podrazumevani režim `local` (urađeno 01.11.2026)**. Odluke korisnika 01.11.2026: prazan
uređaj kreće **bez podataka** (probni samo sa `VITE_MOCK_SCENARIO`), i dodato je **„Ukloni
sve pošiljke“** (brisanje po redu nije traženo):
- `apiMode()` podrazumevano `local`; `startingScenario(mode)`: `VITE_MOCK_SCENARIO`, inače
  `small` za mock i `null` za uređaj (tada `EMPTY_START` iz `localClient`; baza id 0, ne
  koristi se kod otvorenih ruta). Bočna traka: „Na uređaju“ ili „Na uređaju (probni početni
  podaci)“.
- `ApiClient.deleteAllShipments()` (NOT IN SPEC v2): na uređaju briše pošiljke i mesta koja
  nijedan sačuvani posao ne koristi (mesta rezultata ostaju, da stari rezultat ima nazive);
  409 dok posao čeka ili radi. Mock briše samo pošiljke; `httpClient` 404 (dugme se u režimu
  `server` ne prikazuje). Ekran Pošiljke: dugme sa potvrdom (u režimu `local` link na izvoz
  u Podešavanjima).
- **Zamka nađena usput**: uvoz je davao id `max + 1`, pa bi posle brisanja nove pošiljke
  dobile id-jeve iz sačuvanih rezultata (stari rezultat bi pokazivao pogrešne pošiljke).
  `createImportStore` sada ima `firstFreeShipmentId`, a `localClient` daje najveći id iz
  sačuvanih poslova + 1.
- Naslov kolone „Težina (kg)“ u režimu `local`: „Zbir po kamionu ne sme preći nosivost“
  (ranije svuda „Informativno; nije ograničenje“, što na uređaju nije tačno).
- Playwright: mock serveri dobijaju `VITE_API_MODE=mock`; nov server 5178 bez `VITE_`
  promenljivih i `tests/e2e/local-empty/` (podrazumevani režim i prazan početak).
- Testovi: `apiMode.test.ts` (3), 4 nova u `localClient.test.ts` (prazan početak i uvoz,
  brisanje i čuvanje, mesta rezultata i id posle brisanja, 409), e2e
  `local/deleteShipments.local.spec.ts` i `local-empty/emptyDevice.spec.ts`. Provereno na
  pokvarenom kodu (12 izmena): svaka obara testove.
- Ograničenje: posle „Ukloni sve pošiljke“ stari rezultat u spisku stanica pokazuje
  pošiljke kao `#id` (pošiljke više ne postoje; mesta da).

**Upozorenja na Pregledu (urađeno 01.11.2026)**: Pregled više ne računa sam, nego koristi
iste provere kao posao pre pokretanja (`feasibility.ts`, `provenFindings`: tekst i da li se
tiče pošiljke ili flote, za link), nad flotom koju bi posao dobio (`domain/fleet.ts`
`planningFleet`: dostupni kamioni, a u režimu `local` i po jedna standardna cerada po
pošiljci; `toJobTruck` i `standardJobTruck` koristi i `localClient`). Zato Pregled ima
težinu, poruke su iste kao u odgovoru 422 („najvećeg kamiona“, ne više „najvećeg dostupnog
kamiona“), a donja granica broja kamiona računa i težinu. Opcija `totals: false` (lokalni
posao i Pregled u režimu `local`): sa po jednom ceradom po pošiljci zbir može da pređe flotu
samo zbog pošiljke koja je već navedena, pa se zbir ne proverava (dokazano u razgovoru:
svaka pošiljka staje u svoj kamion). Kartica „Kamioni“ u režimu `local`: „+ standardne
cerade po potrebi“; bez donje granice: „kamioni nisu dovoljni (videti upozorenja)“.
`capacity.ts` zadržava samo `trucksLowerBound` (fixture-i) i `availableCapacity`. Testovi:
`dashboardModel.test.ts` (8), 1 nov u `feasibility.test.ts`, 1 slučaj u `localClient.test.ts`,
e2e `tests/e2e/local/dashboard.local.spec.ts`. Provereno na pokvarenom kodu (10 izmena):
svaka obara testove.

**Korak 4d, izvoz i uvoz podataka (urađeno 01.11.2026)**. Odluke korisnika 01.11.2026: uvoz
**zamenjuje** sve podatke (spajanje je moguća kasnija nadogradnja), a u fajl idu i **linije
po putu**.
- `src/api/local/deviceFile.ts`: `writeDeviceFile` / `readDeviceFile`, format
  `rcva-podaci`, verzija 1, `exportedAt`, `data` (pošiljke, mesta, kamioni, poslovi sa
  rezultatima, brojači id-jeva, podešavanja, `geocodeCache`, `distanceCache`,
  `routeLineCache`). Podešavanja se pišu polje po polje (bez `orsApiKey`, ni slučajno).
  JSON nema Map/Set/Infinity: `fleet` i `addedTruckIds` posla idu kao spiskovi, a
  `capacityKg` Infinity u ulazu posla kao `null`. Čitanje proverava ceo fajl (svako polje,
  uključujući rezultate i keševe; poruka sa putanjom prvog lošeg polja), pa jedinstvene
  id-jeve, mesta pošiljki, veličinu matrice rastojanja, rezultat završenog posla i brojače.
  Naziv fajla `rcva-GGGG-MM-DD.json` (lokalni datum).
- `ApiClient` (NOT IN SPEC v2): `exportDeviceData` (null za mock i server),
  `checkDeviceData` (samo provera i sažetak, 400 „Neispravan fajl“), `replaceDeviceData`
  (400, 409 dok posao čeka ili radi, 404 za mock i server). U `localClient` učitavanje je
  izdvojeno u `apply` (isto za pokretanje i uvoz): posao koji je radio kada je fajl napravljen
  posle uvoza je `FAILED`. Uređaj zadržava svoj ORS ključ.
- Ekran: Podešavanja, odeljak „Podaci na uređaju“ (`DeviceDataPanel.tsx`): „Izvezi podatke“
  (preuzimanje), „Uvezi podatke…“ (skriveno polje „Fajl sa podacima“), pregled sadržaja sa
  „Zameni podatke“ / „Odustani“; posle uvoza stranica se ponovo učitava (svi ekrani kreću od
  novih podataka), a poruka o uvozu preživi to preko `sessionStorage` (sve u try/catch).
  `formatDateTime` u `src/format/time.ts`.
- Testovi: `deviceFile.test.ts` (7: izvoz bez ključa i čitanje istih podataka nazad, naziv,
  18 vrsta lošeg fajla sa tačnom porukom, zamena sa ključem uređaja i bez novih ORS
  zahteva, loš fajl ne menja ni ne čuva ništa, 409 i prekinut posao, mock), 4 u
  `time.test.ts`, e2e `tests/e2e/local/deviceData.local.spec.ts` (3: preuzimanje, uvoz sa
  pregledom, odustajanjem i ključem uređaja, loš fajl). Provereno na pokvarenom kodu (15
  izmena): svaka obara testove. Izgled proveren snimkom ekrana.
- Ograničenje: fajl sa mnogo linija po putu je veći (svaka linija ima do nekoliko hiljada
  tačaka, najviše 50 linija).

Pitanja za Gojka (30.10.2026) još
nisu poslata. Korisnik je 01.11.2026 napravio ORS ključ (account.heigit.org): prave
kilometraže i prave linije po putu na mapi rade (posle ispravke `Accept` zaglavlja; videti
„Zamke“). Korisnik je 31.10.2026 pogledao aplikaciju
u režimu `local` (`VITE_API_MODE=local npm run dev`, http://localhost:5173).

**ORS nova adresa (01.11.2026)**: sajt openrouteservice.org je bio ugašen („PHP issues“),
a stara adresa API-ja `api.openrouteservice.org` je zastarela od 28.04.2026 i gasi se
02.–06.11.2026 (obaveštenje na forumu ask.openrouteservice.org, tema 7912). Aplikacija sada
zove `https://api.heigit.org/openrouteservice/v2/{matrix,directions}`; isti ključevi rade
na obe adrese. Ključ je na nalogu **account.heigit.org**, kartica „API Key“ („Basic Key“,
može da počinje sa `eyJ`). CORS nove adrese proveren 01.11.2026 (OPTIONS za obe putanje:
204, `Access-Control-Allow-Origin: *`; POST bez ključa: 401 „Authorization field
missing“). Link u Podešavanjima vodi na account.heigit.org.

**Korak 4 na putu B do sada** (redosled dogovoren 31.10.2026, korisnik: „radi kako misliš
da treba“): **4a** čuvanje na uređaju, **4b** koordinate, **4c** kilometraže, **mapa** i
**linije po putu** i **4d** izvoz i uvoz (sve urađeno).

**Linije po putu na mapi (urađeno 01.11.2026)**, na zahtev korisnika („linija je vazdušna
kao da robu prevozimo avionom“); odluka korisnika: linije se traže **kad se otvori mapa**,
ne kad se posao završi:
- `openRouteService.ts`: `createOrsLines` (Directions v2, `POST
  /v2/directions/{profil}/geojson`, `coordinates` kao `[lon, lat]`, `instructions: false`).
  Uzastopne stanice na istom mestu se šalju jednom; više od 50 tačaka (ograničenje sa
  foruma, proveriti) ide u delovima koji dele tačku spoja. Linija se zaokružuje na 5
  decimala i pojednostavljuje (Douglas-Peucker, `LINE_TOLERANCE_M` = 25 m), jer duga ruta
  ima hiljade tačaka, a sve se čuva u jednom snimku. Razmak 1,5 s i poruke grešaka su
  zajednički sa Matrix pozivom (`createTurns`, `post`); greška je i dalje `RoadDistanceError`.
- `ApiClient.getRouteLine(jobId, truckId)` (NOT IN SPEC v2) vraća `RouteLine | null`. Mock
  i `httpClient` uvek `null`. `localClient`: profil iz posla (`distanceSource`), a za posao
  sa vazdušnom linijom profil iz podešavanja; bez ključa `null`; zapamćena linija se vraća i
  bez ključa. `LocalData.routeLineCache` (ključ: profil + sve tačke redom, na 6 decimala),
  najviše `KEPT_ROUTE_LINES` (50), najstarija ispada. Istovremeni zahtevi za istu liniju
  čekaju isti odgovor. ORS greška daje 502 „Linija po putu nije dostupna“, bez pamćenja.
- Ekran: `useRouteLines` traži liniju za svaku prikazanu rutu jednom po poslu (promena
  filtera ne pita ponovo, neuspela linija samo na „Pokušaj ponovo“). Linija po putu je
  puna, prava linija **isprekidana** (`map-route--straight`, `stroke-dasharray` 8 8). Natpis
  ispod mape (`map-caption`) kaže koje su linije po putu (sa „© openrouteservice.org by
  HeiGIT“) ili zašto nisu (učitavanje; u režimu `local` link na Podešavanja za ključ; u
  ostalim režimima „nema podataka o putevima“). Greške su u obaveštenju sa dugmetom
  „Pokušaj ponovo“. Mapa se ne centrira ponovo kad linija stigne.
- Testovi: 6 novih u `openRouteService.test.ts`, 7 u `localClient.test.ts`, 1 u
  `mapModel.test.ts`, e2e `tests/e2e/local/routeLines.local.spec.ts` (bez ključa, sa
  ključem i posle osvežavanja, 429 pa „Pokušaj ponovo“) i provera isprekidanih linija u
  `routeMap.spec.ts`. Provereno na pokvarenom kodu (17 izmena): 16 obara testove; dupla
  tačka spoja je ekvivalentna izmena (pojednostavljenje je uvek briše). Izgled proveren
  snimkom ekrana sa pravom podlogom i lažnim ORS-om.
- Ograničenje: za posao sa vazdušnim kilometražama linija ide po putu, a kilometri u spisku
  ostaju vazdušni (natpis i Rezultati to kažu odvojeno).

**Mapa ruta (urađeno 31.10.2026)**:
- `leaflet` 1.9.4 (BSD-2-Clause, bez zavisnosti; 2.0 je još alfa) i `@types/leaflet`
  1.9.22 (MIT, sa `@types/geojson`, MIT), `--save-exact`. `npm audit`: 12 umerenih samo u
  postojećim razvojnim alatima (eslint, minimatch); `--omit=dev` 0.
- `features/route-map/mapModel.ts`: čist model (bez Leaflet-a) za crtanje: putanja po ruti
  (prave linije redom obilaska; baza na početku i kraju samo kod rute sa povratkom), mesta
  (preuzimanje puna tačka, isporuka prazna, oboje poluprovidna, baza tamna) sa opisom
  posete, i spisak mesta bez koordinata. Boja rute = mesto u rezultatu (`--route-1..8` u
  `tokens.css`), pa se ne menja sa filterom; ista boja je na dugmetu filtera i na kartici.
- `RouteMap.tsx`: Leaflet direktno, učitava se lenjo (poseban deo bundle-a, oko 44 kB
  gzip); jedna mapa po montiranju, `remove()` pri napuštanju; crta ponovo samo kad se model
  promeni (potpis JSON), pa pomeranje mape ostaje. Podloga `tile.openstreetmap.org` po
  pravilima OSM-a (oznaka uvek vidljiva). **Zamka**: Leaflet 1.9 stavlja
  `mix-blend-mode: plus-lighter` na pločice, a u kontejneru sa `isolation: isolate` (treba da
  kontrole mape ostanu ispod gornje trake) pločice potpuno izblede; zato `normal` u
  `layout.css` i zum samo u celim koracima.
- Testovi: `mapModel.test.ts` (6), e2e u `routeMap.spec.ts` (lažni server za pločice preko
  `page.route`; linije, mesta, baza, oznaka OSM, boja linije = boja dugmeta, opis mesta,
  10 promena filtera i izlazak sa ekrana bez grešaka, `mix-blend-mode`). Provereno na
  pokvarenom kodu (bez `remove()`, boja po filtriranom spisku, bez povratka u bazu, baza na
  otvorenoj ruti, bez spiska mesta bez koordinata, `plus-lighter`). Izgled proveren
  snimkom ekrana sa pravom podlogom.

**Korak 4c (urađeno 31.10.2026)**:
- `src/api/local/openRouteService.ts`: `createOrsDistances` (Matrix v2, `POST
  /v2/matrix/{profil}`, ključ u `Authorization`, `[lon, lat]`, `metrics: distance`, `units:
  m`, metri zaokruženi). Ograničenja nisu nađena u zvaničnoj dokumentaciji, samo na ORS
  forumu: 3500 ruta i 50 mesta po zahtevu, pa `chunks` deli veću matricu (25 × 25); zahtevi
  idu jedan po jedan, 1,5 s razmaka (40 u minuti). CORS proveren 31.10.2026 (OPTIONS, bez
  ključa): `Access-Control-Allow-Origin: *`. Greške (mreža, 401/403 ključ, 429 kvota, 5xx,
  loša matrica) su `RoadDistanceError` sa porukom.
- `localClient.ts`: sa ključem u podešavanjima posao traži samo parove mesta koji nisu u
  `LocalData.distanceCache` (ključ: profil + obe koordinate na 6 decimala, sa smerom;
  čuva se i „nema puta“) i odmah ih upisuje; bez ključa vazdušna linija. ORS se pita tek
  posle provera 400/409/422. Ako ORS ne odgovori, posao se ne pravi (502 „Kilometraže nisu
  dostupne“), bez tihe zamene vazdušnom linijom; „nema puta“ daje 409 sa spiskom parova.
  Odgovor na `POST` sada uvek vraća `QUEUED` (posao je možda već počeo dok se upisivao).
- `OptimizationResult.distanceSource` (NOT IN SPEC v2: `driving-hgv`, `driving-car` ili
  `airline`); Rezultati ispod kilometraže pišu izvor i „© openrouteservice.org by HeiGIT,
  © OpenStreetMap contributors“. Podešavanja: ključ (polje za lozinku) i „Putevi za“
  (teretna vozila ili automobili, jer je D3 otvoreno).
- Rastojanja po putu nisu simetrična: planer to već podržava (Held-Karp sa smerom, 2-opt
  računa celu dužinu); novi test u `routePlanner.test.ts` sa nesimetričnim rastojanjima
  protiv grube sile, za svih 5 pravila (pada kada se smer u Held-Karp-u obrne).
- Testovi: `openRouteService.test.ts` (6), 7 novih u `localClient.test.ts`, e2e
  `tests/e2e/local/roadDistances.local.spec.ts` (bez ključa, sa ključem i kešom posle
  osvežavanja, 429). Provereno na pokvarenom kodu (15 izmena): svaka obara testove.
  Nijedan test ne šalje pravi zahtev.

**Korak 4b (urađeno 31.10.2026)**:
- `src/api/local/nominatim.ts`: `createNominatimGeocoder` (jedan upit odjednom, najmanje
  1 s između početaka, i posle greške), `q` = naziv mesta, `featureType=settlement`,
  `limit=1`, `countrycodes` iz oznake u fajlu (BIH → `ba`), `email` iz podešavanja ako je
  unet. Poštanski broj se ne šalje. Pregledač ne dozvoljava sopstveni User-Agent, pa
  aplikaciju predstavlja Referer. Greške (mreža, 429/403, 5xx, loš odgovor) su
  `GeocodeError` sa porukom za korisnika. Jedan pravi upit („Beograd“) proveren curl-om
  31.10.2026: 200, `access-control-allow-origin: *`, lat/lon kao stringovi.
- Uvoz (`importStore.ts`): koordinate se traže **samo pri potvrdi uvoza**, za nova mesta i
  za poznata mesta bez koordinata (pa se neuspelo traženje ponavlja pri sledećem uvozu);
  posle prve greške ostala mesta se ne pitaju. Izvor je ubačen spolja (`PlaceLocator`):
  mock i dalje koristi probni spisak (`locateInGazetteer`, isti ishod kao ranije), a
  `local` Nominatim. `commitImport(id, { onProgress })` i `ImportCommitResult.geocoding`
  su NOT IN SPEC v2 (backend ih nema). Upozorenje u pregledu redova u režimu `local` dolazi
  samo iz zapamćenih odgovora („Nominatim ranije nije pronašao...“), bez upita.
- `LocalData.geocodeCache` (ključ `placeKey` = naziv bez dijakritika + zemlja; čuva i „nije
  pronađeno“, a greške ne) i `LocalData.settings`; svaki odgovor se upisuje odmah. Nova
  polja su opciona, pa stari snimci (format 1) i dalje rade.
- Ekran **Podešavanja** (`/settings`, u meniju samo u režimu `local`): prekidač za
  Nominatim i neobavezna e-adresa (`ApiClient.getDeviceSettings/updateDeviceSettings`,
  NOT IN SPEC v2; mock i `httpClient` vraćaju `null` i 404). Oznaka „© OpenStreetMap
  contributors“ (`OsmAttribution`) je u Podešavanjima i na koraku potvrde uvoza.
- Testovi: `nominatim.test.ts` (7, lažni `fetch` i sat), 7 novih u `localClient.test.ts`,
  e2e `tests/e2e/local/geocoding.local.spec.ts` (`page.route`, razmak ≥ 950 ms, keš posle
  osvežavanja, isključen prekidač). Provereno na pokvarenom kodu (14 izmena): svaka obara
  testove. Nijedan test ne šalje pravi zahtev.
- Ograničenja: razmak od 1 s važi po kartici pregledača; „nije pronađeno“ se pamti zauvek
  (ispravka mesta u pregledu redova je za sada jedini način da se traži drugi naziv).

**Korak 4a (urađeno 31.10.2026)**:
- `src/api/local/deviceStore.ts`: `DeviceStore` (`load`/`save` jednog snimka sa
  `version: 1`), `createIndexedDbStore` (baza `rcva`, object store `app`, ključ `data`) i
  `createMemoryStore` za testove. Snimak drugog formata se ne prepisuje: svaki poziv tada
  vraća 500 „Podaci na uređaju“ sa porukom. Bez biblioteke (ni `fake-indexeddb`): logiku
  testira Vitest nad memorijom, a pravi IndexedDB Playwright.
- `localClient.ts`: pošiljke, mesta, kamioni, poslednjih `KEPT_JOBS` (10) poslova sa
  rezultatima i brojači id-jeva čuvaju se posle svake promene; promena (kamioni, posao,
  potvrda uvoza) odgovara tek kad je upisana. Scenario je samo početak, kada je baza prazna.
  Posao koji je čekao ili radio kada je stranica zatvorena posle ponovnog učitavanja je `FAILED`
  (na ekranu „Greška solvera“, što nije sasvim tačan tekst). Nepotvrđen uvoz se ne čuva.
- `ApiClient.getLatestOptimizationJob()` (NOT IN SPEC v2, predlog iz dopune 1):
  `LastJobProvider` posle osvežavanja ponovo prati poslednji posao. Mock ga zna samo dok
  stranica živi, `httpClient` uvek vraća `null` (backend ga nema).
- Testovi: 8 novih u `localClient.test.ts`, e2e `tests/e2e/local/storage.local.spec.ts`
  (kamion i rezultat posle osvežavanja, prekinut posao). Provereno na pokvarenom kodu (9
  izmena u Vitest-u, 2 u e2e): svaka obara testove.
- Ograničenja: dve otvorene kartice pišu ceo snimak, pa poslednji upis pobeđuje; promena
  `VITE_MOCK_SCENARIO` ne menja već sačuvane podatke (obrisati bazu `rcva` u DevTools-u).

**Korak 3 na putu B (urađeno 31.10.2026)**:
- **Režim `local`** (`src/api/local/localClient.ts`): isti `ApiClient`, ali sve radi u
  pregledaču. Početni podaci su iz scenarija (`VITE_MOCK_SCENARIO`; od koraka 4a se čuvaju
  u IndexedDB), uvoz je mock-ov. Posao: 400 / 409 (bez koordinata) / 422 PROVEN
  (`feasibility.ts`) kao na serveru, pa solver u Web Worker-u (`solver.worker.ts`,
  `solverRunner.ts`; vremensko ograničenje iz zahteva), validator, `openRoute: true` u
  rezultatu, 3D raspored `rearLoadedPlan`. Poslovi idu jedan po jedan. Rastojanja su
  vazdušna linija (`distance.ts`, ista formula kao Java) dok ne dođe ORS.
- **Flota (B1)**: posao dobija dostupne kamione + po jedan standardni kamion po pošiljci
  (broj kamiona neograničen); standardni kamioni koje rezultat koristi upisuju se u spisak
  kao „Kamion N“ (prvi slobodan broj) kada se posao završi.
- **Otvorena ruta na ekranu**: `OptimizationResult.openRoute` (NOT IN SPEC v2); `StopList`
  tada nema bazu ni povratak, prva stanica piše „početak rute“, a rezime „od prvog utovara
  do poslednjeg istovara“.
- **Nosivost**: `Truck.capacityKg: number | null` (null = bez ograničenja), polje „Nosivost
  (kg)“ (prazno = bez ograničenja) i kolona u tabeli. Backend je nema: `httpClient` čita
  kamion bez nje kao `null`, a u režimu `server` obrazac ne prikazuje polje (inače bi se
  uneta vrednost tiho izgubila). Fixture kamioni imaju `null` (isto kao `SampleData.java`).
- Testovi: `localClient.test.ts` (10, solver na istoj niti sa fiksnim brojem koraka),
  e2e `tests/e2e/local/` (pravi Worker u Chromium-u, port 5177), nosivost u
  `truckFormValidation`, `mockClient`, `httpClient` i e2e kamiona. Provereno na pokvarenom
  kodu (bez dodavanja kamiona, bez utovara pozadi, sa nedostupnim kamionima, bez PROVEN, bez
  reda poslova, bez `openRoute`, bez nosivosti, baza prikazana kod otvorene rute).
- Upozorenja na Pregledu sa težinom i neograničenom flotom urađena 01.11.2026 (videti „Gde
  smo stali“); podrazumevani režim je i dalje `mock`.

## Ranije (31.10.2026, korak 2)

**Korak 2 na putu B (urađeno 31.10.2026)**, sve u `frontend/src/domain/optimization/`, još
nije povezano sa ekranima:
- `job.ts`: `JobInput` (prenos `JobInput.java`): pošiljke iz API-ja, `JobTruck` sa
  `capacityKg`, `locationIds` + matrica rastojanja, `rules` (indeksi u `locationIds`);
  `toSolverInput`. **Pošiljka bez težine se računa kao 0 kg.**
- `feasibility.ts`: `provenCauses` (PROVEN) i `trucksLowerBound` sa težinom: pošiljka veća
  od najvećeg kamiona, teža od najveće nosivosti, ili ne staje ni u jedan kamion po oba
  merila zajedno; ukupno LDM i ukupno kg prema floti. Donja granica je veća od granica po
  LDM i po kg. `domain/capacity.ts` (upozorenja na Pregledu) još nema težinu.
- `validator.ts`: prenos `SolutionValidator`-a, nezavisan od planera i solvera; proverava i
  dve faze (uvek), težinu, otvorenu rutu (prva deonica 0 m, kraj samo ako je zadat) i utovar
  pozadi par po par po mestima (niz uzastopnih stanica iste vrste na istoj lokaciji).
- `result.ts`: `toOptimizationResult` pravi API rezultat iz ruta solvera (kao `toResult` u
  `RoutingSolver.java`) i dodaje izveštaj validatora; samo za izvodljiva rešenja.
- `loadPlan.ts`: `rearLoadedPlan`, kao `SimpleLoadPlanner`, ali redom obrnutim od istovara:
  x = 0 je prednji zid, vrata su na x = dužina, pa ono što se prvo istovara stoji kod vrata.
  Mock (`src/api/mock/loadPlan.ts`) i Java i dalje ređaju po redu preuzimanja (stari model).
- Testovi: `feasibility.test.ts` (12), `validator.test.ts` (10: 40 rešenja solvera sa oba
  skupa pravila, gde validator prolazi tačno kada je skor izvodljiv i dužine su iste kao u
  solveru; svaka vrsta greške sa tačnom porukom), `loadPlan.test.ts` (4). Provereno na
  pokvarenom kodu: bez težine, bez utovara pozadi, bez dve faze, sa zanemarenom otvorenom
  rutom ili krajem, i raspored po redu utovara; svaka greška obara testove.

## Ranije (30.10.2026)

**Gojkov model u TS solveru (urađeno 30.10.2026, korak 1 na putu B)**. Odluke korisnika
30.10.2026, privremene dok Gojko ne potvrdi: **utovar samo pozadi** (D2 važi već sada),
**nosivost cerade 24 t** (Gojko je rekao „mislim 13 t“, ali primer tabele ima pošiljke
teže od toga), broj kamiona neograničen, početna tačka iz prethodne nedelje se
zanemaruje.
- `routePlanner.ts`: `RouteRules` (`start`, `end`, `lifo`). `baseRules(base, returnToBase)`
  je stari model (isti kao Java, za orakl); `OPEN_ROUTE_REAR_LOADING` je Gojkov model
  (ruta počinje u prvom magacinu, završava se kod poslednje isporuke, utovar pozadi).
  Fiksan `start` kasnije služi i za početnu tačku iz prethodne nedelje.
- Utovar pozadi: uvek postoji najkraća ruta u kojoj je redosled isporuka obrnut redosled
  preuzimanja (pošiljke sa iste stanice se slobodno raspoređuju), pa planer traži samo jedan
  redosled (`exactLifo`, Held-Karp iznutra ka spolja; iznad 9 pošiljki najbliži sused i
  2-opt). Utovar pozadi nikad ne čini skup neizvodljivim, samo produžava rutu.
- `solver.ts`: `SolverInput.rules`, `weightKg` po pošiljci i `capacityKg` po kamionu
  (`Infinity` = bez ograničenja, kao u Javi); hard = LDM desetine + kg preko kapaciteta.
- `src/domain/fleet.ts`: `STANDARD_TRUCK` (13,6 LDM, 24 000 kg, 13600 × 2480 × 2700 mm) i
  `standardFleet(n)` („Kamion 1“...). API tip `Truck`, ekrani i `capacity.ts` još nemaju
  težinu (korak 3, povezivanje sa ekranima).
- Testovi: planer protiv grube sile za 5 kombinacija pravila, i na primerima sa zajedničkim
  magacinima i mestima istovara; utovar pozadi se proverava nezavisno, par po par po
  stanicama. Test 7 u novom modelu: 2 kamiona, 900 000 m (3 kamiona 470 000 m); sa 8 t i
  6 t na kamionima od 13 t (nosivost zadata u testu): 3 kamiona, 470 000 m. 60 malih
  primera sa težinom i novim pravilima protiv svih kombinacija. Provereno na pokvarenom kodu
  (zanemaren `lifo`, zanemarena težina, zanemarena pravila, bez ruin & recreate): svaka
  greška obara testove.
- Orakl (stari model) daje iste rezultate kao pre izmene: sa 2 s isti brojevi kao 29.10.,
  sa 10 s `test:oracle` prolazi (ni na jednom primeru lošiji od Timefold-a).

**Nova pitanja za Gojka (30.10.2026)**, napravljena posle primera tabele koji je poslao.
Tekst je u razgovoru, ne u repozitorijumu, jer navodi stvarne redove; **još nisu poslata**.
Teme: tačna nosivost cerade; da li se cerada može utovariti i sa strane; red sa dva mesta
istovara (koliko robe ide na koje mesto); red bez mesta utovara (nastavak prethodnog ili
posebna pošiljka); poštanski broj napisan uz mesto utovara, a pripada mestu istovara; da li
je mesto (grad) dovoljno ili će biti adrese; utovar u više zemalja i istovar u Švedskoj i
Norveškoj u istom kamionu (granice, carina); da li sve iz tabele mora iste nedelje i koliko
kamiona najviše ima; uloga vozača.

**Sledeće na putu B** (predlog, potvrditi plan sa korisnikom pre početka):
1. ~~Gojkove promene modela u TS~~ (urađeno 30.10.2026, videti gore).
2. ~~TS validator, `Feasibility` sa težinom i 3D raspored po redosledu istovara~~ (urađeno
   31.10.2026, videti gore).
3. ~~Solver u Web Worker-u i povezivanje sa ekranima~~ (urađeno 31.10.2026, režim `local`;
   ostaje Pregled sa težinom i neograničenom flotom).
4. ~~Geokodiranje (Nominatim) i kilometraže (ORS), čuvanje na uređaju (IndexedDB), izvoz/uvoz
   fajla~~ (urađeno 31.10. i 01.11.2026); ostaje pakovanje (PC, pa telefon kao Capacitor aplikacija).

## Ranije (29.10.2026)

Gojkovi odgovori su stigli 29.10.2026 (`docs/odgovori-vlasnika-procesa.md`); šta menjaju u
modelu je u „Otvorena pitanja“. **Korisnik je izabrao pravac B** i rad se nastavlja na njemu
u sledećoj sesiji. Prvi korak je bila proba: sopstveni TS solver na sadašnjem modelu (polazak
iz baze, povratak po podešavanju, kapacitet samo u LDM), da bi poređenje sa Timefold-om bilo
pošteno.

**Proba solvera (urađeno 29.10.2026)**:
- `frontend/src/domain/optimization/`: `routePlanner.ts` (prenos Java `RoutePlanner`-a, isti
  redosled pri izjednačenju, pa iste dužine), `solver.ts` (isti skor kao `RoutingConstraints`:
  početni raspored, pa simulirano kaljenje samo na soft nivou; potezi: premeštanje, zamena,
  zamena tovara dva kamiona, ruin & recreate, pražnjenje kamiona), `random.ts` (seed).
- Testovi (`tests/unit/solver.test.ts`, `routePlanner.test.ts`): test 7, test skora (2 kamiona
  pobeđuju 3), 60 malih primera upoređenih sa svim kombinacijama, isti seed daje isti rezultat.
  Provereno na pokvarenom kodu: bez ograničenja broja kamiona pada 8 testova; bez ruin &
  recreate i pražnjenja pada poređenje sa svim kombinacijama.
- **Poređenje sa Timefold-om** (`npm run test:oracle`, 31 primer: test 7 i 30 nasumičnih sa
  5–30 pošiljki): dužine ruta iste kao u Javi na svim Timefold rutama. Sa 2 s za TS i 10 s
  za Timefold: TS bolji na 21 (na 3 jedan kamion manje), isti na 9, lošiji na 1
  (`random-1004`, +26 km, 0,14 %). Sa istim vremenom (10 s): TS ni na jednom lošiji (test
  prošao; tabela tog pokretanja nije sačuvana).

**Zahtevi korisnika o platformi** (dogovoreno u razgovoru):
- Aplikacija radi **na uređaju**: sada na ličnom računaru, kasnije i na telefonu, **bez
  hostinga** i bez postavljanja na internet. Internet samo za pozive ka servisima za
  koordinate i kilometraže.
- Aplikacija za telefon se pravi naknadno i treba da radi **isto što i aplikacija za PC**
  (uvoz, optimizacija, 3D), na samom telefonu.
- Razmotreno i odbačeno: Cloudflare Tunnel + Access (traži domen, oko 10 €/god.) i
  Tailscale (besplatan plan je samo za nekomercijalnu upotrebu). Otvaranje porta na ruteru
  ne dolazi u obzir (nema prijave korisnika).

**Odluka A ili B** (Java backend na telefonu ne radi; Timefold i Spring nisu za Android);
**izabran B** 29.10.2026:
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
  (prvo sva preuzimanja, pa sve isporuke; Gojko potvrdio), kapacitet u kodu samo u LDM,
  pošiljke nedeljive. Po Gojkovim odgovorima težina postaje ograničenje (još nije u kodu).
  Izvan MVP-a: LIFO (D2 otvoreno), vremenski prozori, više tura.
- Backend (ceo API iz `frontend/src/api/client.ts`): Java 21, Spring Boot 4.1.1, Maven,
  Apache POI, Timefold Solver 2.7.1 (skor Hard/Medium/Soft: hard = LDM preko kapaciteta,
  medium = broj kamiona, soft = metri), nezavisni `SolutionValidator`. Rastojanja su za sada
  vazdušna linija (haversine); planirano: OSRM, geokodiranje, PostgreSQL.
- Frontend: React + TypeScript + Vite. Podrazumevano radi na uređaju (režim `local`, put B);
  može i nad mock API-jem ili, u režimu `server`, potpuno nad backend-om.

## Izvori istine

| Dokument | Gde | Napomena |
|---|---|---|
| Specifikacija v2 | **nije u repozitorijumu** | korisnik ju je dao u razgovoru; sažetak je u ovom fajlu |
| Dopuna 1 (API ugovor prema frontendu) | `docs/specifikacija-v2-dopuna-1.md` | obavezno pročitati pre rada na backend-u |
| Pitanja za vlasnika procesa | `docs/pitanja-za-vlasnika-procesa.md` | poslato 28.10.2026 |
| Odgovori vlasnika procesa | `docs/odgovori-vlasnika-procesa.md` | stigli 29.10.2026; menjaju model |
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
│   ├── src/api/                  ApiClient interfejs, tipovi, mock (src/api/mock/),
│   │                             local (src/api/local/, put B; deviceStore = IndexedDB),
│   │                             http (server)
│   ├── src/api/mock/import/      pravila čitanja Excel-a (referenca za backend)
│   ├── src/fixtures/             probni scenariji: small, test7, proven, notFound
│   ├── src/features/             ekrani: dashboard, shipments (+ import/), trucks,
│   │                             optimization, route-map, truck-3d (+ tego/),
│   │                             settings (samo režim local)
│   ├── src/domain/capacity.ts    donja granica po LDM (fixture-i); provere posla su u optimization/feasibility
│   ├── src/domain/fleet.ts       standardna cerada i flota koju pravi aplikacija
│   ├── src/domain/optimization/  put B: routePlanner, solver, random (seed), job (ulaz posla),
│   │                             feasibility (PROVEN), validator, result (API rezultat), loadPlan
│   ├── src/format/               jedini modul za formatiranje jedinica (LDM, km, kg, vreme)
│   ├── src/styles/               tokens.css (sve boje), base, layout, components
│   ├── public/legacy/tego/       TeGo 3D vizuelizator (klasične skripte; packwidget.js izmenjen)
│   ├── electron/                 aplikacija za PC: main.mjs, package.json (web/ = kopija dist/)
│   ├── electron-builder.yml      Windows instaler (release/)
│   ├── tests/oracle/             timefold.json (Timefold rezultati) i poređenje TS solvera
│   └── tests/unit, tests/e2e,    Vitest i Playwright (web), tests/desktop: Playwright nad
│       tests/desktop             Electron aplikacijom
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
                                  (TestWorkbooks pravi .xlsx u memoriji; Test7Data je test 7;
                                  oracle/TimefoldOracleTest piše tests/oracle/timefold.json)
```

## Komande

```bash
cd frontend
npm run dev                          # http://localhost:5173, na uređaju (put B), prazan početak
VITE_MOCK_SCENARIO=small npm run dev # na uređaju, probni početni podaci (i: test7, proven, notFound)
VITE_API_MODE=mock npm run dev       # mock, fiksan ishod po scenariju (podrazumevano "small")
VITE_API_MODE=server npm run dev     # sve preko backend-a (Vite proxy /api -> :8080)
npm run build                        # tsc -b && vite build
npm run lint
npm test                             # Vitest (logika, bez DOM-a)
npm run test:oracle                  # TS solver protiv Timefold-a, oko 5 min (ORACLE_MS=2000 za kraće)
npm run test:e2e                     # Playwright/Chromium; dev serveri 5174-5178 (videti niže)
npm run test:e2e:server              # Playwright nad pravim backend-om (sam ga diže; treba Java 21)
npm run desktop                      # aplikacija za PC iz izvornog koda (build + Electron)
npm run build:desktop                # instaler: release/RCVA-Setup-<verzija>.exe (+ win-unpacked/)
npm run test:desktop                 # Playwright nad Electron aplikacijom (4 testa)
RCVA_DESKTOP_EXE=release/win-unpacked/RCVA.exe npx playwright test -c playwright.desktop.config.ts

cd backend
./mvnw spring-boot:run               # http://localhost:8080/api/v1/health (Windows: mvnw.cmd)
./mvnw test                          # ili verify
# ponovo napraviti orakl (oko 6 min; samo ako se menja model ili generator):
./mvnw test -Dtest=TimefoldOracleTest -Doracle.out=../frontend/tests/oracle/timefold.json
```

Izvor podataka bira `VITE_API_MODE` (`src/api/apiMode.ts`, `src/api/createApiClient.ts`):
`local` (podrazumevano od 01.11.2026; podaci u pregledaču, prava optimizacija; prazan
uređaj kreće bez podataka, a sa `VITE_MOCK_SCENARIO` od tog scenarija), `mock` (fiksan
ishod po scenariju, podrazumevano `small`) ili `server`. U režimu `server` sve ide sa
backend-a, a `VITE_MOCK_SCENARIO` se ne koristi. Scenario važi samo za prazan uređaj; već
sačuvani podaci se ne menjaju. Bočna traka uvek prikazuje izvor podataka („Na uređaju“, sa
„(probni početni podaci)“ kad je zadat scenario).

Serverski e2e testovi dele jedan backend i izvršavaju se abecedno po fajlu:
`optimization.server` mora ići pre `shipmentImport.server`, jer uvoz dodaje pošiljke bez
koordinata, a sa njima server odbija optimizaciju (409).

Playwright pokreće po jedan dev server za mock scenarije `small` (5174), `proven` (5175) i
`notFound` (5176) (sa `VITE_API_MODE=mock`, jer je podrazumevani režim `local`), jedan u
režimu `local` nad `small` (5177) i jedan bez ijedne `VITE_` promenljive (5178, kao `npm
run dev`: podrazumevani režim, prazan uređaj). Testovi u
`tests/e2e/scenarios/<scenario>*.spec.ts` idu na server tog scenarija, `tests/e2e/local/`
na lokalni, a `tests/e2e/local-empty/` na 5178.

Stanje (01.11.2026, posle aplikacije za PC, na Node 24.22.1): frontend tsc, lint i build
čisti, 328 Vitest testova, Playwright 60 (mock 43 + local 16 + local-empty 1) i desktop 4
(i nad spakovanim `RCVA.exe`) prolaze; serverski e2e 9 poslednji put
31.10.2026 (posle toga `httpClient` je dobio samo metode koje vraćaju `null` ili 404);
`test:oracle` prošao 30.10.2026 (solver posle toga nije menjan). Backend `mvnw verify` poslednji put 28.10.2026 (backend nije menjan). Playwright (40 mock, 9 server) i backend `mvnw verify` (99 testova) poslednji put
pokrenuti 28.10.2026; posle toga backend je dobio samo `TimefoldOracleTest`, koji bez
`-Doracle.out` ne radi.

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
| Mapa ruta | mapa (Leaflet, podloga OSM) sa rutama u bojama kamiona i mestima (u režimu `local` sa ORS ključem po putu, inače isprekidane prave linije), filter po kamionu (`?truck=`), ispod spisak stanica |
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
5. ~~Odluka A/B~~ (izabran B 29.10.2026) i ~~proba TS solvera~~ (urađeno 29.10.2026).
   Dalje na putu B: videti „Sledeće na putu B“ u „Gde smo stali“.
6. ~~Mapa (Leaflet)~~ i ~~trajno čuvanje na putu B (IndexedDB)~~ (urađeno 31.10.2026), ~~izvoz i uvoz podataka u fajl~~ (urađeno 01.11.2026).
   Kasnije: završno testiranje (svih 9 testova).

Predlozi iz dopune 1 koji čekaju odluku: `GET /optimization-jobs/latest` (na putu B postoji
kao `getLatestOptimizationJob` u režimu `local`; backend ga nema, pa se tamo poslednji posao
gubi posle osvežavanja) i naziv i kapacitet kamiona u rezultatu (`inputSnapshot`).

## Otvorena pitanja

Gojko je odgovorio 29.10.2026 (`docs/odgovori-vlasnika-procesa.md`). Backend i ekrani još
rade na starim pretpostavkama (`optimization/routing/Assumptions.java`: dve faze, polazak iz
baze, povratak po `BaseSettings.returnToBase`). TS solver od 30.10.2026 ima otvorenu rutu,
utovar pozadi, težinu i standardnu flotu (`OPEN_ROUTE_REAR_LOADING`, `fleet.ts`), ali još
nije povezan sa ekranima. Šta odgovori menjaju:

- **Potvrđeno, bez promene**: dve faze po ruti (A1), jedna tura po kamionu (A4), bez
  obaveznog redosleda (A3), pošiljka se nikad ne deli (C5), LDM i čitanje težine (C1, C2),
  bez rokova (D1) i bez ograničenja puteva (D3) u prvoj verziji.
- **Otvorena ruta (A2)**: ruta počinje u prvom magacinu (bira ga optimizacija) i završava se
  kod poslednje isporuke; nema puta iz baze ni povratka. Menjaju se `RoutePlanner`,
  `SolutionValidator` i uloga `BaseSettings`.
- **Flota (B1)**: kamioni se ne unose; aplikacija pravi „Kamion 1“, „Kamion 2“... kao
  standardnu ceradu, a korisnik kasnije menja nazive i dimenzije i dodaje vozače.
- **Težina (B2)**: postaje ograničenje (ukupna težina ≤ nosivost kamiona); kamion dobija
  nosivost.

- **Utovar pozadi (D2)**: ono što se prvo istovara mora biti pozadi; važi već u prvoj
  verziji (odluka korisnika 30.10.2026). Utiče na redosled stanica i na 3D raspored.
  Korisnik 31.10.2026: utovar za sada ostaje jednostavan, samo pozadi; bočni utovar i
  slično su kasnija nadogradnja, pa Gojkov odgovor o utovaru sa strane ne blokira rad.

Otvoreno posle odgovora (detalji u odeljku „Otvoreno“ u dokumentu odgovora): nosivost
cerade („mislim 13 t“, uobičajeno je oko 24 t; privremeno 24 t), da li se cerada može
utovariti i sa strane (ako može, D2 utiče samo na 3D raspored, a ne na rute), da li je broj
kamiona ograničen (privremeno nije), početna tačka iz prethodne nedelje, uloga vozača. Specifikacija v2 nije u repozitorijumu, pa odgovori nisu upisani u nju.
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
- **Test sa težinom koji ne proverava težinu**: kod primera sa težinom proveriti da baš
  težina menja odgovor (npr. LDM dozvoljava 3 pošiljke po kamionu, a težina samo 2).
- **TS solver**: late acceptance zaglavi čim pretraga stane (cela istorija jednaka trenutnom
  skoru), pa se lošiji soft više ne prihvata; zato simulirano kaljenje. Samo premeštanje i
  zamena ne nalaze optimum ni na 6 pošiljki (treba „zameni, pa premesti treću“); to rešava
  ruin & recreate. `State.withAdded` sme samo za pošiljku koja nije na kamionu.
- **Playwright na novom računaru**: pregledač nije u repo-u; pre prvog e2e pokretanja
  `npx playwright install chromium`.
- **Vitest sakriva `console.log` testova koji prođu**; zato `test:oracle` ima
  `--silent=false` (tabela poređenja).
- **Mock ograničenja**: rezultat optimizacije je fiksan po scenariju (nema solvera);
  geokodiranje zna desetak gradova (`src/api/mock/import/gazetteer.ts`); rastojanja u
  scenariju `small` su vazdušna linija; poslednji posao se čuva samo u memoriji.
- **ORS Directions `/geojson` i `Accept`**: sa `Accept: application/json` pravi ORS
  odgovara 406 „This response format is not supported“ (odgovor je
  `application/geo+json`); zato `GEOJSON_ACCEPT`. Lažni ORS-ovi to nisu proveravali, pa je
  greška nađena tek sa pravim ključem (01.11.2026); sada sva tri lažna ORS-a (unit, local,
  e2e) odbijaju zahtev bez `application/geo+json`. Pouka: lažni servis treba da proverava i
  zaglavlja, ne samo telo zahteva. Ključ se proverava pre formata, pa se bez ključa ovo ne
  vidi curl-om.
- **`ELECTRON_RUN_AS_NODE=1`**: VS Code ga postavlja svojim podprocesima (i Claude Code-u
  u VS Code-u), pa Electron iz tog okruženja radi kao običan Node (`electron --version`
  ispisuje verziju Node-a). Desktop testovi ga brišu iz okruženja; ručno: `env -u
  ELECTRON_RUN_AS_NODE npx electron electron`. Dvoklik na instaliranu aplikaciju to nema.
- **electron-builder pakuje `node_modules` iz `frontend`-a** i kad je `directories.app`
  poseban folder bez zavisnosti (traži zavisnosti i u folderu projekta); zato
  `"!**/node_modules/**/*"` u `files` (`app.asar` 19,6 MB → 1,3 MB). Proveriti sadržaj
  `app.asar` posle promene podešavanja.
- **Playwright `getByText` traži deo teksta bez obzira na velika slova**: „Upisano pošiljki:
  2“ nalazi i „Biće upisano pošiljki: 2“ pre uvoza. Čekati tekst koji postoji tek na kraju
  (ili `exact: true`). Isti obrazac postoji u `geocoding.local.spec.ts`, ali tamo ga
  spašavaju kasnije provere.
- **Bash alat i heredoc**: obrnute kose crte i apostrofi u heredoc-u se kvare; skripte sa
  njima pisati alatom za fajlove (scratchpad), pa pokretati.
