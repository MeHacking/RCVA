import { useState } from 'react'
import { useApi } from '../../api/apiContext'
import { describeError } from '../../api/client'
import type { RoadPointProposal } from '../../api/types'
import { Notice } from '../../components/Notice'
import { formatKm } from '../../format/units'
import { useLastJob, type StartOptions } from './lastJobContext'

/** A move longer than this is likely not the place of delivery any more: it gets a warning. */
const FAR_MOVE_M = 2000

/** The point on the OpenStreetMap map (opens in the browser), to see where a place would go. */
const osmLink = (p: { lat: number; lon: number }) =>
  `https://www.openstreetmap.org/?mlat=${p.lat.toFixed(5)}&mlon=${p.lon.toFixed(5)}#map=17/${p.lat.toFixed(5)}/${p.lon.toFixed(5)}`

/**
 * When OpenRouteService finds no road for lorries to some places (a city centre closed to
 * them, a point off the roads), this offers the nearest point on a road they may use for each
 * (ORS Snap), shows how far that is and both points on the map, and moves the places the user
 * ticks only once confirmed; then the job starts again as it was started. A moved place keeps
 * where it was, and goes back from the shipment's editor ("Vrati izvornu tačku").
 */
export function RoadPoints({ placeIds, options }: { placeIds: number[]; options: StartOptions }) {
  const api = useApi()
  const { start } = useLastJob()
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'asking' }
    | { kind: 'proposed'; proposals: RoadPointProposal[] }
    | { kind: 'moving'; proposals: RoadPointProposal[] }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' })
  /** the places ticked to move (at first every one with a road) */
  const [chosen, setChosen] = useState<Set<number>>(new Set())

  async function ask() {
    setState({ kind: 'asking' })
    try {
      const proposals = await api.proposeRoadPoints(placeIds)
      setChosen(new Set(proposals.filter((p) => p.to).map((p) => p.locationId)))
      setState({ kind: 'proposed', proposals })
    } catch (error) {
      setState({ kind: 'error', message: describeError(error) })
    }
  }

  async function apply(proposals: RoadPointProposal[]) {
    setState({ kind: 'moving', proposals })
    try {
      for (const p of proposals) if (p.to) await api.moveToRoadPoint(p.locationId, p.to)
      await start(options)
    } catch (error) {
      setState({ kind: 'error', message: describeError(error) })
    }
  }

  const shown = state.kind === 'proposed' || state.kind === 'moving' ? state.proposals : null
  const movable = shown?.filter((p) => p.to && chosen.has(p.locationId)) ?? []
  const toggle = (id: number) =>
    setChosen((before) => {
      const next = new Set(before)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Notice tone="info" title="Mesta do kojih nema puta za kamione" role="status">
      <p>
        Do ovih mesta OpenRouteService ne nalazi put za izabrana vozila, najčešće jer je centar grada zatvoren za kamione
        ili tačka nije na putu. Aplikacija može da predloži najbliže mesto na putu kojim kamion sme, do{' '}
        {formatKm(5000)}; pomeraju se samo označena mesta, tek kada potvrdite, a izvorna tačka se pamti (vraća se u izmeni
        pošiljke, „Vrati izvornu tačku“).
      </p>

      {!shown && (
        <div className="form-actions">
          <button type="button" className="button--primary" onClick={() => void ask()} disabled={state.kind === 'asking'}>
            {state.kind === 'asking' ? 'Traženje…' : 'Pomeri na najbliži put za kamione'}
          </button>
        </div>
      )}
      {state.kind === 'error' && (
        <p role="alert" className="text--error">
          {state.message}
        </p>
      )}

      {shown && (
        <>
          <div className="table-wrap road-points">
            <table className="table" aria-label="Predlog pomeranja mesta">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">Pomeri</span>
                  </th>
                  <th scope="col">Mesto</th>
                  <th scope="col" className="num">
                    Pomeranje
                  </th>
                  <th scope="col">Najbliži put</th>
                  <th scope="col">Na mapi</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.locationId}>
                    <td>
                      <input
                        type="checkbox"
                        checked={p.to !== null && chosen.has(p.locationId)}
                        disabled={p.to === null || state.kind === 'moving'}
                        onChange={() => toggle(p.locationId)}
                        aria-label={`Pomeri ${p.name}`}
                      />
                    </td>
                    <td>{p.name}</td>
                    <td className="num">{p.distanceMeters === null ? '–' : formatKm(p.distanceMeters)}</td>
                    <td className="road-points__where">
                      {p.to === null ? (
                        <span className="text--error">nema puta za kamione u krugu od {formatKm(5000)}</span>
                      ) : (
                        <>
                          {p.street ?? 'put bez naziva'}
                          {p.distanceMeters !== null && p.distanceMeters > FAR_MOVE_M && (
                            <span className="text--warning">
                              {' '}
                              · daleko: proverite da li je to još mesto istovara
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="road-points__map">
                      <a href={osmLink(p.from)} target="_blank" rel="noreferrer">
                        sada
                      </a>
                      {p.to && (
                        <>
                          {' · '}
                          <a href={osmLink(p.to)} target="_blank" rel="noreferrer">
                            posle
                          </a>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="button--primary"
              onClick={() => void apply(movable)}
              disabled={movable.length === 0 || state.kind === 'moving'}
            >
              {state.kind === 'moving' ? 'Pomeranje…' : `Primeni (${movable.length}) i pokreni ponovo`}
            </button>
            <button type="button" onClick={() => setState({ kind: 'idle' })} disabled={state.kind === 'moving'}>
              Odustani
            </button>
          </div>
        </>
      )}
    </Notice>
  )
}
