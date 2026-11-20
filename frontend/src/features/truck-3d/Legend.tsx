import { Icon } from '../../components/Icon'
import { ViewIcon } from './viewIcons'

// "Legenda" next to the editor's 3D view (as in smartLoad, editor/Legend.tsx): what the mouse and
// the keys do, and what the colours and marks mean (open or closed: useLegend).

export function LegendButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" aria-expanded={open} aria-controls="load-editor-legend" onClick={onToggle}>
      <Icon name="info" />
      Legenda
    </button>
  )
}

export function Legend({ onClose }: { onClose: () => void }) {
  return (
    <aside id="load-editor-legend" className="legend" aria-label="Legenda">
      <div className="legend__head">
        <h3>
          <Icon name="info" />
          Legenda
        </h3>
        <button type="button" className="legend__close" aria-label="Zatvori legendu" title="Zatvori" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>

      <h4>Miš u 3D prikazu</h4>
      <dl>
        <dt>Levi taster i prevlačenje</dt>
        <dd>na pošiljci: premešta je (van kamiona: na pod, u spisak „Van kamiona“); pored pošiljke: okreće pogled</dd>
        <dt>Točkić</dt>
        <dd>približava i udaljava</dd>
        <dt>Desni taster i prevlačenje</dt>
        <dd>pomera pogled</dd>
        <dt>Klik na pošiljku</dt>
        <dd>bira pošiljku (i na podu odozgo)</dd>
        <dt>
          <kbd>Ctrl</kbd> + klik
        </dt>
        <dd>dodaje pošiljku u izbor ili je uklanja iz njega</dd>
        <dt>
          <kbd>Shift</kbd> + prevlačenje
        </dt>
        <dd>
          okvir: bira sve pošiljke čiji je centar u njemu (sa <kbd>Ctrl</kbd> dodaje)
        </dd>
      </dl>

      <h4>Pogledi</h4>
      <ul className="legend__views">
        <li>
          <ViewIcon view="iso" /> Ukoso: odozgo, sa zadnje strane
        </li>
        <li>
          <ViewIcon view="top" /> Odozgo: pravo na pod
        </li>
        <li>
          <ViewIcon view="side" /> Sa strane: duža strana kamiona
        </li>
        <li>
          <ViewIcon view="back" /> Od vrata: kroz zadnja vrata
        </li>
      </ul>
      <p className="legend__note">Izbor pogleda uvek pokaže ceo kamion i pod oko njega.</p>

      <h4>Uređivanje</h4>
      <dl>
        <dt>Prevlačenje pošiljke</dt>
        <dd>
          na podu odozgo ili u 3D; ide zajedno sa onim što stoji na njoj, lepi se uz zid i susede do 5 cm, puštena iznad
          druge pošiljke staje na nju
        </dd>
        <dt>Van kamiona</dt>
        <dd>
          u 3D se pošiljka prevuče na pod oko kamiona, da se privremeno skloni; „Ubaci“ u spisku je vraća na prvo mesto od
          čela gde ne krši pravila; raspored se čuva tek kada je sve u kamionu
        </dd>
        <dt>Ponovni klik na isto mesto (na podu)</dt>
        <dd>bira pošiljku ispod</dd>
        <dt>
          <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd>
        </dt>
        <dd>pomera izabranu pošiljku za korak (1, 5 ili 10 cm)</dd>
        <dt>
          <kbd>R</kbd> ili dvoklik na pošiljku
        </dt>
        <dd>okreće za 90°</dd>
        <dt>
          <kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Ctrl</kbd> + <kbd>Y</kbd>
        </dt>
        <dd>poništi / ponovi</dd>
        <dt>
          <kbd>Esc</kbd>
        </dt>
        <dd>poništava izbor</dd>
      </dl>

      <h4>Boje i oznake</h4>
      <ul className="legend__marks">
        <li>
          <span className="legend__swatch legend__swatch--selected" aria-hidden="true" /> izabrana pošiljka
        </li>
        <li>
          <span className="legend__swatch legend__swatch--group" aria-hidden="true" /> pošiljke koje idu sa njom (na podu
          odozgo)
        </li>
        <li>
          <span className="legend__swatch legend__swatch--bad" aria-hidden="true" /> pošiljka koja krši pravilo (spisak je
          desno)
        </li>
        <li>
          <span className="legend__swatch legend__swatch--used" aria-hidden="true" /> kraj zauzete dužine
        </li>
        <li>
          <span className="legend__mark" aria-hidden="true">
            1
          </span>{' '}
          broj na podu odozgo: redosled istovara (1 izlazi prva)
        </li>
        <li>
          <span className="legend__mark" aria-hidden="true">
            ▲
          </span>{' '}
          na podu odozgo: pošiljka stoji na drugoj
        </li>
        <li>
          <span className="legend__mark" aria-hidden="true">
            ⇤
          </span>{' '}
          čelo je kod kabine, vrata na kraju
        </li>
      </ul>
    </aside>
  )
}
