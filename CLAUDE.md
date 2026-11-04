# RCVA: optimizacija utovara i ruta kamiona

Ovaj fajl je radni dnevnik projekta za ljude i za Claude sesije i agente. Claude Code ga
automatski učitava u svakoj sesiji pokrenutoj u `RCVA/` ili ispod. **Ažurirati ga na kraju
svakog većeg koraka** (odeljci „Stanje“ i „Sledeći koraci“).

Poslednje ažuriranje: 04.11.2026 (tipovi kamiona; pre toga meni „Popuni prema“, izgled i izvoz
PDF-a); videti „Gde smo stali“. Tipovi kamiona (`e217d15`, `eb709ca`) **još nisu push-ovani**.

## Gde smo stali (03.11.2026)

**Tipovi kamiona (urađeno 04.11.2026)**, na zahtev korisnika: „Popuni prema“ više ne nudi
kamione sa spiska (Kamion 1, Kamion 2…), nego „Ručni unos“, ugrađenu „Standardna cerada“ i
tipove koje je korisnik dodao. Odluke korisnika: **standardna cerada je ugrađena i ne menja se**
(po njoj rade „Dodaj N cerada“ i preporuka dodatnog kamiona), i **„Napravi tip“ od kamiona sa
spiska** (dugme u redu kamiona; naziv tipa bez broja na kraju, `typeDraftFromTruck`).
- `TruckType` / `TruckTypeInput` i `ApiClient.listTruckTypes/createTruckType/updateTruckType/
  deleteTruckType` (NOT IN SPEC v2). Provera u `api/truckValidation.ts`
  (`assertValidTruckType`): mere kao kod kamiona, naziv jedinstven bez obzira na velika slova i
  razmake, ne sme biti „Standardna cerada“ (`STANDARD_TYPE_NAME`). Kamion ne pamti tip, pa izmena
  ili brisanje tipa ne menja kamione; zato tip sme da se menja i dok posao radi.
- Uređaj: `LocalData.truckTypes` i `nextTruckTypeId` (neobavezni; stari snimci i fajlovi rade),
  u fajlu sa podacima i u pregledu pre uvoza („tipovi kamiona: N“). Mock: u memoriji, kreće
  prazan. `httpClient`: `null` / 404, pa se u režimu `server` odeljak ne prikazuje.
- Ekran: odeljak „Tipovi kamiona“ na dnu stranice Kamioni (`TruckTypes.tsx`, obrazac
  `TruckTypeForm.tsx` unutar odeljka; zajednička polja mera u `TruckMeasureFields.tsx`). Na
  stranici je uvek otvoren najviše jedan obrazac (kamion ili tip). Kamion od standardne cerade
  dobija „Kamion N“, od tipa „<naziv tipa> N“. Uputstvo dopunjeno.
- Testovi: `truckTemplates.test.ts` (9), dopune u `truckFormValidation`, `localClient`,
  `deviceFile`, `mockClient`; e2e u `trucks.spec.ts` (3 nova) i `storage.local.spec.ts`
  (tip posle osvežavanja). Na stranici Kamioni su sada dve tabele, pa testovi traže tabelu po
  imenu („Kamioni“, „Tipovi kamiona“). Provereno na pokvarenom kodu (21 izmena): svaka obara
  testove (brojač id-jeva tipa je u prvom pokušaju promakao, pa test sada briše i poslednji tip).
- Dugme u redu se zove „Napravi tip od <kamion>“, ne „Sačuvaj … kao tip“: ime koje počinje sa
  „Sačuvaj“ obaralo je postojeće testove (`getByRole('button', { name: 'Sačuvaj' })`).
- **Zatečeno, nije ispravljeno**: `optimization.spec.ts` („runs a job and shows summary…“) pada i
  na kodu pre ovih izmena, jer traži karticu „Skor“ koju je izvoz PDF-a (`e484e22`) zamenio.
  `routeMap.spec.ts` (test na liniji 71) je jednom pao u punom prolazu (dva opisa mesta odjednom),
  a sam prolazi (4 od 4, i na starijem kodu).
- Na širini telefona (390 px) bočna traka zauzima svoje mesto i sadržaj je stisnut na svim
  ekranima; to je deo koraka „telefon“.

**Novi kamion prema postojećem (urađeno 04.11.2026)**, na zahtev korisnika („moramo uvek da
unosimo ponovo“): u obrascu „Novi kamion“ (samo pri dodavanju) padajući meni „Popuni prema“:
„Ručni unos“, „Standardna cerada“ (`STANDARD_TRUCK`) i svaki kamion sa spiska. Izbor prepisuje
kapacitet, nosivost i dimenzije (dostupnost ostaje); naziv dobija prvi slobodan broj
(`nextFreeName`: „Šleper 1“ → „Šleper 3“ ako postoji 2), a naziv koji je korisnik sam upisao
se ne dira. U režimu `server` natpis opcije ne pominje nosivost. Logika u
`features/trucks/truckTemplates.ts`; Uputstvo dopunjeno. Testovi: `truckTemplates.test.ts`
(6), e2e u `trucks.spec.ts`; provereno na pokvarenom kodu (5 izmena), svaka obara testove.

**Sledeće**: aplikacija za **telefon** (plan predložiti i potvrditi pre početka). Ideja o
utovaru i istovaru usput je razmotrena 03.11.2026: **dve faze ostaju** (Gojko potvrdio A1),
a ideja je zapisana u „Mogući pravci razvoja“.
Pitanja za Gojka još nisu poslata (spisak od 30.10. dopunjen 02. i 03.11.).

**Sledeće posle Uputstva**: korisnik želi modernije i intuitivnije ekrane pre telefona; predlog
(pregled ekrana, probni izgled, izvođenje ekran po ekran) i pitanja (paleta uz logo, tamna tema,
samo izgled ili i tok, ko je korisnik) postavljena su 03.11.; čeka odgovore.

**Izgled, treći deo i PDF (urađeno 04.11.2026)**: gornja traka sa čipovima (klik vodi na
Rezultate, linija dok posao radi); 3D: spisak sa bojom bloka (`placementColor`), redosledom
istovara i popunjenošću; Uputstvo: tamna traka sadržaja desno (samo naslovi, klik otvara
podnaslove, jedno poglavlje), numerisani podnaslovi (`Subheading n`), formatiran tekst;
Podešavanja: numerisani delovi (`SettingsPart`), dugmad podataka dole desno; mapa preko celog
ekrana (Fullscreen API, inače preko stranice; `backdrop-filter` kartice se tada gasi);
**Izvezi PDF** (Rezultati, tamna kartica umesto „Skor“): `ResultReport.tsx` (portal u body, vidi
se samo u štampi, strana po kamionu), u pregledaču `window.print()`, na PC-u
`electron/preload.cjs` + `printToPDF` (`RCVA_PDF_PATH` za testove). **Zamke**: skriveno
polje (`input.visually-hidden`) je zadržavalo širinu polja i širilo stranicu (sada pravilo u
`base.css`); viseći selektor `.truck-form,` je obrazac kamiona pretvorio u krug; `npx prettier`
nije deo projekta (podrazumevana pravila menjaju stil). Testovi: `resultReport.local.spec.ts`,
desktop PDF korak, dopune u `help`, `smoke`, `routeMap`, `deviceData`.

**Izgled, drugi deo (urađeno 04.11.2026)**, na zahtev korisnika, korak po korak (provera
snimcima ekrana; testovi samo kad se dira raspored ili TeGo):
- Stranica bež (`--bg: var(--beige)`), kartice belo staklo (`--card-surface` providna bela,
  korisnik ju je sam podesio na 0.5; `--card-blur`, `backdrop-filter`; bez podrške pune bele),
  gornja traka isto staklo. Pozadina: slojevi papira isečeni u talas (`BackgroundWaves.tsx`,
  fiksni SVG sa `z-index: -2`, boje `--wave-1..4`, senka `--wave-shadow`; ivice namerno nisu
  paralelne), po slici koju je korisnik poslao, ali blaže.
- **Zamka**: na ovom računaru su u Windows-u isključeni „Efekti providnosti“
  (`EnableTransparency = 0`), a Chrome to javlja kao `prefers-reduced-transparency: reduce`
  (i Playwright). Staklo zato ne poštuje tu postavku (korisnik ga je izričito tražio).
- Tamne kartice: `panel--cherry` (Upozorenja) i `panel--dark` (Pošiljke prema kamionima,
  dijagonalno od višnje); na njima sve svetlo (`--on-dark-*`: tekst, linkovi, dugmad, fokus,
  ikonice upozorenja i trake; kontrast izmeren, najmanje 5,4 : 1). Najviše dve tamne kartice.
- Brze akcije: četiri pločice sa ikonicom, naslovom i opisom (`QuickAction`; ime dugmeta je
  naslov, opis je `aria-describedby`), „Pokreni optimizaciju“ u višnji (bez svetlog
  unutrašnjeg ruba, jer na višnji izgleda kao dupla ivica).
- Trake „Kilometri po kamionu“ izgledaju kao trake popunjenosti (8 px, zaobljene, na stazi).
- **Greška od 03.11. ispravljena**: blok za kartice je bojio i obaveštenja u belo, pa
  zeleno, narandžasto i crveno obaveštenje nisu imali svoju pozadinu.
- TeGo (`packwidget.js`, izmena označena „RCVA“): platno ima alfa kanal i briše se providno;
  krem dobija samo okvir 3D prikaza, pa se talasi vide i na 3D ekranu. Testovi 8 i 9 prolaze.

**Izgled i Pregled (urađeno 03.11.2026)**, na zahtev korisnika, korak po korak:
kartice sa 3D senkom i većim razmakom (`--shadow-card`, `--shadow-card-raised`, `--card-edge`,
`--radius-lg`, `--card-gap` u `tokens.css`), naslovi velikim slovima sa težinom po važnosti (h1 800,
h2 i naslovi obaveštenja 700, h3 600), naslov kartice pregledača „RCVA – rutiranje i
vizualizacija“. **Pregled**: ikonice na karticama, kartica „Ukupna težina“, „Pošiljke prema
kamionima“ (trake LDM i težine; do 85 % akcent, do 100 % upozorenje, preko greška), prsten
„Status pošiljki“, u „Poslednjoj optimizaciji“ popunjenost i kilometri po kamionu, i
„Pokrenute optimizacije“: glatka kriva (monotona, ne ide ispod nule) po danu (14), nedelji (12,
od ponedeljka) ili mesecu (12), prelazak mišem i strelice, skrivena tabela; sve bez biblioteke
(`DashboardCharts.tsx`, `ActivityChart.tsx`, `activityModel.ts`). Animacije pri svakom ulasku
(kartice, trake, prsten, kriva), isključene uz „smanji animacije“. Uređaj od sada pamti
vreme pokretanja svakog posla (`LocalData.jobLog`, `KEPT_JOB_LOG` 5000, u fajlu za izvoz;
`ApiClient.getOptimizationHistory`, NOT IN SPEC v2; HTTP `null`). Validator boja (skill dataviz):
boje ruta `--route-1..8` ne prolaze kao paleta za razlikovanje; Pregled zato boji trake jednom
bojom, a kamion imenuje tekst. Testovi: `activityModel.test.ts`, dopune u
`dashboardModel.test.ts`, `localClient.test.ts` (istorija), e2e u `dashboard.spec.ts` i
`dashboard.local.spec.ts`.
- Dorade istog dana: kartica „Najveća mesta po LDM“ uklonjena; grafik počinje jedan period
  pre prve optimizacije (`fromFirstActivity`) i ima „Proširi“ / „Suzi“ (dan ±7, nedelja i
  mesec ±4; najviše 90 / 52 / 36, najmanje 2 tačke); raspored: levo „Poslednja optimizacija“,
  desno „Upozorenja“ iznad grafika, u ravni (`.dashboard-split`, container query 46rem);
  upozorenja popunjavaju ostatak (`contain: size`) i dobijaju strane (`WarningsPanel.tsx`,
  `warningPages.ts`), u jednoj koloni sva; gornje dve kartice iste visine.
- **Zamka**: `.visually-hidden` na samoj `<table>` ne radi (tabela ne poštuje visinu 1px), pa je
  skrivena tabela grafika produžavala stranicu ispod bočne trake. Sakriva se omotač `<div>`;
  e2e proverava da je skriveni deo visok najviše 1px.

**Uputstvo (urađeno 03.11.2026)**, na zahtev korisnika: ekran `/help` („Uputstvo“, poslednji u
meniju, ikonica `info`; `features/help/HelpPage.tsx`). Poglavlja: Ukratko, Kako se koristi
(uvoz, provera pošiljki, kamioni i lokacije, pokretanje, rezultat, podešavanja i podaci), Kako
radi optimizacija (pravila, 5 koraka, preporuka dodatnog kamiona, kilometraže, šta ne
garantuje), Saveti, Poruke i šta znače; sadržaj sa linkovima na poglavlja. Delovi samo za
uređaj se u režimima `mock` i `server` ne prikazuju. **Tekst prati ekrane: pri promeni
ekrana, poruka ili algoritma ažurirati i Uputstvo.** Testovi: `help.local.spec.ts`, u
`smoke.spec.ts` ruta `/help` i provera da u mock-u nema delova za uređaj.
- Usput: natpis ispod kilometraže je sada „od lokacije kamiona do poslednjeg istovara“ kada
  rute kreću sa lokacije kamiona (ranije netačno „od prvog utovara“).
- `geocoding.local.spec.ts`: razmak od 1 s je padao u punim prolazima (izmereno 806 ms) jer
  je meren kada zahtev stigne do test procesa, što kasni pod opterećenjem. Sada se meri u
  stranici, kada aplikacija pozove `fetch` (`addInitScript`), i traži ≥ 1000 ms; sa
  razmakom 500 ms u aplikaciji test pada (511 ms).
- Natpis u bočnoj traci „Rutiranje i Vizualizacija“ (umesto „Utovar i rute“) je izmena
  korisnika; nehotice je ušla u commit sa logom (`1e62e44`, `git add -A`), poruka je ne pominje.
  Naslov kartice je i dalje „RCVA – utovar i rute“.

**Logo i favicon (urađeno 03.11.2026)**, na zahtev korisnika (slika: kutija sa crvenom
strelicom). Izvor je `frontend/branding/logo-source.png` (1254 × 1254, prozirna pozadina);
`npm run icons` (`scripts/make-icons.mjs`) odseca prozirne ivice, centrira znak u kvadrat i
pravi `public/favicon.ico` (16, 32, 48), `public/logo.png` (256) i `branding/icon.ico` (16 do
256) preko Chromium-a iz Playwright-a (canvas; na računaru nema ni Pillow ni ImageMagick).
Koristi se kao favicon (`index.html`, stari Vite `favicon.svg` obrisan), logo u bočnoj traci
(umesto ikonice kamiona), ikonica prozora aplikacije za PC (`main.mjs`, `web/logo.png`) i
ikonica instalera i `RCVA.exe` (`electron-builder.yml` `win.icon`). Test: `smoke.spec.ts`
(logo učitan, favicon u stranici i služi se kao .ico sa 3 slike).
- Na ovom računaru je za desktop testove preuzet Electron program (`node
node_modules/electron/install.js`, preskočen pri `npm install --ignore-scripts`). Desktop test
uvoza je pao na proveri iz 02.11. (broj uz mesto: sada 2 mesta, ne 3) i na kamionu bez
lokacije; ispravljen, sada 4/4.

**Lokacije kamiona, nedostatak kamiona i preporuka dodatnog kamiona (urađeno 03.11.2026)**.
Odluke korisnika: lokacija se unosi za svaki kamion pre optimizacije; poslednja adresa
(poslednja isporuka) je samo **predlog koji korisnik potvrđuje** („kad stigne nov predlog“);
nov kamion dobija mesto koje korisnik unese; kad kamioni ne stanu, korisnik bira „dodaj
kamione“ ili „optimizuj bez nekih pošiljki“; dodatni kamion se preporučuje kad k+1 kamiona
daje bar **10 %** manje km (prag u Podešavanjima, prazno = isključeno), drugo rešavanje traje
**koliko i prvo**. Pitanje „računa li se prazna vožnja isto kao vožnja sa robom“ ide Gojku.
- **B1 zamenjeno**: posao koristi samo kamione sa spiska; cerade se više ne dodaju same.
  Svaki dostupni kamion mora imati potvrđenu lokaciju (`Truck.startLocationId`, NOT IN SPEC
  v2), inače 409 „Kamioni bez potvrđene lokacije“. Probni scenario na praznom uređaju stavlja
  svoje kamione u svoju bazu. Mesta kamiona se čuvaju i pri „Ukloni sve pošiljke“ i izmeni
  pošiljke (`keptPlaces`).
- **Solver** (`solver.ts`, sve isključeno podrazumevano, pa je ponašanje kao ranije; orakl sa
  2 s daje iste brojeve kao 29.10.: 21 bolji, 9 isti, 1 lošiji `random-1004` +26 km):
  `SolverTruck.start` (planer po polaznoj tački, `plannersFor`), `allowUnassigned`
  (pošiljke van kamiona; medium = prvo izostavljeni LDM × (kamioni + 1), pa kamioni),
  `freeTrucks` (do toliko kamiona bez cene, za „pokreni sa N kamiona“) i `exactTrucks`
  (tačno toliko kamiona, za poređenje). Broj korišćenih kamiona se vodi usput (`used`), da
  `withAdded` ostane O(1). `JobTruck.startLocationId`, `startOf`, prva deonica i validator
  (ruta mora krenuti sa mesta kamiona), `RoutePlan.startLocationId`.
- **Zamka nađena testom**: preporuka sa `freeTrucks` je poredila pogrešno: zamišljeni kamion
  bez prazne vožnje samo bi **zamenio** postojeći (2 kamiona, 390 km umesto 1000 km). Zato
  `exactTrucks = k + 1`: poredi se baš „k kamiona“ sa „k+1 kamiona“.
- API (NOT IN SPEC v2): `getTruckStarts` (potvrđena lokacija i predlog: poslednja isporuka
  najnovijeg završenog posla posle `startSetAfterJobId`), `setTruckStart` (`{ place }` kao
  mesto pošiljke, preko `shipmentEdit.locatePlace`, bez pravljenja mesta ako nije nađeno;
  `{ proposalJobId }`; `{ keep: true }`), `OptimizationJobRequest.allowUnassigned` i
  `freeTrucks`, 422 sa `missingTrucks` (`fleet.missingTrucks`: najmanje standardnih cerada
  da ništa ne bude dokazano), `OptimizationResult.extraTruck` (`trucksUsed`, `totalMeters`,
  `savingPercent`, `newTruck`), `DeviceSettings.extraTruckSavingPercent`. Mock i
  `httpClient`: lokacija nema (`null` / 404). Fajl sa podacima nosi nova polja (sva
  neobavezna, stari fajlovi rade) i proverava da je kamion na postojećem mestu.
- Ekrani: Kamioni, odeljak „Lokacije kamiona“ (`TruckLocations.tsx`: unos mesta, „Potvrdi
  predlog“, „Zadrži sadašnju“, i za sve odjednom); pokretanje na uređaju prvo proverava
  lokacije (`LastJobState` `needsLocations`, `LocationsCheck` na Rezultatima; gornja traka i
  Pregled tada vode na Rezultate); 422 i NOT_FOUND nude „Dodaj N cerada“ / „Optimizuj bez
  nekih pošiljki“ (`FleetActions.tsx`); rezultat sa nedodeljenim pošiljkama i preporuka sa
  dugmetom „Dodaj kamion i pokreni ponovo“ ili „Pokreni sa N kamiona“; Podešavanja: prag;
  Pregled: upozorenja o kamionima bez lokacije i predlozima; spisak stanica „Polazak“, mapa
  počinje od mesta kamiona; tabela kamiona ima ime „Kamioni“.
- Testovi: `truckStart.test.ts` (11), nove grupe u `solver.test.ts`, `validator.test.ts`,
  `mapModel.test.ts`, `resultRows.test.ts`, `dashboardModel.test.ts`, slučajevi u
  `deviceFile.test.ts`; izmenjeni `localClient.test.ts` (nema više dodavanja cerada);
  e2e `tests/e2e/local/fleet.local.spec.ts` (4) i prepravljeni lokalni e2e (polazak, predlozi,
  tabela „Kamioni“; u `trucks.spec.ts` test sačeka da posao postoji, jer pokretanje prvo
  pita za lokacije). Dva testa provere svih kombinacija u `solver.test.ts` dobila su 30 s
  (trajala su 2–3 s sama, blizu 5 s kada se svi fajlovi puštaju odjednom).
- **Upotrebljivost (za razgovor sa korisnikom)**: posle **svakog** završenog posla korišćeni
  kamioni dobijaju predlog, pa ponovno pokretanje iste nedelje traži odgovor (zato
  „Zadrži sve sadašnje lokacije“). Moguća dorada: predlog samo kad se pošiljke promene.

**Izmena pošiljki posle uvoza (urađeno 02.11.2026)**, na zahtev korisnika (pošiljka sa
„Nejasna lokacija“ se ranije popravljala samo novim uvozom). Odluke korisnika: ispravka
mesta bez koordinata se **nudi i za ostale pošiljke** sa tim mestom (uključeno unapred), i
**ručne koordinate** kada Nominatim ne nađe mesto.
- `ApiClient.updateShipment(id, ShipmentPatch)` (NOT IN SPEC v2): ID, LDM, težina, opis,
  mesta (`PlaceInput`: naziv, poštanski broj, zemlja, `coordinates`,
  `moveOtherShipments`). Logika je u `src/api/mock/shipmentEdit.ts` (deli je mock sa
  probnim spiskom i `localClient` sa Nominatim-om); `httpClient` 404, a dugme „Izmeni“ se
  u režimu `server` ne prikazuje. 400 po polju (ništa se ne menja i ništa se ne traži), 404,
  409 dok posao čeka ili radi (pre traženja i ponovo pre izmene).
- Mesto zadržava naziv i koordinate kad ih jednom ima (sačuvani rezultati ga koriste): nov
  naziv je drugo mesto (postojeće po nazivu i poštanskom broju, `findPlace`, ili novo).
  Koordinate dobija samo mesto bez njih: od Nominatim-a (samo mesta ove pošiljke, kroz isti
  `locate` i keš, pa se zapamćen odgovor ne traži ponovo) ili ručno (`MANUAL`; ručne
  koordinate za mesto koje ih već ima daju 400). Pri svakom čuvanju se mesta pošiljke bez
  koordinata traže ponovo (neuspeo zahtev se tada ponavlja). Pronađen ručno upisan naziv je
  `MANUAL` (kao ispravljen red pri uvozu). Ostale pošiljke se prebacuju samo sa mesta bez
  koordinata. Mesto koje više niko ne koristi se briše, osim baze i mesta sačuvanih poslova
  (`keptPlaces`, isto kao „Ukloni sve pošiljke“); mock ne briše mesta.
- Ekran: dugme „Izmeni“ u redu tabele Pošiljke, obrazac ispod reda (`ShipmentEditor.tsx`,
  model `shipmentEditModel.ts`): stanje koordinata svakog mesta, polje „Koordinate (ručno,
  neobavezno)“ samo za mesto bez koordinata ili zamenjeno mesto
  (`src/format/coordinates.ts`: „45.2671, 19.8335“ kao u Google mapama, ili sa decimalnim
  zarezom), oznaka „Ispravi i u ostalim pošiljkama sa mestom „X“ (N)“ i obaveštenje posle
  čuvanja (šta je pronađeno, šta nije, koliko je pošiljki prebačeno).
- Testovi: `shipmentEdit.test.ts` (12), `shipmentEditModel.test.ts` (9),
  `coordinates.test.ts` (16), e2e `tests/e2e/local/editShipment.local.spec.ts` (3).
  Provereno na pokvarenom kodu (15 izmena u logici i modelu, 4 na ekranu): svaka obara
  testove (409 pre traženja je promakla, pa test sada proverava i da se ništa ne traži).
  Izgled proveren snimkom ekrana.
- **Ispravka 02.11.2026** (korisnik: promena naziva ne traži ponovo): odgovori se pamte po
  nazivu bez kvačica i velikih slova, pa „Lösestad“ posle „LOSESTAD“ (zapamćeno „nije
  pronađeno“) nije pitano, a mesto je zadržavalo stari naziv; isto za ranije probani naziv.
  Sada `PlaceLocator` prima `{ again }`: naziv koji korisnik upiše i sačuva pita se ponovo i
  kada je zapamćeno „nije pronađeno“ (zapamćeno „pronađeno“ se koristi), a mesto bez
  koordinata dobija naziv kako je upisan. Čuvanje bez promene mesta koristi zapamćen odgovor.
  Nov naziv koji nikad nije pitan pitao se i ranije. Testovi: 2 u `shipmentEdit.test.ts`, 1 e2e;
  provereno na pokvarenom kodu (3 izmene).
- Ograničenje: mesto koje je Nominatim našao na pogrešnom mestu (isto ime, drugi grad) ne
  može se pomeriti ručnim koordinatama; pomaže samo drugačiji naziv.

**Broj uz mesto se skriva i zanemaruje (02.11.2026)**, odluka korisnika („mislim da broj
koji stoji pored imena gradova nije poštanski“), dok Gojko ne odgovori. Upozorenje dato pre
odluke: u stvarnom fajlu se brojevi poklapaju sa švedskim i norveškim poštanskim brojevima
mesta istovara (i kad stoje uz mesto utovara), osim jednog sa 6 cifara; korisnik je ipak
izabrao da se sakrije. **Pitanje za Gojka** (dodato na spisak od 30.10.): da li je broj uz
mesto poštanski broj mesta istovara, ili nešto drugo (koje mesto, šta znači), i da li ga
treba prikazivati.
- Broj se i dalje izdvaja iz naziva i čuva u `Location.postalCode` / `PlaceGuess.postalCode`
  (ništa se ne gubi ako Gojko kaže da jeste poštanski), ali: mesta se prepoznaju **samo po
  nazivu** (`findPlace`, `placeId` u `importStore.ts`; isti grad sa dva broja je jedno
  mesto); broj više ne daje greške pri uvozu (nema „Neispravan poštanski broj“, a „Više
  odredišta“ samo za zarez u delu isporuke); kolona „Poštanski broj isporuke“ se ne nudi pri
  mapiranju; zamenjeno mesto u izmeni pošiljke ne preuzima broj.
- Skriveno: kolona u tabeli Pošiljke i CSV-u, broj u pregledu redova uvoza, polja u
  ispravci reda i u izmeni pošiljke. Probni podaci (fixture-i) i fajl sa podacima ga i dalje
  imaju.
- **Mock i Java se sada razlikuju**: Java uvoz (režim `server`) i dalje proverava broj i
  razlikuje mesta po njemu; backend se na putu B ne menja.
- Testovi: izmenjeni postojeći (parser, mock uvoz, `localClient`, tabela i CSV, mapiranje,
  model izmene, e2e `shipments.spec.ts`), nov u `localClient.test.ts` (isto mesto sa dva
  broja u jednom fajlu) i provere da se broj ne vidi u `editShipment.local.spec.ts`.
  Provereno na pokvarenom kodu (7 izmena): svaka obara testove.

**Novi računar (02.11.2026)**: Node 24.14.0 i npm 10.9.0 (na drugom 24.22.1 i npm 11).
Posle `git pull` treba `npm install` u `frontend`; ovde je urađeno `npm install
--ignore-scripts`, jer npm 10 sam pokreće instalacionu skriptu `electron-winstaller`, koja
nije odobravana (lock fajl nepromenjen). Aplikacija za PC ovde nije probana.

## Ranije (01.11.2026)

**Sledeće**: aplikacija za **telefon** (Capacitor, isti web kod); plan predložiti i potvrditi
pre početka. Urađeno 01.11.2026 redom koji je korisnik izabrao: 1. upozorenja na Pregledu,
2. podrazumevani režim `local`, 3. aplikacija za PC (Electron). Korisnik još nije
instalirao `RCVA-Setup-1.0.0.exe` ni preneo podatke iz pregledača (izvoz/uvoz fajla).
Moguće dorade za PC (nisu tražene): ~~sopstvena ikonica~~ (urađeno 03.11.2026),
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
  `RCVA-Setup-1.0.0.exe` oko 115 MB, nepotpisan, ikonica iz `branding/icon.ico` (od 03.11.). `app.asar` sadrži
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
  kao „Kamion N“ (prvi slobodan broj) kada se posao završi. **Zamenjeno 03.11.2026**: posao
  koristi samo kamione sa spiska (videti „Gde smo stali“).
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
posebna pošiljka); poštanski broj napisan uz mesto utovara, a pripada mestu istovara (dopuna
02.11.2026: da li je broj uz mesto uopšte poštanski broj i da li ga prikazivati; aplikacija
ga do odgovora skriva i zanemaruje); da li
je mesto (grad) dovoljno ili će biti adrese; utovar u više zemalja i istovar u Švedskoj i
Norveškoj u istom kamionu (granice, carina); da li sve iz tabele mora iste nedelje i koliko
kamiona najviše ima; uloga vozača; (dodato 03.11.2026) da li se prazna vožnja kamiona od
njegove lokacije do prvog utovara računa isto kao vožnja sa robom, i da li je lokacija
kamiona na početku nedelje mesto njegove poslednje isporuke iz prethodne nedelje.

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
│   ├── src/api/mock/import/      pravila čitanja Excel-a (referenca za backend);
│   │                             src/api/mock/shipmentEdit.ts: izmena pošiljke (mock i local)
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
│   ├── branding/                 logo-source.png (izvor loga) i icon.ico (npm run icons)
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
npm run icons                        # favicon, logo i ikonica za PC iz branding/logo-source.png
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

Stanje (04.11.2026, posle tipova kamiona, na Node 24.14.0): frontend tsc, lint i build čisti,
425 Vitest testova prolaze, Playwright 80 od 82 (pada zastareli test „Skor“ u
`optimization.spec.ts` i jednom nestabilni test mape; videti „Gde smo stali“). Pre toga (posle
menija „Popuni prema“): 414 Vitest testova. Ranije (03.11.2026, posle Uputstva i Pregleda sa grafikonima): 408 Vitest testova, Playwright 75 i desktop 4 prolaze (spakovani
`RCVA.exe` proveren pre ovih izmena, sa novom ikonicom); `test:oracle` sa 2 s (`ORACLE_MS=2000`) daje iste brojeve kao 29.10.
Provereno na pokvarenom kodu (33 izmene): 32 obaraju testove, jedna je ekvivalentna
(potvrđen predlog bez zapisa vremena: predlog je tada ionako mesto kamiona).
Prvi pun Playwright posle `npm install` na novom računaru trajao je 10,9 min i 2 testa su
pala (test 9 u `truck3d.spec.ts` i razmak od 1 s u `geocoding.local.spec.ts`); sami i u
drugom punom prolazu (2,2 min) prolaze. Razmak od 1 s u `geocoding.local.spec.ts` je 03.11. još
jednom pao u punom prolazu (pod opterećenjem), a sam prolazi. Desktop 4 poslednji put 01.11.2026 (na drugom
računaru, i nad spakovanim `RCVA.exe`); serverski e2e 9 poslednji put
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
| Pošiljke | tabela sa izvedenim statusom, CSV izvoz (UTF-8 BOM, `;`, decimalni zarez), **uvoz Excel-a u 4 koraka** (fajl → mapiranje kolona → greške, duplikati, ručna ispravka i isključivanje reda → potvrda), **izmena pošiljke posle uvoza** (mesta, ručne koordinate, ID, LDM, težina, opis; ne u režimu `server`) |
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
   `frontend/src/api/mock/import/` i Java pravila su bila ista; od 02.11.2026 se razlikuju
   u broju uz mesto (frontend ga zanemaruje, Java ne).
3. ~~Timefold optimizacija~~ (urađeno 28.10.2026, **na pretpostavkama** iz
   `optimization/routing/Assumptions.java`; kada Gojko odgovori, proveriti ih).
   Testovi 1–3, 5a i 6 iz Spec v2 nisu preneti: specifikacija nije u repozitorijumu, a ovde
   su opisani samo testovi 4, 5b, 7, 8 i 9.
4. ~~SimpleLoadPlanner na serveru~~ (urađeno 28.10.2026).
5. ~~Odluka A/B~~ (izabran B 29.10.2026) i ~~proba TS solvera~~ (urađeno 29.10.2026).
   Dalje na putu B: videti „Sledeće na putu B“ u „Gde smo stali“.
6. ~~Mapa (Leaflet)~~ i ~~trajno čuvanje na putu B (IndexedDB)~~ (urađeno 31.10.2026), ~~izvoz i uvoz podataka u fajl~~ (urađeno 01.11.2026).
   Kasnije: završno testiranje (svih 9 testova).

## Mogući pravci razvoja

Zapisano na zahtev korisnika; ništa od ovoga nije dogovoreno za rad.

- **Utovar i istovar usput (mešane faze)**, ideja korisnika 03.11.2026: ruta ne mora biti
  „sve utovari, pa sve istovari“; npr. Beograd → Novi Sad (istovar jednog paketa, utovar
  novog) → Budimpešta (ostalo). **Za sada ostaju dve faze** jer ih je Gojko potvrdio (A1);
  pre rada pitati Gojka da li se to u praksi radi ili su dve faze pravilo (carina, papiri).
  Šta bi se menjalo: utovar pozadi i dalje važi, pa se usput istovara samo ono što je pozadi
  (novi paket mora izaći pre robe koja je već unutra); kapacitet (LDM i težina) postaje po
  deonici, ne za ceo teret; planer ruta (`routePlanner.ts`) bi tražio redosled stanica
  među mnogo više mogućnosti (tačno do oko 6–7 pošiljki po kamionu, preko toga približno),
  a menjali bi se i validator (dve faze se sada uvek proveravaju) i 3D raspored (teret se
  menja po deonicama). Predlog: kao opcija, uz dve faze kao podrazumevane.

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
kamiona ograničen (privremeno nije), početna tačka iz prethodne nedelje, uloga vozača, i (od
02.11.2026) da li je broj uz mesto poštanski broj (do odgovora se skriva i zanemaruje). Specifikacija v2 nije u repozitorijumu, pa odgovori nisu upisani u nju.
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
