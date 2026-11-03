import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { apiMode } from '../../api/apiMode'
import { PageHeader } from '../../components/PageHeader'
import { NOT_FOUND_MESSAGE, PROVEN_TITLE } from '../optimization/jobStatus'

// The user guide: how to use the application, how the optimization works, and how to get
// the best results. Parts about the application on the device (truck locations, settings,
// the data file, the extra-truck advice) are shown only there.

const ON_DEVICE = apiMode() === 'local'

interface Chapter {
  id: string
  title: string
  body: ReactNode
}

export function HelpPage() {
  const chapters: Chapter[] = [
    { id: 'ukratko', title: 'Ukratko', body: <Overview /> },
    { id: 'koraci', title: 'Kako se koristi, korak po korak', body: <Steps /> },
    { id: 'algoritam', title: 'Kako radi optimizacija', body: <Algorithm /> },
    { id: 'saveti', title: 'Saveti za najbolje rezultate', body: <Tips /> },
    { id: 'poruke', title: 'Poruke i šta znače', body: <Messages /> },
  ]
  return (
    <section className="help">
      <PageHeader title="Uputstvo" />
      {!ON_DEVICE && (
        <p className="text--muted">
          Aplikacija sada ne radi na uređaju, pa delovi o lokacijama kamiona, podešavanjima i čuvanju podataka nisu
          prikazani.
        </p>
      )}
      <nav className="panel help__contents" aria-label="Sadržaj uputstva">
        <h2>Sadržaj</h2>
        <ol>
          {chapters.map((c) => (
            <li key={c.id}>
              <a href={`#${c.id}`}>{c.title}</a>
            </li>
          ))}
        </ol>
      </nav>
      {chapters.map((c) => (
        <section key={c.id} id={c.id} className="panel help__chapter" aria-labelledby={`${c.id}-title`}>
          <h2 id={`${c.id}-title`}>{c.title}</h2>
          {c.body}
        </section>
      ))}
    </section>
  )
}

function Overview() {
  return (
    <>
      <p>
        Aplikacija za nedeljne pošiljke iz Excel tabele određuje <strong>koji kamion nosi koju pošiljku</strong> i{' '}
        <strong>kojim redom obilazi mesta</strong> utovara i istovara. Cilj je, tim redom:
      </p>
      <ol>
        <li>
          <strong>što manje kamiona</strong>, pa
        </li>
        <li>
          <strong>što manje kilometara</strong> ukupno.
        </li>
      </ol>
      <p>
        Rešenje sa manje kamiona je uvek bolje, čak i kada ima više kilometara.
        {ON_DEVICE &&
          ' Ako bi jedan kamion više znatno smanjio kilometražu, aplikacija to posebno predloži, a vi odlučujete.'}{' '}
        Uz svaki rezultat dobijate spisak stanica za svaki kamion, rute na mapi i ilustrativni 3D raspored robe u
        kamionu.
      </p>
      {ON_DEVICE && (
        <p>
          Sve radi na ovom uređaju: podaci se čuvaju ovde, a internet je potreban samo za traženje koordinata mesta
          (Nominatim), kilometraže po putu (OpenRouteService) i podlogu mape.
        </p>
      )}
    </>
  )
}

function Steps() {
  return (
    <>
      <h3>1. Uvoz pošiljki iz Excel-a</h3>
      <p>
        Na ekranu <Link to="/shipments">Pošiljke</Link> kliknite „Uvezi Excel“ i pratite četiri koraka: izbor fajla,
        mapiranje kolona, pregled i ispravke, potvrda.
      </p>
      <ul>
        <li>
          <strong>Kolone:</strong> „Relacija“ (npr. „NOVI SAD - LJUNGBY“: pre crtice je mesto utovara, posle nje mesto
          istovara) ili posebne kolone za preuzimanje i isporuku; „LDM“ je obavezna (npr. „2,4m“), „Težina“ je
          neobavezna (npr. „4,200 kg“ ili „5,3t“). Aplikacija sama predlaže kolone po njihovim nazivima.
        </li>
        <li>
          <strong>Pregled i ispravke:</strong> redovi sa greškom (nema mesta, LDM nije prepoznat, isti ID dva puta,
          više odredišta u jednom redu) se ne upisuju dok ih ne ispravite („Ispravi“) ili isključite („Isključi“).
        </li>
        <li>
          <strong>Potvrda:</strong> pri upisu se za nova mesta traže koordinate, jedno mesto u sekundi. Odgovor se
          pamti, pa se isto mesto ne traži ponovo.
        </li>
      </ul>

      <h3>2. Provera pošiljki</h3>
      <p>
        Pošiljka sa statusom <strong>„Nejasna lokacija“</strong> nema koordinate za mesto utovara ili istovara i ne
        može u optimizaciju. Kliknite „Izmeni“ u njenom redu i:
      </p>
      <ul>
        <li>upišite tačniji naziv mesta (npr. sa kvačicama ili pun naziv grada): pri čuvanju se traži ponovo, ili</li>
        <li>
          upišite koordinate ručno, u obliku „45.2671, 19.8335“ (geografska širina, dužina, kao u Google mapama).
        </li>
      </ul>
      <p>
        Ako isto pogrešno mesto imaju i druge pošiljke, ostavite uključeno „Ispravi i u ostalim pošiljkama sa
        mestom…“, pa jedna ispravka popravlja sve. U istom obrascu menjate i ID, LDM, težinu i opis.
      </p>

      <h3>3. Kamioni</h3>
      <p>
        Na ekranu <Link to="/trucks">Kamioni</Link> unesite naziv, kapacitet u LDM i nosivost u kg (prazno znači bez
        ograničenja). Dimenzije tovarnog prostora su potrebne samo za 3D prikaz. Kamion koji nije označen kao
        dostupan ne ulazi u optimizaciju.
      </p>
      {ON_DEVICE && (
        <>
          <p>
            Svaki dostupan kamion mora imati <strong>lokaciju</strong>, mesto gde se sada nalazi: ruta počinje odatle,
            pa se i vožnja do prvog utovara računa u kilometre. Lokacija se unosi u odeljku „Lokacije kamiona“
            („Unesi mesto“), kao naziv mesta ili ručno upisane koordinate.
          </p>
          <p>
            Posle optimizacije aplikacija za svaki korišćeni kamion <strong>predlaže</strong> mesto njegove poslednje
            isporuke. Predlog važi tek kada ga potvrdite („Potvrdi predlog“); ako kamion nije vozio tu rutu, izaberite
            „Zadrži sadašnju“. Kada je predloga više, postoje i dugmad za sve odjednom.
          </p>
        </>
      )}

      <h3>4. Pokretanje optimizacije</h3>
      <p>
        Kliknite „Pokreni optimizaciju“ (gore desno) ili na ekranu <Link to="/optimization">Rezultati</Link> zadajte
        vremensko ograničenje i pokrenite odatle. Optimizacija traži najbolje rešenje dok ne istekne zadato vreme
        (sa gornje trake 60 sekundi).
      </p>
      {ON_DEVICE && (
        <ul>
          <li>
            Ako neki kamion nema lokaciju ili čeka odgovor na predlog, aplikacija vas prvo vodi na pitanje „Gde su
            kamioni?“ i ne pokreće ništa dok ne odgovorite.
          </li>
          <li>
            Ako kamioni ne mogu da ponesu sve pošiljke, aplikacija kaže koliko kamiona fali i nudi „Dodaj cerade“
            (standardna cerada: 13,6 LDM, 24 t) ili „Optimizuj bez nekih pošiljki“. U drugom slučaju raspoređuje
            koliko staje, a ostale pošiljke navodi kao nedodeljene.
          </li>
          <li>
            Uz preporuku dodatnog kamiona optimizacija traje do dva puta duže od zadatog vremena (videti ispod).
          </li>
        </ul>
      )}

      <h3>5. Rezultat</h3>
      <ul>
        <li>
          <strong>Kamioni i kilometri:</strong> broj korišćenih kamiona i ukupna kilometraža svih ruta
          {ON_DEVICE ? ', od lokacije kamiona do poslednjeg istovara (bez povratka).' : '.'}
        </li>
        <li>
          <strong>Stanice:</strong> za svaki kamion redosled utovara i istovara, sa kilometrima od prethodne stanice i
          teretom posle svake stanice.
        </li>
        <li>
          <strong>Validator:</strong> nezavisna provera rešenja (kapacitet, nosivost, redosled, utovar pozadi,
          kilometraža). Ako ne prođe, rezultat ne treba koristiti.
        </li>
        <li>
          <strong>Mapa ruta:</strong> rute u bojama kamiona.
          {ON_DEVICE &&
            ' Sa ključem za OpenRouteService linije idu po putu; bez njega su isprekidane prave linije.'}
        </li>
        <li>
          <strong>3D prikaz:</strong> ilustrativni raspored robe u kamionu; ono što se prvo istovara stoji kod vrata.
        </li>
      </ul>

      {ON_DEVICE && (
        <>
          <h3>6. Podešavanja i podaci na uređaju</h3>
          <ul>
            <li>
              <Link to="/settings">Podešavanja</Link>: traženje koordinata preko Nominatim-a, ključ za
              OpenRouteService (kilometraže po putu, besplatan nalog na account.heigit.org), putevi za teretna vozila
              ili automobile, i najmanja ušteda za preporuku dodatnog kamiona.
            </li>
            <li>
              „Izvezi podatke“ pravi jedan fajl sa svim podacima (bez ključa), za rezervnu kopiju ili prenos na drugi
              uređaj; „Uvezi podatke…“ zamenjuje sve podatke na uređaju podacima iz fajla.
            </li>
            <li>
              Za novu nedelju: „Ukloni sve pošiljke“ na ekranu Pošiljke, pa uvoz nove tabele. Kamioni, njihove
              lokacije, poslednji rezultati i zapamćene koordinate i kilometraže ostaju.
            </li>
          </ul>
        </>
      )}
    </>
  )
}

function Algorithm() {
  return (
    <>
      <h3>Pravila koja svako rešenje poštuje</h3>
      <ul>
        <li>Pošiljka se ne deli: cela ide jednim kamionom.</li>
        <li>
          Ruta ima <strong>dve faze</strong>: prvo sva preuzimanja, pa sve isporuke.{' '}
          {ON_DEVICE
            ? 'Počinje sa lokacije kamiona i završava se kod poslednje isporuke, bez povratka.'
            : 'Počinje i završava se prema podešavanju baze.'}
        </li>
        <li>
          Kamion se tovari <strong>samo pozadi</strong>: ono što se prvo istovara mora biti utovareno poslednje.
        </li>
        <li>Ukupan LDM i težina pošiljki na kamionu ne prelaze njegov kapacitet i nosivost.</li>
      </ul>

      <h3>Koraci</h3>
      <ol>
        <li>
          <strong>Provera unapred.</strong> Ako je dokazano da rešenje ne postoji (npr. pošiljka je veća od svakog
          kamiona ili ukupna roba premašuje sve kamione zajedno), optimizacija se ne pokreće i aplikacija kaže zašto.
        </li>
        <li>
          <strong>Početni raspored.</strong> Pošiljke se, od najveće ka najmanjoj, stavljaju u kamion u kome najmanje
          koštaju.
        </li>
        <li>
          <strong>Redosled stanica.</strong> Za pošiljke jednog kamiona traži se najkraći redosled koji poštuje dve faze
          i utovar pozadi. Do 9 pošiljki po kamionu to je tačno najkraći redosled; za više pošiljki približan
          (najbliže sledeće mesto, pa popravke redosleda).
        </li>
        <li>
          <strong>Poboljšavanje do isteka vremena.</strong> Pošiljke se premeštaju i menjaju između kamiona, deo
          rešenja se rasturi i ponovo složi, a kamion se pokušava isprazniti u ostale. Povremeno se prihvati i nešto
          duže rešenje, da pretraga ne zaglavi; na kraju se uzima najbolje nađeno.
        </li>
        <li>
          <strong>Nezavisna provera.</strong> Validator ponovo proverava sva pravila i kilometražu, nezavisno od
          optimizacije, i pravi se 3D raspored.
        </li>
      </ol>

      {ON_DEVICE && (
        <>
          <h3>Preporuka dodatnog kamiona</h3>
          <p>
            Posle rešenja aplikacija isti zadatak reši još jednom, sa tačno jednim kamionom više. Ako je tada
            kilometara manje bar za procenat iz Podešavanja (podrazumevano 10 %), rezultat to prikaže sa dugmetom „Dodaj
            kamion i pokreni ponovo“ (ili „Pokreni sa N kamiona“, ako je dovoljan neki od dostupnih kamiona). Novi
            kamion se pri tom računa kao da kreće iz prvog magacina, bez prazne vožnje, pa je stvarna ušteda nešto
            manja ako je kamion daleko.
          </p>
          <h3>Kilometraže</h3>
          <p>
            Bez ključa za OpenRouteService rastojanja su vazdušna linija: rezultat i dalje dobro poredi rute, ali su
            kilometri manji od stvarnih. Sa ključem rastojanja su po putu (za teretna vozila ili automobile, po
            podešavanju) i pamte se, pa se isti par mesta ne traži ponovo.
          </p>
        </>
      )}

      <h3>Šta optimizacija ne garantuje</h3>
      <ul>
        <li>
          Nađeno rešenje je najbolje koje je optimizacija našla u zadatom vremenu, a ne dokaz da boljeg nema. Na
          probnim primerima, uz isto vreme, bila je jednaka ili bolja od profesionalnog alata Timefold.
        </li>
        <li>Ne uzima u obzir vremenske rokove, radno vreme vozača, granice i carinu.</li>
        {ON_DEVICE && (
          <li>
            Nosivost standardne cerade (24 t) je pretpostavka dok vlasnik procesa ne potvrdi tačan podatak.
          </li>
        )}
      </ul>
    </>
  )
}

function Tips() {
  return (
    <ul className="help__tips">
      <li>
        <strong>Ispravite nejasne lokacije pre pokretanja.</strong> Pošiljka bez koordinata ne može u optimizaciju.
      </li>
      <li>
        <strong>Proverite LDM i težinu</strong> u pregledu uvoza; pogrešan zarez (npr. „1,5 kg“) aplikacija označi
        upozorenjem.
      </li>
      <li>
        <strong>Unesite tačan kapacitet i nosivost kamiona.</strong> Prazna nosivost znači da se težina ne
        proverava.
      </li>
      {ON_DEVICE && (
        <>
          <li>
            <strong>Unesite ključ za OpenRouteService</strong>, da kilometri budu po putu, a ne vazdušnom linijom.
          </li>
          <li>
            <strong>Držite lokacije kamiona tačnim.</strong> Predlog (poslednju isporuku) potvrdite samo ako je kamion
            zaista odvezao tu rutu; kada istu nedelju pokrećete ponovo, izaberite „Zadrži sve sadašnje lokacije“.
          </li>
        </>
      )}
      <li>
        <strong>Dajte dovoljno vremena.</strong> Za tridesetak pošiljki je obično dovoljno 30 do 60 sekundi; za više
        pošiljki, ili kada rešenje nije nađeno, probajte 120 sekundi ili više. Duže vreme retko daje lošije rešenje.
      </li>
      {ON_DEVICE && (
        <>
          <li>
            <strong>Razmotrite preporuku dodatnog kamiona.</strong> Manje kamiona je pravilo optimizacije, ali ako je
            ušteda velika, dodatni kamion može biti isplativiji.
          </li>
          <li>
            <strong>Pre nove nedelje izvezite podatke</strong> (Podešavanja, „Izvezi podatke“), pa tek onda uklonite
            stare pošiljke.
          </li>
        </>
      )}
    </ul>
  )
}

function Messages() {
  const items: Array<[string, ReactNode]> = [
    ['Nejasna lokacija', 'Mesto nema koordinate. Ispravite naziv ili upišite koordinate („Izmeni“ na ekranu Pošiljke).'],
    [
      PROVEN_TITLE,
      'Pre pokretanja je dokazano da rešenje ne postoji: npr. pošiljka je veća ili teža od svakog kamiona, ili ukupna roba premašuje kamione. Uz poruku piše tačan razlog.',
    ],
    [
      'Rešenje nije nađeno',
      `„${NOT_FOUND_MESSAGE}“ Probajte duže vreme${ON_DEVICE ? ', dodajte kamion ili optimizujte bez nekih pošiljki' : ''}.`,
    ],
    ['Validator nije prošao', 'Rešenje krši neko pravilo; poruka navodi koje. Takav rezultat ne treba koristiti.'],
    ...(ON_DEVICE
      ? ([
          [
            'Kamioni bez potvrđene lokacije',
            'Neki dostupan kamion nema lokaciju. Unesite je na ekranu Kamioni ili u pitanju „Gde su kamioni?“.',
          ],
          [
            'Nema dovoljno kamiona',
            'Kamioni ne mogu da ponesu sve pošiljke. Dodajte cerade ili optimizujte bez nekih pošiljki.',
          ],
          [
            'Kilometraže nisu dostupne',
            'OpenRouteService nije odgovorio (nema interneta, pogrešan ključ ili potrošena kvota). Optimizacija se tada ne pokreće, da ne bi tiho računala vazdušnom linijom.',
          ],
        ] as Array<[string, ReactNode]>)
      : []),
  ]
  return (
    <dl className="help__messages">
      {items.map(([term, text]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{text}</dd>
        </div>
      ))}
    </dl>
  )
}
