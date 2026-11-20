import { lazy, Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useBlocker } from 'react-router'
import { useApi } from '../../api/apiContext'
import { describeError } from '../../api/client'
import type { LoadPlan, RoutePlan } from '../../api/types'
import { Icon } from '../../components/Icon'
import { Notice } from '../../components/Notice'
import {
  checkLoad,
  dragTo,
  extentOf,
  groupOf,
  inTruck,
  moveGroup,
  occupiedLength,
  piecesFromPlacements,
  placeFromFront,
  placementsFromPieces,
  putOnGround,
  rotateGroup,
  samePlaces,
  shipmentsAside,
  shipmentsAt,
  snapMove,
  unloadOrder,
  type EditPiece,
  type EditSpace,
} from '../../domain/loadEditing'
import { formatShipmentCount, plural } from '../../format/count'
import { formatCm, formatCubicMetersMm3, formatKg, formatMetersMm } from '../../format/units'
import { useFullscreen } from '../../hooks/useFullscreen'
import { Legend, LegendButton } from './Legend'
import { useLegend } from './useLegend'
import { shipmentColors } from './planShipments'
import { yardOf, type CargoSpaceMm, type ViewName } from './scene'
import { ViewIcon } from './viewIcons'

// The layout editor (user, 19.11.2026: "Uredi" left of "Ceo ekran", the same as the Rezultat
// step of smartLoad, F:\GitHubProjects\smartLoad, frontend/src/screens/optimization.tsx and
// editor/LayoutEditor.tsx): cards with the length, volume, weight and shipments, then the floor
// from above to scale and the 3D view, both showing the same plan; a shipment is dragged in
// either. A whole shipment moves (user: "Cela pošiljka"), with whatever rests on it; it sticks to
// the walls and neighbours within 5 cm and, let go over another one, lands on top of it. A second
// click on the same spot picks the shipment below. Arrows move by the chosen step, R turns by
// 90°, Ctrl+Z / Ctrl+Y undo and redo. The rules (domain/loadEditing.ts) are checked on every
// change; saving with broken rules asks first. In 3D a shipment can be put on the ground around
// the truck for a while ("Van kamiona", as in smartLoad; user, 20.11.2026: only for a while, so the
// plan is saved with everything in the truck, and a shipment leaves a truck through "Premesti u…"
// on the results); "Ubaci" puts it back at the first place from the front that breaks no rule.

const Truck3D = lazy(() => import('./Truck3D').then((m) => ({ default: m.Truck3D })))

const VIEWS: { id: ViewName; label: string }[] = [
  { id: 'iso', label: 'Ukoso' },
  { id: 'top', label: 'Odozgo' },
  { id: 'side', label: 'Sa strane' },
  { id: 'back', label: 'Od vrata' },
]

const STEPS = [1, 5, 10] as const

/** cm around the floor in the drawing (room for "Čelo" and "Vrata") */
const MARGIN = 34

interface Drag {
  start: EditPiece[]
  group: Set<string>
  /** where the group's footprint started, and the pointer */
  minX: number
  minY: number
  fromX: number
  fromY: number
  /**
   * The plan as the last move left it. The end of a drag takes it from here: a quick drag can be
   * let go before the page draws again, and then the state the handlers see is still from before.
   */
  last: EditPiece[] | null
  /** in 3D: onto the ground around the truck too */
  free: boolean
}

interface FloorPress extends Drag {
  base: number
  moved: boolean
  px: number
  py: number
  /** a press on the only chosen shipment: without moving, it picks the one below */
  cycle: boolean
}

export interface LoadEditorProps {
  jobId: number
  truckName: string
  space: CargoSpaceMm
  /** null: no payload limit */
  capacityKg: number | null
  plan: LoadPlan
  route: RoutePlan | undefined
  /** the shipments' names and weights, by id */
  names: ReadonlyMap<number, string>
  weights: ReadonlyMap<number, number | null>
  onSaved: (plan: LoadPlan) => void
  onClose: () => void
}

export function LoadEditor(props: LoadEditorProps) {
  const { plan, space: spaceMm, names } = props
  const api = useApi()
  const top = useRef<HTMLDivElement>(null)
  useEffect(() => {
    top.current?.scrollIntoView?.({ block: 'start' })
  }, [])

  const colors = useMemo(() => shipmentColors(plan.placements), [plan.placements])
  const original = useMemo(() => piecesFromPlacements(plan.placements, colors), [plan.placements, colors])
  const [pieces, setPieces] = useState<EditPiece[]>(original)
  const [past, setPast] = useState<EditPiece[][]>([])
  const [future, setFuture] = useState<EditPiece[][]>([])
  // Several shipments may be chosen (Ctrl+click, Shift+drag in 3D); the last one leads.
  const [selection, setSelection] = useState<number[]>([])
  const selected = selection.length > 0 ? selection[selection.length - 1] : null
  const choose = (id: number | null) => setSelection(id === null ? [] : [id])
  const [step, setStep] = useState<(typeof STEPS)[number]>(1)
  const [zoom, setZoom] = useState(1)
  const [view, setView] = useState<ViewName>('iso')
  const [viewTick, setViewTick] = useState(0)
  const [confirm, setConfirm] = useState<'cancel' | 'save' | 'aside' | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const press = useRef<FloorPress | null>(null)
  const drag3d = useRef<Drag | null>(null)
  const part3d = useRef<HTMLDivElement>(null)
  const { full, expanded, toggle } = useFullscreen(part3d)

  const space: EditSpace = useMemo(
    () => ({ L: spaceMm.innerLengthMm / 10, W: spaceMm.innerWidthMm / 10, H: spaceMm.innerHeightMm / 10 }),
    [spaceMm.innerLengthMm, spaceMm.innerWidthMm, spaceMm.innerHeightMm],
  )
  // The ground around the truck (only in the 3D view), where shipments are put aside for a while.
  const yard = useMemo(() => yardOf(space), [space])
  const scene = useMemo(() => ({ ...space, yard: true }), [space])
  const order = useMemo(() => (props.route ? unloadOrder(props.route) : { number: new Map(), visit: new Map() }), [props.route])
  const name = (id: number) => names.get(id) ?? `#${id}`
  // The rules, the cards and the floor from above are about what is in the truck.
  const inside = useMemo(() => inTruck(pieces), [pieces])
  const aside = useMemo(() => shipmentsAside(pieces), [pieces])
  const isOut = (id: number) => aside.includes(id)
  /** The chosen shipments on the same side as `lead` (in the truck, or on the ground): they move together. */
  const sameSide = (ids: number[], lead: number) => ids.filter((id) => isOut(id) === isOut(lead))
  const problems = useMemo(
    () => checkLoad(inside, space, order, (id) => names.get(id) ?? `#${id}`),
    [inside, space, order, names],
  )
  const bad = useMemo(() => new Set(problems.flatMap((p) => p.shipmentIds)), [problems])
  const group = groupOf(pieces, selection)
  const changed = past.length > 0
  const [notice, setNotice] = useState<string | null>(null)
  const [legend, setLegend] = useLegend()
  // Another screen while there are changes: asks first (in the card, as "Otkaži" does).
  const blocker = useBlocker(changed && !saving)
  const blocked = blocker.state === 'blocked'
  useEffect(() => {
    if (blocked) top.current?.scrollIntoView?.({ block: 'start' })
  }, [blocked])

  function commit(next: EditPiece[], before: EditPiece[] = pieces) {
    if (next === before || samePlaces(next, before)) {
      // Nothing moved (a drag let go where it started): no step to undo, nothing to save.
      setPieces(before)
      return
    }
    setPast((h) => [...h.slice(-99), before])
    setFuture([])
    setPieces(next)
    setConfirm(null)
  }
  function undo() {
    const prev = past[past.length - 1]
    if (!prev) return
    setPast((h) => h.slice(0, -1))
    setFuture((f) => [pieces, ...f])
    setPieces(prev)
  }
  function redo() {
    const next = future[0]
    if (!next) return
    setFuture((f) => f.slice(1))
    setPast((h) => [...h, pieces])
    setPieces(next)
  }
  function rotate(id: number | null = selected) {
    if (id === null) return
    const g = groupOf(pieces, selection.includes(id) ? sameSide(selection, id) : [id])
    let next = rotateGroup(pieces, g, id, yard.groundZ)
    if (isOut(id)) {
      // On the ground it stays on the ground, off the truck.
      const e = extentOf(next.filter((p) => g.has(p.key)))
      next = putOnGround(next, g, e.minX, e.minY, yard)
    }
    commit(next)
  }
  function nudge(dx: number, dy: number) {
    if (selected === null) return
    const g = groupOf(pieces, sameSide(selection, selected))
    const e = extentOf(pieces.filter((p) => g.has(p.key)))
    if (isOut(selected)) {
      // On the ground it moves there; an arrow never takes it into the truck.
      commit(putOnGround(pieces, g, e.minX + dx, e.minY + dy, yard))
      return
    }
    const at = snapMove(pieces, g, e.minX + dx, e.minY + dy, space, 0)
    if (at.dx === 0 && at.dy === 0) return
    commit(moveGroup(pieces, g, at.dx, at.dy))
  }
  /**
   * A drag: the group's footprint to start where the pointer has taken it. On the floor from above
   * it stays in the truck; in 3D it may go onto the ground around it and back.
   */
  function drag(d: Drag, x: number, y: number) {
    const tx = d.minX + x - d.fromX
    const ty = d.minY + y - d.fromY
    if (d.free) {
      d.last = dragTo(d.start, d.group, tx, ty, space, yard)
    } else {
      const at = snapMove(d.start, d.group, tx, ty, space)
      d.last = moveGroup(d.start, d.group, at.dx, at.dy)
    }
    setPieces(d.last)
  }
  function startDrag(start: EditPiece[], ids: number[], x: number, y: number, free: boolean): Drag {
    const g = groupOf(start, ids)
    const e = extentOf(start.filter((p) => g.has(p.key)))
    return { start, group: g, minX: e.minX, minY: e.minY, fromX: x, fromY: y, last: null, free }
  }
  /** "Ubaci": from the ground back into the truck, at the first place from the front that breaks no rule. */
  function insert(id: number) {
    const next = placeFromFront(pieces, id, space, order, yard)
    if (!next) {
      setNotice(`${name(id)}: u kamionu nema mesta na kome ne bi kršila pravila. Prevucite je u 3D prikazu gde treba.`)
      return
    }
    setNotice(null)
    commit(next)
    choose(id)
  }

  // ---- The floor from above ----
  const toCm = (e: { clientX: number; clientY: number }) => {
    const m = svg.current?.getScreenCTM()?.inverse()
    if (!m) return { x: 0, y: 0 }
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m)
    return { x: p.x, y: p.y }
  }
  function onDown(e: PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return
    const p = toCm(e)
    const hits = shipmentsAt(inside, p.x, p.y)
    if (e.ctrlKey || e.metaKey) {
      const id = hits[0]
      if (id !== undefined) setSelection((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
      return
    }
    if (hits.length === 0) {
      choose(null)
      return
    }
    // Pressing on a chosen shipment keeps the choice; several chosen move together.
    const already = hits.find((h) => selection.includes(h))
    const base = already ?? hits[0]
    const many = already !== undefined && selection.length > 1
    if (!many) choose(base)
    e.currentTarget.setPointerCapture?.(e.pointerId)
    press.current = {
      // Only what is in the truck: the floor from above does not show the ground.
      ...startDrag(pieces, many ? sameSide(selection, base) : [base], p.x, p.y, false),
      base,
      moved: false,
      px: e.clientX,
      py: e.clientY,
      cycle: already !== undefined && !many,
    }
  }
  function onMove(e: PointerEvent<SVGSVGElement>) {
    const d = press.current
    if (!d) return
    if (!d.moved && Math.hypot(e.clientX - d.px, e.clientY - d.py) < 4) return
    d.moved = true
    const p = toCm(e)
    drag(d, p.x, p.y)
  }
  function onUp(e: PointerEvent<SVGSVGElement>) {
    const d = press.current
    press.current = null
    if (!d) return
    if (d.moved) {
      if (d.last) commit(d.last, d.start)
      return
    }
    if (d.cycle) {
      // The same spot again: the next shipment down (then back to the top).
      const p = toCm(e)
      const hits = shipmentsAt(inside, p.x, p.y)
      const next = hits[(hits.indexOf(d.base) + 1) % hits.length]
      if (next !== undefined) choose(next)
    }
  }

  // ---- The 3D view: the same moves, in plan cm ----
  function start3d(id: number, at: { x: number; y: number }) {
    const many = selection.includes(id) && selection.length > 1
    if (!many) choose(id)
    drag3d.current = startDrag(pieces, many ? sameSide(selection, id) : [id], at.x, at.y, true)
  }
  function move3d(at: { x: number; y: number }) {
    const d = drag3d.current
    if (d) drag(d, at.x, at.y)
  }
  function end3d() {
    const d = drag3d.current
    drag3d.current = null
    if (d?.last) commit(d.last, d.start)
  }

  function onKey(e: KeyboardEvent<HTMLElement>) {
    const ctrl = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()
    if (ctrl && key === 'z' && !e.shiftKey) undo()
    else if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) redo()
    else if (e.key === 'ArrowLeft') nudge(-step, 0)
    else if (e.key === 'ArrowRight') nudge(step, 0)
    else if (e.key === 'ArrowUp') nudge(0, -step)
    else if (e.key === 'ArrowDown') nudge(0, step)
    else if (key === 'r' && !ctrl) rotate()
    else if (e.key === 'Escape' && selection.length > 0) choose(null)
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  async function save() {
    setConfirm(null)
    // A plan is saved with everything in the truck (user, 20.11.2026: the ground is only for a while).
    if (aside.length > 0) return
    setSaving(true)
    setError(null)
    try {
      props.onSaved(await api.saveLoadPlan(props.jobId, plan.truckId, placementsFromPieces(pieces)))
    } catch (err) {
      setError(describeError(err))
      setSaving(false)
    }
  }

  // ---- What the cards say (the truck only) ----
  const usedMm = occupiedLength(inside) * 10
  const volume = inside.reduce((v, p) => v + p.l * p.w * p.h, 0) * 1000
  const spaceVolume = spaceMm.innerLengthMm * spaceMm.innerWidthMm * spaceMm.innerHeightMm
  const shipmentIds = [...new Set(inside.map((p) => p.shipmentId))]
  const kg = shipmentIds.reduce((sum, id) => sum + (props.weights.get(id) ?? 0), 0)
  const unknownKg = shipmentIds.filter((id) => props.weights.get(id) == null).length

  // Lowest first, so the top of every stack is drawn last (what is seen from above).
  const drawOrder = [...inside].sort((a, b) => a.z + a.h - (b.z + b.h))
  const labels = shipmentIds.map((id) => {
    const e = extentOf(inside.filter((p) => p.shipmentId === id))
    const cx = (e.minX + e.maxX) / 2
    const cy = (e.minY + e.maxY) / 2
    // Only where the shipment is the one seen from above.
    return { id, cx, cy, onTop: shipmentsAt(inside, cx, cy)[0] === id, raised: inside.some((p) => p.shipmentId === id && p.z > 0.05) }
  })
  // What goes along with the one chosen shipment (it rests on it).
  const riders =
    selected !== null && selection.length === 1
      ? new Set(pieces.filter((p) => group.has(p.key) && p.shipmentId !== selected).map((p) => p.shipmentId)).size
      : 0
  const vbW = space.L + 2 * MARGIN
  const vbH = space.W + 2 * MARGIN
  const sel = selected !== null ? pieces.filter((p) => p.shipmentId === selected) : []
  const selExtent = sel.length > 0 ? extentOf(sel) : null

  return (
    <div ref={top} className="load-editor">
      <div className="stats load-editor__meters" role="group" aria-label="Mere rasporeda">
        <Meter
          title="Dužina"
          value={formatMetersMm(usedMm)}
          hint={`od ${formatMetersMm(spaceMm.innerLengthMm)} tovarnog prostora, slobodno ${formatMetersMm(Math.max(0, spaceMm.innerLengthMm - usedMm))}`}
          share={usedMm / spaceMm.innerLengthMm}
          label="Zauzeta dužina"
        />
        <Meter
          title="Zapremina"
          value={`${Math.round((100 * volume) / spaceVolume)} %`}
          hint={`${formatCubicMetersMm3(volume)} od ${formatCubicMetersMm3(spaceVolume)}`}
          share={volume / spaceVolume}
          label="Popunjena zapremina"
        />
        <Meter
          title="Težina"
          value={`${formatKg(kg)} kg`}
          hint={
            (props.capacityKg === null ? 'nosivost bez ograničenja' : `nosivost ${formatKg(props.capacityKg)} kg`) +
            (unknownKg > 0 ? `; bez težine: ${unknownKg}` : '')
          }
          share={props.capacityKg ? kg / props.capacityKg : null}
          label="Iskorišćena nosivost"
        />
        <dl className="stat">
          <dt>Utovareno</dt>
          <dd className="stat__value">{formatShipmentCount(shipmentIds.length)}</dd>
          <dd className="stat__hint">
            {inside.length} {plural(inside.length, 'blok ili komad', 'bloka ili komada', 'blokova ili komada')}
            {aside.length > 0 && `; van kamiona: ${aside.length}`}
          </dd>
        </dl>
      </div>

      <section className="panel load-editor__card" aria-labelledby="load-editor-title">
        <div className="load-editor__head">
          <h2 id="load-editor-title">Uređivanje rasporeda: {props.truckName}</h2>
          <div className="load-editor__actions">
            <button
              type="button"
              disabled={saving}
              onClick={() => (changed ? setConfirm('cancel') : props.onClose())}
            >
              <Icon name="close" />
              Otkaži
            </button>
            <button
              type="button"
              className="button--primary"
              disabled={!changed || saving}
              onClick={() => (aside.length > 0 ? setConfirm('aside') : problems.length > 0 ? setConfirm('save') : void save())}
            >
              <Icon name="save" />
              {saving ? 'Čuvanje…' : 'Sačuvaj raspored'}
            </button>
          </div>
        </div>
        {confirm === 'cancel' && (
          <div className="load-editor__confirm" role="alert">
            <span>Odbaciti izmene rasporeda?</span>
            <button type="button" className="button--danger" onClick={props.onClose}>
              Da, odbaci
            </button>
            <button type="button" onClick={() => setConfirm(null)}>
              Nastavi uređivanje
            </button>
          </div>
        )}
        {confirm === 'save' && (
          <div className="load-editor__confirm" role="alert">
            <span>
              Raspored krši pravila ({problems.length}). Ipak ga sačuvati?
            </span>
            <button type="button" className="button--primary" onClick={() => void save()}>
              Da, sačuvaj
            </button>
            <button type="button" onClick={() => setConfirm(null)}>
              Odustani
            </button>
          </div>
        )}
        {confirm === 'aside' && aside.length > 0 && (
          <div className="load-editor__confirm" role="alert">
            <span>
              Van kamiona {aside.length === 1 ? 'je pošiljka' : 'su pošiljke'} {aside.map(name).join(', ')}. Raspored se
              čuva kada je sve u kamionu: vratite {aside.length === 1 ? 'je' : 'ih'} sa „Ubaci“ u spisku „Van kamiona“ ili
              prevlačenjem u 3D.
            </span>
            <button type="button" onClick={() => setConfirm(null)}>
              U redu
            </button>
          </div>
        )}
        {blocked && (
          <div className="load-editor__confirm" role="alert">
            <span>Izmene rasporeda nisu sačuvane. Napustiti ekran?</span>
            <button type="button" className="button--danger" onClick={() => blocker.proceed?.()}>
              Napusti ekran
            </button>
            <button type="button" onClick={() => blocker.reset?.()}>
              Ostani
            </button>
          </div>
        )}
        {error && (
          <Notice tone="danger" title="Raspored nije sačuvan">
            <p>{error}</p>
          </Notice>
        )}

        <div className="load-editor__tools" role="toolbar" aria-label="Alati">
          <button type="button" onClick={undo} disabled={past.length === 0}>
            <Icon name="undo" />
            Poništi
          </button>
          <button type="button" onClick={redo} disabled={future.length === 0}>
            <Icon name="redo" />
            Ponovi
          </button>
          <button type="button" onClick={() => rotate()} disabled={selected === null}>
            <Icon name="rotate" />
            Okreni 90°
          </button>
          <span className="load-editor__step">
            <span className="text--muted">Korak strelica</span>
            <span className="view-switch" role="group" aria-label="Korak strelica">
              {STEPS.map((s) => (
                <button key={s} type="button" aria-pressed={step === s} onClick={() => setStep(s)}>
                  {s} cm
                </button>
              ))}
            </span>
          </span>
          <span className="load-editor__zoom">
            <button type="button" onClick={() => setZoom((z) => Math.max(1, z / 1.5))} disabled={zoom <= 1}>
              <Icon name="minus" />
              Manje
            </button>
            <button type="button" onClick={() => setZoom(1)} disabled={zoom === 1}>
              <Icon name="fit" />
              Ceo pod
            </button>
            <button type="button" onClick={() => setZoom((z) => Math.min(4, z * 1.5))} disabled={zoom >= 4}>
              <Icon name="plus" />
              Više
            </button>
          </span>
        </div>

        <div className="load-editor__body">
          <div className="load-editor__main">
            <div
              className="load-editor__floor"
              tabIndex={0}
              role="application"
              aria-label="Pod kamiona odozgo. Klik bira pošiljku, prevlačenje je pomera, strelice je pomeraju za izabrani korak, R okreće, Ctrl+Z poništava."
              onKeyDown={onKey}
            >
              <svg
                ref={svg}
                data-testid="load-editor-floor"
                viewBox={`${-MARGIN} ${-MARGIN} ${vbW} ${vbH}`}
                style={{ width: `${zoom * 100}%`, aspectRatio: `${vbW} / ${vbH}` }}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={() => (press.current = null)}
                onDoubleClick={(e) => {
                  // As in the 3D view, a double click turns the shipment.
                  if (e.ctrlKey || e.metaKey) return
                  const p = toCm(e)
                  const id = shipmentsAt(inside, p.x, p.y)[0]
                  if (id === undefined) return
                  if (!selection.includes(id)) choose(id)
                  rotate(id)
                }}
              >
                <rect className="load-editor__deck" x={0} y={0} width={space.L} height={space.W} rx={4} />
                {Array.from({ length: Math.floor(space.L / 100) }, (_, i) => (
                  <line key={i} className="load-editor__tick" x1={(i + 1) * 100} y1={0} x2={(i + 1) * 100} y2={space.W} />
                ))}
                <line className="load-editor__wall" x1={0} y1={-4} x2={0} y2={space.W + 4} />
                <text className="load-editor__end" x={4} y={-10}>
                  Čelo
                </text>
                <text className="load-editor__end" x={space.L - 4} y={-10} textAnchor="end">
                  Vrata
                </text>
                <line className="load-editor__used" x1={usedMm / 10} y1={-6} x2={usedMm / 10} y2={space.W + 6} />
                {drawOrder.map((p) => {
                  const isSel = selection.includes(p.shipmentId)
                  const inGroup = !isSel && group.has(p.key)
                  return (
                    <rect
                      key={p.key}
                      className={`load-editor__piece${isSel ? ' is-selected' : ''}${inGroup ? ' is-group' : ''}${bad.has(p.shipmentId) ? ' is-bad' : ''}`}
                      data-shipment={p.shipmentId}
                      x={p.x}
                      y={p.y}
                      width={p.l}
                      height={p.w}
                      rx={2}
                      style={{ fill: p.color }}
                    />
                  )
                })}
                {labels
                  .filter((l) => l.onTop)
                  .map((l) => (
                    <text key={l.id} className="load-editor__label" x={l.cx} y={l.cy} textAnchor="middle" dominantBaseline="central">
                      {order.number.get(l.id) ?? ''}
                      {l.raised ? ' ▲' : ''}
                    </text>
                  ))}
              </svg>
            </div>

            <div
              ref={part3d}
              className={`load-editor__3d${expanded ? ' load-editor__3d--expanded' : ''}`}
              tabIndex={-1}
              onKeyDown={onKey}
              onPointerDown={(e) => {
                // The keys work after a press in the view. Not on a button or in a list (it takes
                // its own focus), and without scrolling: the page moving between press and release
                // would lose the click.
                if ((e.target as Element).closest('button, a, input, select, .legend, .load-editor__aside')) return
                e.currentTarget.focus({ preventScroll: true })
              }}
            >
              <div className="truck-view__bar">
                <div className="view-switch" role="group" aria-label="Pogled">
                  {VIEWS.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={view === id}
                      onClick={() => {
                        setView(id)
                        setViewTick((t) => t + 1)
                      }}
                    >
                      <ViewIcon view={id} />
                      {label}
                    </button>
                  ))}
                </div>
                <span className="truck-view__actions">
                  <LegendButton open={legend} onToggle={() => setLegend(!legend)} />
                  <button type="button" aria-pressed={full} onClick={() => void toggle()}>
                    <Icon name={full ? 'collapse' : 'expand'} />
                    Ceo ekran
                  </button>
                </span>
              </div>
              <div className="load-editor__3d-main">
              <div className="load-editor__stage">
                <Suspense fallback={<div className="truck3d" role="img" aria-label="3D prikaz se učitava" />}>
                  <Truck3D
                    pieces={pieces}
                    space={scene}
                    selection={selection}
                    bad={bad}
                    onSelect={(id, additive) =>
                      setSelection((s) =>
                        id === null ? (additive ? s : []) : additive ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id],
                      )
                    }
                    onSelectMany={(ids, additive) => setSelection((s) => (additive ? [...new Set([...s, ...ids])] : ids))}
                    editable
                    onDragStart={start3d}
                    onDrag={move3d}
                    onDragEnd={end3d}
                    onRotate={(id) => {
                      if (!selection.includes(id)) choose(id)
                      rotate(id)
                    }}
                    view={view}
                    viewTick={viewTick}
                    label="3D prikaz rasporeda koji se uređuje: pošiljka se prevlači mišem (i na pod oko kamiona), strelice je pomeraju, R okreće"
                  />
                </Suspense>
                {legend && <Legend onClose={() => setLegend(false)} />}
              </div>
              {/* What is on the ground beside the truck; "Ubaci" puts it back at the first place from the front. */}
              <section className="load-editor__aside" aria-labelledby="load-editor-aside">
                <h3 id="load-editor-aside">Van kamiona{aside.length > 0 ? ` (${aside.length})` : ''}</h3>
                {aside.length === 0 ? (
                  <p className="text--muted load-editor__hint">
                    Prevucite pošiljku u 3D prikazu iz kamiona na pod oko njega da je privremeno sklonite. Raspored se
                    čuva kada je sve u kamionu.
                  </p>
                ) : (
                  <ul>
                    {aside.map((id) => {
                      const own = pieces.filter((p) => p.shipmentId === id)
                      const e = extentOf(own)
                      const tall = Math.max(...own.map((p) => p.z + p.h)) - Math.min(...own.map((p) => p.z))
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            className={`load-editor__aside-item${selection.includes(id) ? ' is-selected' : ''}`}
                            aria-label={`Ubaci ${name(id)} u kamion`}
                            title="Ubaci u kamion, na prvo mesto od čela gde ne krši pravila"
                            onClick={() => insert(id)}
                          >
                            <span className="truck-3d__swatch" style={{ background: colors.get(id) }} aria-hidden="true" />
                            <span className="load-editor__aside-text">
                              <strong>{name(id)}</strong>
                              <small>
                                {[
                                  `${formatCm(e.maxX - e.minX)} × ${formatCm(e.maxY - e.minY)} × ${formatCm(tall)}`,
                                  order.number.has(id) && `istovar ${order.number.get(id)}.`,
                                ]
                                  .filter(Boolean)
                                  .join(', ')}
                              </small>
                            </span>
                            <span className="load-editor__aside-go">
                              <Icon name="upload" size={15} />
                              Ubaci
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {notice && (
                  <p className="text--error load-editor__notice" role="alert">
                    <Icon name="alert" size={15} />
                    {notice}
                  </p>
                )}
              </section>
              </div>
            </div>
          </div>

          <aside className="load-editor__side" aria-label="Izabrano i pravila">
            <dl className="load-editor__stats">
              <div>
                <dt>Zauzeto</dt>
                <dd>{formatMetersMm(usedMm)}</dd>
              </div>
            </dl>
            {selection.length > 1 ? (
              <div className="load-editor__selected" aria-live="polite">
                <h3>{selection.length} {plural(selection.length, 'pošiljka izabrana', 'pošiljke izabrane', 'pošiljki izabrano')}</h3>
                <p>Prevlačenje, strelice i R (ili dvoklik) pomeraju ih i okreću zajedno, sa onim što stoji na njima.</p>
              </div>
            ) : selected !== null && selExtent ? (
              <div className="load-editor__selected" aria-live="polite">
                <h3>
                  <span className="truck-3d__swatch" style={{ background: colors.get(selected) }} aria-hidden="true" /> {name(selected)}
                </h3>
                {isOut(selected) && (
                  <p className="load-editor__hint">
                    Van kamiona, na podu pored njega. „Ubaci“ u spisku „Van kamiona“ je vraća na prvo mesto od čela gde ne
                    krši pravila; može i da se prevuče nazad u 3D.
                  </p>
                )}
                <dl>
                  <dt>Mere</dt>
                  <dd>
                    {formatCm(selExtent.maxX - selExtent.minX)} × {formatCm(selExtent.maxY - selExtent.minY)} ×{' '}
                    {formatCm(Math.max(...sel.map((p) => p.z + p.h)) - Math.min(...sel.map((p) => p.z)))}
                  </dd>
                  {!isOut(selected) && (
                    <>
                      <dt>Od čela</dt>
                      <dd>{formatCm(selExtent.minX)}</dd>
                      <dt>Od desne strane</dt>
                      <dd>{formatCm(selExtent.minY)}</dd>
                      <dt>Visina dna</dt>
                      <dd>
                        {formatCm(Math.min(...sel.map((p) => p.z)))}
                        {sel.some((p) => p.z > 0.05) ? ' (na drugoj pošiljci)' : ' (na podu)'}
                      </dd>
                    </>
                  )}
                  {riders > 0 && (
                    <>
                      <dt>Pomera se sa</dt>
                      <dd>
                        još {riders} {plural(riders, 'pošiljkom', 'pošiljke', 'pošiljki')} na njoj
                      </dd>
                    </>
                  )}
                  {order.number.has(selected) && (
                    <>
                      <dt>Istovar</dt>
                      <dd>{order.number.get(selected)}.</dd>
                    </>
                  )}
                  {sel.length > 1 && (
                    <>
                      <dt>Komada</dt>
                      <dd>{sel.length} (iz smartLoad+)</dd>
                    </>
                  )}
                </dl>
              </div>
            ) : (
              <p className="text--muted load-editor__hint">
                Kliknite pošiljku da je izaberete. Ponovni klik na isto mesto bira pošiljku ispod. Ctrl + klik dodaje
                pošiljku u izbor, a Shift + prevlačenje u 3D bira okvirom. Brojevi na podu su redosled istovara.
              </p>
            )}
            <div className="load-editor__problems" aria-live="polite">
              {problems.length === 0 ? (
                <p className="text--success load-editor__ok">
                  <Icon name="check" />
                  Sva pravila su ispunjena.
                </p>
              ) : (
                <>
                  <h3>
                    <Icon name="alert" />
                    Prekršeno ({problems.length})
                  </h3>
                  <ul>
                    {problems.slice(0, 30).map((p) => (
                      <li key={`${p.kind}:${p.shipmentIds.join(',')}`}>
                        <button type="button" onClick={() => choose(p.shipmentIds[0])}>
                          {p.text}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}

/** A card with a value and a bar (share 0..1; null: no bar). */
function Meter({ title, value, hint, share, label }: { title: string; value: string; hint: string; share: number | null; label: string }) {
  const percent = share === null ? null : Math.round(share * 100)
  return (
    <dl className="stat">
      <dt>{title}</dt>
      <dd className="stat__value">{value}</dd>
      {percent !== null && (
        <dd className="ldm-bar load-editor__bar">
          <div
            className={`ldm-bar__track${percent > 100 ? ' ldm-bar__track--over' : ''}`}
            role="meter"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={`${percent} %`}
          >
            <div className="ldm-bar__fill" style={{ width: `${Math.min(percent, 100)}%` }} />
          </div>
        </dd>
      )}
      <dd className="stat__hint">{hint}</dd>
    </dl>
  )
}
