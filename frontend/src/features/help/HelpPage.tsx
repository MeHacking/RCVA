import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { apiMode } from '../../api/apiMode'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/PageHeader'
import { NOT_FOUND_MESSAGE, PROVEN_TITLE } from '../optimization/jobStatus'

// The user guide: how to use the application, how the optimization works, and how to get
// the best results. Parts about the application on the device (truck locations, settings,
// the data file, the extra-truck advice) are shown only there.

const ON_DEVICE = apiMode() === 'local'
// The backend keeps no truck types: there a new truck is filled only from the standard curtain-sider.
const TRUCK_TYPES = apiMode() !== 'server'
// Renaming shipments is not on the backend.
const CAN_SHORTEN = apiMode() !== 'server'

interface Chapter {
  id: string
  title: string
  body: ReactNode
}

export function HelpPage() {
  const chapters: Chapter[] = [
    { id: 'ukratko', title: 'Ukratko', body: <Overview /> },
    // Not "koraci": that is the id of the subheading "Koraci" (Subheading takes ids from the text).
    { id: 'upotreba', title: 'Kako se koristi, korak po korak', body: <Steps /> },
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
      <div className="help__layout">
        <div className="help__text">
          {chapters.map((c) => (
            <section key={c.id} id={c.id} className="panel help__chapter" aria-labelledby={`${c.id}-title`}>
              <h2 id={`${c.id}-title`}>{c.title}</h2>
              {c.body}
            </section>
          ))}
        </div>
        <Contents chapters={chapters} />
      </div>
    </section>
  )
}

/**
 * A numbered heading inside a chapter, with an id from its text so the contents can link to it.
 * The contents read its number and title from data attributes.
 */
function Subheading({ n, children }: { n: number; children: string }) {
  return (
    <h3 id={slug(children)} data-number={n} data-title={children}>
      <span className="number-badge">
        {n}
        <span className="visually-hidden">. </span>
      </span>
      {children}
    </h3>
  )
}

/** Combining marks left by NFD (the č, ć, š, ž without their marks) */
const MARKS = new RegExp('[\\u0300-\\u036f]', 'g')

function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(MARKS, '')
    .replace(/đ/g, 'dj')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

interface Entry {
  id: string
  number: string
  title: string
}

/**
 * The contents beside the text: the chapters; a click on one goes there and opens its
 * subheadings (read from the page, so the parts shown only on the device come and go by
 * themselves), one chapter open at a time. The part being read is marked as the page scrolls.
 */
function Contents({ chapters }: { chapters: Chapter[] }) {
  const [subheadings, setSubheadings] = useState<Record<string, Entry[]>>({})
  const [current, setCurrent] = useState<string | null>(null)
  /** the chapter whose subheadings show; none at first */
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    const found: Record<string, Entry[]> = {}
    const headings: HTMLElement[] = []
    for (const chapter of document.querySelectorAll<HTMLElement>('.help__chapter')) {
      headings.push(chapter)
      found[chapter.id] = [...chapter.querySelectorAll<HTMLElement>('h3[id]')].map((h) => {
        headings.push(h)
        return { id: h.id, number: h.dataset.number ?? '', title: h.dataset.title ?? '' }
      })
    }
    // The part being read: the last heading that has passed the line under the top bar.
    const line = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-height')) * 16 + 40
    let frame = 0
    const update = () => {
      frame = 0
      const passed = headings.filter((h) => h.getBoundingClientRect().top <= line())
      // At the very bottom the last part counts as read, even if its heading cannot reach the line.
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
      setCurrent((atEnd ? headings.at(-1) : passed.at(-1) ?? headings[0])?.id ?? null)
    }
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update)
    }
    // The first frame shows the subheadings and the part in view.
    frame = requestAnimationFrame(() => {
      setSubheadings(found)
      update()
    })
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <nav className="panel panel--dark help__contents" aria-label="Sadržaj uputstva">
      <h2>Sadržaj</h2>
      <ol className="help__contents-chapters">
        {chapters.map((c) => {
          const subs = subheadings[c.id] ?? []
          const isOpen = open === c.id
          // A closed chapter stands for the part being read inside it.
          const isCurrent = c.id === current || (!isOpen && subs.some((s) => s.id === current))
          return (
            <li key={c.id}>
              <a
                href={`#${c.id}`}
                className={`help__contents-link help__contents-chapter${isOpen ? ' help__contents-chapter--open' : ''}`}
                aria-current={isCurrent ? 'location' : undefined}
                aria-expanded={subs.length > 0 ? isOpen : undefined}
                onClick={() => setOpen(c.id)}
              >
                <span>{c.title}</span>
                {subs.length > 0 && <Icon name="chevron" size={14} />}
              </a>
              {isOpen && subs.length > 0 && (
                <ul className="help__contents-sub">
                  {subs.map((s) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className="help__contents-link help__contents-subheading"
                        aria-current={s.id === current ? 'location' : undefined}
                      >
                        <span className="help__contents-number">{`${s.number}. `}</span>
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
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
      <Subheading n={1}>Uvoz pošiljki iz Excel-a</Subheading>
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
          <strong>ID pošiljke:</strong> ako fajl nema svoju kolonu sa ID-jem, pošiljka dobija kratak naziv po relaciji:
          prva tri slova mesta utovara i istovara i redni broj (npr. „KRA-STE-1“ za Kragujevac → Stenkullen).
          {CAN_SHORTEN && (
            <>
              {' '}
              Pošiljke koje su ranije dobile naziv od imena fajla i broja reda mogu se skratiti na isti način: ekran
              Pošiljke tada nudi „Skrati nazive“.
            </>
          )}
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

      <Subheading n={2}>Provera pošiljki</Subheading>
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
        mestom…“, pa jedna ispravka popravlja sve. U istom prozoru menjate i ID, LDM, težinu i opis; „Otkaži“ ili
        Escape zatvaraju prozor bez izmene.
      </p>
      {CAN_SHORTEN && (
        <>
          {apiMode() === 'local' && (
            <p>
              <strong>Mesto pronađeno u pogrešnom gradu:</strong> u prozoru „Izmeni“ izaberite državu i kliknite „Traži
              ponovo“. Prvo vidite šta je pronađeno i koliko je to daleko od sadašnje tačke; tek „Prihvati“ menja mesto,
              za sve pošiljke koje ga koriste.
            </p>
          )}
          <p>
            <strong>Pošiljka bez Excel-a:</strong> „Dodaj pošiljku“ otvara isti prozor, prazan. Obavezni su mesto
            preuzimanja, mesto isporuke i LDM; ID, težina, opis i zemlja nisu. Bez ID-ja pošiljka dobija kratak naziv
            po relaciji (npr. „KRA-STE-1“). Koordinate se traže po nazivu mesta kao pri uvozu, a poznato mesto
            zadržava svoje; ako se mesto ne pronađe, upišite koordinate ručno.
          </p>
          <p>
            <strong>Uklanjanje jedne pošiljke:</strong> „Ukloni“ u njenom redu, pa „Da, ukloni“. Sačuvani rezultati
            optimizacije se ne menjaju. Dok optimizacija radi, pošiljke se ne mogu dodavati, menjati ni uklanjati.
          </p>
        </>
      )}

      <Subheading n={3}>Kamioni</Subheading>
      <p>
        Na ekranu <Link to="/trucks">Kamioni</Link> unesite naziv, kapacitet u LDM i nosivost u kg (prazno znači bez
        ograničenja). Dimenzije tovarnog prostora su potrebne samo za 3D prikaz. Kamion koji nije označen kao
        dostupan ne ulazi u optimizaciju.
      </p>
      {TRUCK_TYPES && (
        <p>
          Uz kamion možete upisati <strong>vozača</strong>: ime i broj telefona sa pozivnim brojem zemlje (npr. +381 64
          123 4567). Broj je potreban za slanje rute i rasporeda tovara vozaču na Viber.
        </p>
      )}
      <p>
        Pri dodavanju kamiona u polju <strong>„Popuni prema“</strong> birate ručni unos ili <strong>tip kamiona</strong>:
        kapacitet, nosivost i dimenzije se prepišu iz tipa, a naziv dobija prvi slobodan broj (standardna cerada daje
        „Kamion 1“, „Kamion 2“…, a tip „Hladnjača“ daje „Hladnjača 1“…). Sve vrednosti posle možete promeniti; naziv
        koji ste sami upisali ostaje.
      </p>
      {TRUCK_TYPES && (
        <p>
          Tipovi se vode u kartici <strong>„Tipovi kamiona“</strong>, koju otvara dugme „Dodaj tip kamiona“ (pored
          „Dodaj kamion“): u njoj je obrazac za novi tip i spisak postojećih, koje menjate ili uklanjate. „Standardna
          cerada“ je ugrađena i ne menja se, jer po njoj aplikacija predlaže dodatne kamione kada postojeći nisu
          dovoljni. Za tip su obavezne sve vrednosti (naziv, kapacitet, nosivost i sve tri dimenzije tovarnog prostora),
          jer tip popunjava nov kamion u celosti. Tip ne sme imati isti naziv ni iste mere (kapacitet, nosivost i tovarni prostor) kao neki postojeći.
          „Zatvori“ (gore desno) zatvara karticu bez čuvanja. Na ekranu je uvek otvorena samo jedna kartica za unos: kamiona ili tipova. Izmena ili
          uklanjanje tipa ne menja kamione koji su već dodati.
        </p>
      )}
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

      <Subheading n={4}>Pokretanje optimizacije</Subheading>
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

      <Subheading n={5}>Rezultat</Subheading>
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
          <strong>Pošiljke kamiona:</strong> u redu kamiona piše samo njihov broj (npr. „3 pošiljke“); klik otvara
          prozor sa spiskom pošiljki, relacijom, LDM i težinom.
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
        <li>
          <strong>Izvezi ceo rezultat (PDF):</strong> izveštaj sa rezimeom na prvoj strani i svakim kamionom na svojoj
          strani (vozač, stanice redom sa kilometrima, pošiljke na kamionu i raspored tovara: crtež u 3D, gde broj
          na bloku kaže redosled od vrata, 1 se istovara prvi; za crtež kamion mora imati unete
          dimenzije tovarnog prostora). U aplikaciji za PC birate gde se fajl čuva;
          u pregledaču se otvara štampa, gde izaberete „Sačuvaj kao PDF“.
        </li>
        <li>
          <strong>PDF za vozača</strong> (u redu kamiona): samo strana tog kamiona, bez ostalih kamiona, ukupne
          kilometraže i nedodeljenih pošiljki, da vozači ne znaju šta voze ostali.
        </li>
        {TRUCK_TYPES && (
          <li>
            <strong>Viber</strong> (u redu kamiona): isti PDF za vozača, za slanje na Viber. Viber ne dozvoljava drugoj
            aplikaciji da sama pošalje fajl, pa aplikacija za PC sačuva PDF u folder „Dokumenti\RCVA za Viber“, otvori
            taj folder i otvori Viber razgovor sa vozačem; fajl samo prevucite u razgovor. U pregledaču se PDF čuva kroz
            štampu. Ako kamion nema broj telefona vozača, aplikacija ga traži i pamti uz kamion. Za ovo Viber mora biti
            instaliran na računaru.
          </li>
        )}
      </ul>

      {ON_DEVICE && (
        <>
          <Subheading n={6}>Podešavanja i podaci na uređaju</Subheading>
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
            <li>
              „Brisanje svih podataka“ (dno Podešavanja, uz administratorsku lozinku) briše sve na uređaju, i ključ i
              podešavanja, pa je aplikacija kao pri prvom pokretanju. To se ne može poništiti: prvo izvezite podatke.
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
      <Subheading n={1}>Pravila koja svako rešenje poštuje</Subheading>
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

      <Subheading n={2}>Koraci</Subheading>
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
          <Subheading n={3}>Preporuka dodatnog kamiona</Subheading>
          <p>
            Posle rešenja aplikacija isti zadatak reši još jednom, sa tačno jednim kamionom više. Ako je tada
            kilometara manje bar za procenat iz Podešavanja (podrazumevano 10 %), rezultat to prikaže sa dugmetom „Dodaj
            kamion i pokreni ponovo“ (ili „Pokreni sa N kamiona“, ako je dovoljan neki od dostupnih kamiona). Novi
            kamion se pri tom računa kao da kreće iz prvog magacina, bez prazne vožnje, pa je stvarna ušteda nešto
            manja ako je kamion daleko.
          </p>
          <Subheading n={4}>Kilometraže</Subheading>
          <p>
            Bez ključa za OpenRouteService rastojanja su vazdušna linija: rezultat i dalje dobro poredi rute, ali su
            kilometri manji od stvarnih. Sa ključem rastojanja su po putu (za teretna vozila ili automobile, po
            podešavanju) i pamte se, pa se isti par mesta ne traži ponovo.
          </p>
        </>
      )}

      <Subheading n={ON_DEVICE ? 5 : 3}>Šta optimizacija ne garantuje</Subheading>
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
          [
            'Nema puta za kamione',
            'Do nekog mesta OpenRouteService ne nalazi put za izabrana vozila, najčešće jer je centar grada zatvoren za kamione. „Pomeri na najbliži put za kamione“ proba tačke oko mesta (do 5 km), proverava do kojih kamion zaista stiže i predlaže najbližu; pokazuje koliko je to daleko i obe tačke na mapi. Pomeraju se samo označena mesta, tek kada potvrdite. Izvorna tačka se pamti: u izmeni pošiljke „Vrati izvornu tačku“.',
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
