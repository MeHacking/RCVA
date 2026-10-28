# Specifikacija v2 – dopuna 1: API ugovor prema frontendu

Datum: 28.10.2026.
Osnova: frontend na commit-u `c2bbd4c` (grana `main`, github.com/MeHacking/RCVA).

Status: predlog za usvajanje pre izrade backend-a. Sve što je u ovom dokumentu opisano kao
„radi u frontendu“ postoji u kodu i pokriveno je testovima nad mock API-jem. Sve što je
označeno kao **predlog** još nije urađeno ni na frontendu ni na backend-u.

## Zašto ova dopuna

Frontend je urađen nad mock API-jem (`frontend/src/api/mock/`), koji se kasnije menja HTTP
klijentom na jednom mestu (`frontend/src/api/createApiClient.ts`). Tokom rada se pokazalo da
ekranima treba nekoliko stvari kojih nema u odeljku 6 Specifikacije v2, i da neka pravila iz
specifikacije treba precizirati. Bez ovoga backend bi napravio API koji frontend ne može da
koristi bez izmena.

Ugovor koji frontend očekuje je u kodu:

- `frontend/src/api/types.ts`: svi tipovi zahteva i odgovora
- `frontend/src/api/client.ts`: interfejs `ApiClient`, tj. spisak poziva

## 1. Pregled

| # | Stavka | Spec v2 | Dopuna | Stanje u frontendu |
|---|---|---|---|---|
| 1 | `DELETE /trucks/{id}` | navedeno, bez pravila | 409 dok je posao u toku | radi |
| 2 | `PUT /imports/{id}/rows/{rowNumber}` | ne postoji | ručna ispravka jednog reda pre potvrde | radi |
| 3 | `unassignedShipmentIds` u rezultatu | ne postoji | obavezno polje | radi |
| 4 | `timeLimitSeconds` u poslu | `timeLimit` | isti naziv i jedinica kao u zahtevu | radi |
| 5 | Pravila čitanja Excel-a | samo opisno | tačna pravila (odeljak 4) | radi u mock-u |
| 6 | Status pošiljke | ne postoji | izvodi se iz lokacija (odeljak 5) | radi, bez izmene API-ja |
| 7 | Raspored tereta (`load-plan`) | ugovor bez detalja | precizirane ose, dimenzije i greške (odeljak 6) | radi |
| 8 | Poslednji posao | ne postoji | **predlog**: `GET /optimization-jobs/latest` | nije urađeno |
| 9 | Kamion u rezultatu | rezultat pokazuje na `inputSnapshot` | **predlog**: naziv i kapacitet kamiona u `RoutePlan` | nije urađeno |

## 2. Kamioni

### 2.1 `DELETE /trucks/{id}`

| Odgovor | Kada |
|---|---|
| `204 No Content` | kamion je uklonjen |
| `404` | kamion ne postoji |
| `409` | postoji posao optimizacije u statusu `QUEUED` ili `RUNNING`; solver možda koristi taj kamion |

Telo odgovora `409` (Problem Details):

```json
{ "title": "Kamion se koristi", "status": 409,
  "detail": "Optimizacija #1 je u toku; kamion se može ukloniti kada se završi." }
```

Završeni rezultati se ne menjaju: rezultat pokazuje na `inputSnapshot` (Spec v2, odeljak 5).
Frontend uklonjeni kamion u starom rezultatu prikazuje kao „Kamion #id“, dok se ne usvoji
tačka 7.2.

Napomena za korisnike: kamion se iz optimizacije može isključiti i bez brisanja, poljem
`available: false`.

## 3. Optimizacija

### 3.1 `timeLimitSeconds`

Spec v2 u modelu `OptimizationJob` ima polje `timeLimit`, a u zahtevu `timeLimitSeconds`.
Predlog: oba se zovu `timeLimitSeconds` (ceo broj sekundi, > 0). Za vrednost ≤ 0 odgovor je
`400` sa `errors.timeLimitSeconds`.

### 3.2 `unassignedShipmentIds` u rezultatu

`GET /optimization-jobs/{id}/result` dobija obavezno polje:

```json
"unassignedShipmentIds": [105]
```

Ovo su pošiljke koje nisu na nijednoj ruti; ekran rezultata ih prikazuje posebnom tabelom.
Kada nema takvih, šalje se prazan niz, a ne `null`.

### 3.3 Rezultat postoji samo za `COMPLETED`

`GET .../result` za posao koji nije `COMPLETED` vraća `409`. Za `INFEASIBLE` /
`NOT_FOUND` frontend prikazuje poruku iz statusa posla i ne traži rezultat.

## 4. Uvoz Excel-a

### 4.1 Tok i endpoint-i

| Korak | Poziv | Uspeh | Greške |
|---|---|---|---|
| 1. fajl | `POST /imports/excel` (multipart, polje `file`) | `201` `ImportCreated` | `415` nije .xlsx, `400` fajl se ne može pročitati |
| 2. mapiranje | `PUT /imports/{id}/mapping` | `200` | `400` sa `errors` po polju, `404` |
| 3. pregled | `GET /imports/{id}/preview` | `200` `ImportPreview` | `409` mapiranje nije zadato |
| 3. ispravka | `PUT /imports/{id}/rows/{rowNumber}` (**novo**) | `200` `ImportRow` | `400`, `404`, `409` |
| 4. potvrda | `POST /imports/{id}/commit` | `200` `ImportCommitResult` | `409` već potvrđeno ili mapiranje nije zadato |

Ponovno zadavanje mapiranja ponovo čita sve redove i briše ranije ispravke; frontend o tome
upozorava korisnika.

### 4.2 Tipovi

```ts
ImportCreated   { importId, fileName, sheets: [{ name, rowCount, previewRows: string[][] }] }  // prvih 6 redova kao tekst
ImportMapping   { sheetName, headerRow /* 1-based */, columns: { [ImportField]: number /* 0-based kolona */ } }
ImportField     'externalId' | 'relation' | 'pickup' | 'delivery' | 'deliveryPostalCode' | 'ldm' | 'weight' | 'description'
PlaceGuess      { name, postalCode: string | null, country: string | null }
ImportRow       { rowNumber, sourceText, externalId, pickup: PlaceGuess | null, delivery: PlaceGuess | null,
                  ldmTenths: number | null, weightKg: number | null, description: string | null,
                  errors: string[], warnings: string[], excluded: boolean, corrected: boolean }
ImportPreview   { importId, fileName, rows: ImportRow[] }
ImportRowPatch  { externalId?, pickup?: PlaceGuess, delivery?: PlaceGuess, ldmTenths?, excluded? }
ImportCommitResult { created, skipped }
```

### 4.3 Provera mapiranja (`400`, ključevi u `errors`)

| Ključ | Pravilo |
|---|---|
| `headerRow` | red postoji i ispod njega je bar jedan red podataka |
| `ldm` | kolona za LDM je obavezna |
| `relation` | ili kolona `relation`, ili obe kolone `pickup` i `delivery`; ne oboje |
| `columns` | ista kolona nije izabrana za dva polja |
| `sheetName` | list postoji |

### 4.4 Pravila za red

`errors` blokiraju upis reda; `warnings` su informativne.

| Vrsta | Pravilo |
|---|---|
| greška | nedostaje mesto preuzimanja ili isporuke |
| greška | relacija ima više odredišta (više važećih poštanskih brojeva ili zarez u delu isporuke) |
| greška | poštanski broj nije 4 ili 5 cifara |
| greška | LDM nedostaje, nije prepoznat ili nije > 0 |
| greška | `externalId` se ponavlja među redovima koji nisu isključeni |
| greška | `externalId` već postoji među pošiljkama |
| upozorenje | težina nije prepoznata ili je tumačenje nesigurno (tačka 4.6) |
| upozorenje | mesto nije pronađeno pri geokodiranju; pošiljka će imati status „Nejasna lokacija“ |

Ako fajl nema kolonu za ID, `externalId` je `<ime fajla bez .xlsx>-<broj reda>`, na primer
`Relacija-tezina-dimenzija-5`. Ponovni uvoz istog fajla zato daje duplikate, što je namerno.

### 4.5 Ručna ispravka reda (`PUT /imports/{id}/rows/{rowNumber}`)

- Menjaju se samo polja koja su poslata.
- Ispravka mesta preuzimanja ili isporuke poništava greške iz teksta relacije (poštanski broj,
  više odredišta), jer mesta više ne potiču iz tog teksta. Nedostajuće mesto se proverava ponovo.
- Svaka izmena osim `excluded` postavlja `corrected: true`.
- `ldmTenths` mora biti ceo broj > 0; inače `400` sa `errors.ldmTenths`.
- Odgovor je ponovo provereni red. Duplikati ID-jeva zavise od drugih redova, pa frontend
  posle ispravke ponovo čita ceo pregled.

### 4.6 Čitanje ćelija

Pravila su izvedena iz fajla `Relacija-tezina-dimenzija.xlsx` (28 redova, jedan list, kolone
`RELACIJA | TEŽINA | DIMENZIJE`, bez kolone ID). Primeri ispod su izmišljeni, ali istog oblika.

**Relacija** (`relation`), npr. `NOVI SAD 34131 - LJUNGBY`, `NIS / RS / -/ SE / 55555 VAXJO`,
`SOMBOR - NO 1234 DRAMMEN`:

1. Preuzimanje i isporuka su razdvojeni **prvom** crticom (`-` ili `–`), sa razmacima ili bez njih.
2. Poštanski broj od 4 ili 5 cifara pripada **isporuci**, čak i kada stoji uz mesto preuzimanja
   (`VALJEVO 34131 - LJUNGBY`: 34131 je Ljungby).
3. Oznaka zemlje se prepoznaje kao `/ RS /` ili kao kod ispred poštanskog broja (`NO 1234`).
   Podržani kodovi: RS, SE, NO, MK, BIH, BA, HR, ME, SI, DK, DE, FI, HU, RO, BG.
4. Ime mesta je ostatak teksta bez kodova, brojeva i separatora, zapisan kao „Prvo Slovo
   Veliko“ (`NOVI SAD` → `Novi Sad`).
5. Red bez crtice nema mesto preuzimanja (greška).

**Težina** (`weight`), samo informativna:

| Zapis | Tumačenje |
|---|---|
| `4,200 kg`, `12,800 kg` | zarez je separator hiljada: 4200 kg, 12800 kg (potvrđeno za ovaj fajl) |
| `5,3t`, `3t`, `1.5 t` | tone, zarez ili tačka je decimala: 5300, 3000, 1500 kg |
| `600kg`, `40kg` | 600, 40 kg |
| `800` (bez jedinice) | 800 kg, uz upozorenje |
| `1,5 kg` | 1,5 kg (decimala), uz upozorenje da zarez ne liči na hiljade |

**LDM** (`ldm`, u fajlu kolona `DIMENZIJE`): `2,4m`, `3.6m`, `1m`, `2,4`, `7 LDM`. Najviše jedna
decimala, zarez ili tačka. Vrednost se čuva kao `ldmTenths` (LDM × 10).

**Provera na stvarnom fajlu** (lokalno; podaci nisu u repozitorijumu): 25 od 28 redova bez
greške; 3 reda označena za ručnu ispravku (šestocifreni poštanski broj, dva odredišta u jednoj
relaciji, red bez mesta preuzimanja). Zbir LDM je 115,0, što se poklapa sa Spec v2, odeljak 1.

Referentna implementacija za prenos u Javu (Apache POI deo je samo čitanje ćelija):

- `frontend/src/api/mock/import/parseRelation.ts`, `parseQuantities.ts`, `importRows.ts`, `importStore.ts`
- testovi: `frontend/tests/unit/importParsing.test.ts`, `mockImport.test.ts`

## 5. Status pošiljke

API ne dobija novo polje. Frontend status izvodi iz lokacija preuzimanja i isporuke, a važi
lošiji od ta dva statusa:

| Status | Uslov |
|---|---|
| Nejasna lokacija | lokacija ne postoji, `geocodeStatus` je `FAILED` ili nema `lat`/`lon` |
| Ručno uneta lokacija | `geocodeStatus` je `MANUAL` (sa koordinatama) |
| U redu | inače |

Ako backend jednog dana uvede polje `status`, mora da prati isto pravilo.

Napomena: uvezena lokacija koja je ručno ispravljena u koraku 3 dobija `MANUAL` ako je
geokodiranje uspelo, a `FAILED` ako nije.

## 6. Raspored tereta: `GET /optimization-jobs/{id}/trucks/{truckId}/load-plan`

- Koordinate i dimenzije su u mm, a početak je u uglu tovarnog prostora.
  Ose: `x` po dužini, `y` po širini, `z` naviše.
- `lengthMm` i `widthMm` su dimenzije **kako je pošiljka postavljena**, posle eventualne
  rotacije. `rotated` je samo informativno; frontend ništa ne zamenjuje.
- `mode` je `DIMENSIONAL` samo ako sve pošiljke na kamionu imaju dužinu, širinu i visinu;
  inače je `ILLUSTRATIVE_LDM`. Tada je svaka pošiljka blok pune širine kamiona, dužine
  `ldmTenths × 100` mm, a frontend prikazuje oznaku „Ilustrativni raspored“.
- `warnings` su tekstovi za korisnika, npr. kada je raspored duži od tovarnog prostora.

| Odgovor | Kada |
|---|---|
| `404` | kamion ne postoji ili nema rutu u tom poslu |
| `409` | posao nije `COMPLETED`, ili kamion nema unete unutrašnje dimenzije |

Prikaz koristi TeGo vizuelizator (cm, `y` naviše); pretvaranje radi frontend
(`frontend/src/features/truck-3d/tego/tegoAdapter.ts`).

## 7. Predlozi

### 7.1 `GET /optimization-jobs/latest`

Gornja traka, Pregled, Rezultati, Rute i 3D prikaz pokazuju poslednji posao. Frontend sada
pamti njegov `id` samo u memoriji, pa se gubi posle osvežavanja stranice.

Predlog: `GET /optimization-jobs/latest` vraća isto što i `GET /optimization-jobs/{id}` za
poslednji kreirani posao, ili `404` ako posla nema.

### 7.2 Kamion u rezultatu

Spec v2 kaže da rezultat pokazuje na `inputSnapshot`, ali API ne vraća podatke o kamionu kakav
je bio u tom trenutku. Frontend zato čita trenutne kamione, pa izmena kapaciteta posle
optimizacije menja prikaz popunjenosti starog rezultata.

Predlog: `RoutePlan` dobija polja `truckName` i `capacityLdmTenths` iz `inputSnapshot`. Frontend
bi ih tada koristio umesto trenutnih podataka.

## 8. Greške (Problem Details, RFC 9457)

Frontend čita `title`, `status`, `detail` i ova proširenja:

| Polje | Kada |
|---|---|
| `errors` | `400`; mapa polje → poruka; frontend je prikazuje uz odgovarajuće polje forme |
| `infeasibilityKind` | `422` iz `POST /optimization-jobs`, vrednost `PROVEN` |
| `causes` | `422` `PROVEN`; spisak uzroka za korisnika |

Primer `422`:

```json
{ "title": "Dokazano neizvodljivo", "status": 422,
  "detail": "Provera pre pokretanja je dokazala da rešenje ne postoji. Solver nije pokrenut.",
  "infeasibilityKind": "PROVEN",
  "causes": ["Pošiljka S-401 (14,0 LDM) je veća od najvećeg kamiona (13,6 LDM)."] }
```

Tekstovi u `detail`, `causes` i porukama redova prikazuju se korisniku, pa treba da budu na
srpskom.

## 9. Otvoreno

Za vlasnika procesa (Spec v2, odeljak 11); od toga zavisi Timefold model:

1. Da li kamion prvo preuzima svu robu, a zatim je isporučuje?
2. Gde kamion polazi i gde završava rutu?
3. Postoje li ograničenja redosleda magacina ili isporuka?

Za tim:

4. Usvajanje predloga 7.1 i 7.2.
5. Licenca fajla `threex.domevents.js` iz TeGo koda: fajl nema licencu u zaglavlju
   (videti `frontend/public/legacy/tego/NOTICE`).
