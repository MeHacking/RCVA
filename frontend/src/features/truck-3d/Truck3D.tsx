import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { truckShape } from './truckShape'
import { boxFor, extentCorners, fitView, usedLength, type Piece, type Space, type ViewName } from './scene'

// The 3D view of one truck's load, taken over from smartLoad (editor/Truck3D.tsx, 17.11.2026)
// at the user's request; it replaces the TeGo viewer. three.js only (MIT), bundled, so it works
// without internet; loaded lazily (TruckVisualizer), so it is not in the main bundle. It draws
// the truck (a tractor with a semi-trailer from 10 m, otherwise a rigid truck) and the blocks of
// the shipments; the chosen one is marked, and a click picks one. Its own canvas inside the card
// (the TeGo viewer drew into one shared canvas behind the page). It renders only when something
// changes, and everything is released when it unmounts.

/** A point on the floor in plan cm: x along the cargo space, y across. */
export interface PlanPoint {
  x: number
  y: number
}

interface Props {
  pieces: Piece[]
  space: Space
  /** The chosen shipment in the view; the others fade. */
  selected?: number | null
  /**
   * In the editor (user, 19.11.2026: "Uredi", as smartLoad): the chosen shipments, marked
   * without fading the others.
   */
  selection?: readonly number[]
  /** shipments that break a loading rule: outlined in the danger colour */
  bad?: ReadonlySet<number>
  /** A click: the shipment (null beside the load); `additive` with Ctrl, to add or remove it. */
  onSelect: (shipmentId: number | null, additive: boolean) => void
  /** Shift+drag: every shipment whose block's middle is inside the box. */
  onSelectMany?: (shipmentIds: number[], additive: boolean) => void
  /** Dragging shipments across the floor (the editor); the points are plan cm. */
  editable?: boolean
  onDragStart?: (shipmentId: number, at: PlanPoint) => void
  onDrag?: (at: PlanPoint) => void
  onDragEnd?: () => void
  /** A double click on a shipment (the editor): turn it by 90°. */
  onRotate?: (shipmentId: number) => void
  view: ViewName
  /** Changes whenever a view button is pressed (even the same view twice). */
  viewTick: number
  label: string
}

/** What tests 8 and 9 read from the canvas (tests/e2e/truck3d.spec.ts); nothing else uses it. */
export interface Truck3dProbe {
  memory: { geometries: number; textures: number }
  /** the shipments drawn as blocks, in plan order */
  pieces: () => number[]
  /** the shipments drawn as chosen */
  selected: () => number[]
  /** where the middle of a block's top is on the screen (client px) */
  screenOf: (shipmentId: number) => { x: number; y: number } | null
  /** where the corners of the whole truck are in the picture (-1..1 is inside) */
  truckOnScreen: () => { left: number; right: number; bottom: number; top: number }
  /** where the camera stands (scene cm: X along the truck, Y up, Z across) */
  cameraAt: () => [number, number, number]
}

interface Stage {
  scene: THREE.Scene
  truck: THREE.Group
  load: THREE.Group
  render: () => void
  fit: (view: ViewName) => void
}

/** The camera at a view, with the whole truck in the picture (fitView in scene.ts). */
function fitCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, view: ViewName, space: Space) {
  const { pos, target } = fitView(view, space, camera.aspect || 2, camera.fov)
  camera.position.set(...pos)
  controls.target.set(...target)
  camera.lookAt(controls.target)
  controls.update()
}

/** A colour token from tokens.css (as the element sees it). */
function token(element: Element, name: string): THREE.Color {
  return new THREE.Color(getComputedStyle(element).getPropertyValue(name).trim() || '#000000')
}

export function Truck3D(props: Props) {
  const host = useRef<HTMLDivElement>(null)
  const stage = useRef<Stage | null>(null)
  const latest = useRef(props)
  useEffect(() => {
    latest.current = props
  })

  // Renderer, camera, controls and the pointer: once.
  useEffect(() => {
    const el = host.current
    if (!el) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      // No WebGL: a message in place of the canvas (added like the canvas, outside React).
      const message = document.createElement('p')
      message.className = 'truck3d__fallback'
      message.textContent = '3D prikaz ne radi u ovom pregledaču (nema WebGL).'
      el.append(message)
      return () => message.remove()
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, 1, 5, 30000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.maxPolarAngle = Math.PI / 2 - 0.02 // not below the ground
    controls.minDistance = 80
    controls.maxDistance = 8000
    scene.add(new THREE.HemisphereLight(token(el, '--truck3d-sky'), token(el, '--truck3d-ground-light'), 1.6))
    const sun = new THREE.DirectionalLight(token(el, '--truck3d-sky'), 1.3)
    sun.position.set(-400, 900, 700)
    scene.add(sun)
    const truck = new THREE.Group()
    const load = new THREE.Group()
    scene.add(truck, load)
    let frame = 0
    const render = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        renderer.render(scene, camera)
        el.dataset.state = 'ready'
      })
    }
    controls.addEventListener('change', render)
    // Once the user turns or zooms, a resize (full screen, say) keeps their camera.
    let userMoved = false
    const onStart = () => {
      userMoved = true
    }
    controls.addEventListener('start', onStart)
    const fit = (view: ViewName) => {
      userMoved = false
      fitCamera(camera, controls, view, latest.current.space)
      render()
    }
    const resize = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      if (!userMoved) fitCamera(camera, controls, latest.current.view, latest.current.space)
      render()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(el)

    const ray = new THREE.Raycaster()
    const blocks = () => load.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh && o.userData.shipmentId !== undefined)
    const ndc = (e: { clientX: number; clientY: number }) => {
      const r = renderer.domElement.getBoundingClientRect()
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    }
    const hitAt = (e: { clientX: number; clientY: number }) => {
      ray.setFromCamera(ndc(e), camera)
      return ray.intersectObjects(blocks(), false)[0]
    }
    const idAt = (e: MouseEvent) => {
      const hit = hitAt(e)
      return hit ? (hit.object.userData.shipmentId as number) : null
    }
    /** Where the pointer meets the level `height` (scene Y), as plan cm. */
    const planAt = (e: { clientX: number; clientY: number }, height: number): PlanPoint | null => {
      ray.setFromCamera(ndc(e), camera)
      const p = new THREE.Vector3()
      return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -height), p) ? { x: p.x, y: p.z } : null
    }
    // A press that does not move is a click; otherwise it turns the view, or, in the editor and
    // on a shipment, moves the shipment (from 4 px on, as in smartLoad). Ctrl+click adds or
    // removes a shipment; Shift+drag draws a box that chooses what is inside.
    let press: { x: number; y: number; id: number | null; height: number; dragging: boolean; additive: boolean } | null = null
    let box: { x0: number; y0: number; el: HTMLDivElement; additive: boolean } | null = null
    const canvas = renderer.domElement
    const drawBox = (e: PointerEvent) => {
      if (!box) return
      const r = el.getBoundingClientRect()
      Object.assign(box.el.style, {
        left: `${Math.min(box.x0, e.clientX) - r.left}px`,
        top: `${Math.min(box.y0, e.clientY) - r.top}px`,
        width: `${Math.abs(e.clientX - box.x0)}px`,
        height: `${Math.abs(e.clientY - box.y0)}px`,
      })
    }
    const endBox = (e: PointerEvent) => {
      const b = box
      box = null
      controls.enabled = true
      if (!b) return
      b.el.remove()
      const r = canvas.getBoundingClientRect()
      const [x0, x1] = [Math.min(b.x0, e.clientX), Math.max(b.x0, e.clientX)]
      const [y0, y1] = [Math.min(b.y0, e.clientY), Math.max(b.y0, e.clientY)]
      const ids = new Set<number>()
      for (const mesh of blocks()) {
        const v = mesh.position.clone().project(camera)
        const sx = r.left + ((v.x + 1) / 2) * r.width
        const sy = r.top + ((1 - v.y) / 2) * r.height
        if (v.z < 1 && sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) ids.add(mesh.userData.shipmentId as number)
      }
      latest.current.onSelectMany?.([...ids], b.additive)
    }
    const onDown = (e: PointerEvent) => {
      press = null
      if (e.button !== 0) return
      const p = latest.current
      const additive = e.ctrlKey || e.metaKey
      if (e.shiftKey && p.onSelectMany) {
        controls.enabled = false // the box, not the camera
        canvas.setPointerCapture(e.pointerId)
        const div = document.createElement('div')
        div.className = 'truck3d__box'
        el.appendChild(div)
        box = { x0: e.clientX, y0: e.clientY, el: div, additive }
        drawBox(e)
        return
      }
      const hit = hitAt(e)
      const id = hit ? (hit.object.userData.shipmentId as number) : null
      press = { x: e.clientX, y: e.clientY, id, height: hit ? hit.point.y : 0, dragging: false, additive }
      if (p.editable && (id !== null || additive)) {
        controls.enabled = false // the shipment moves (or is picked), not the camera
        canvas.setPointerCapture(e.pointerId)
      }
    }
    const onUp = (e: PointerEvent) => {
      if (box) {
        endBox(e)
        return
      }
      const was = press
      press = null
      controls.enabled = true
      if (!was) return
      if (was.dragging) {
        canvas.style.cursor = 'grab'
        latest.current.onDragEnd?.()
        return
      }
      if (Math.hypot(e.clientX - was.x, e.clientY - was.y) <= 4) latest.current.onSelect(was.id, was.additive)
    }
    const onMove = (e: PointerEvent) => {
      const p = latest.current
      if (box) {
        drawBox(e)
        return
      }
      if (!press) {
        canvas.style.cursor = idAt(e) === null ? '' : p.editable ? 'grab' : 'pointer'
        return
      }
      if (press.id === null || !p.editable || press.additive) return
      const at = planAt(e, press.height)
      if (!at) return
      if (!press.dragging) {
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 4) return
        press.dragging = true
        canvas.style.cursor = 'grabbing'
        // From where the press was, so the shipment does not jump.
        p.onDragStart?.(press.id, planAt({ clientX: press.x, clientY: press.y }, press.height) ?? at)
      }
      p.onDrag?.(at)
    }
    const onDouble = (e: MouseEvent) => {
      const p = latest.current
      if (e.button !== 0 || !p.editable || !p.onRotate) return
      const id = idAt(e)
      if (id !== null) p.onRotate(id)
    }
    // Before OrbitControls' own listener, so a press on a shipment never turns the view.
    canvas.addEventListener('pointerdown', onDown, { capture: true })
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('dblclick', onDouble)

    const probe: Truck3dProbe = {
      memory: renderer.info.memory,
      pieces: () => blocks().map((m) => m.userData.shipmentId as number),
      selected: () => blocks().filter((m) => m.userData.selected).map((m) => m.userData.shipmentId as number),
      screenOf: (id) => {
        const mesh = blocks().find((m) => m.userData.shipmentId === id)
        if (!mesh) return null
        const box = new THREE.Box3().setFromObject(mesh)
        const p = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2).project(camera)
        const r = canvas.getBoundingClientRect()
        return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height }
      },
      truckOnScreen: () => {
        const ps = extentCorners(latest.current.space).map(([x, y, z]) => new THREE.Vector3(x, y, z).project(camera))
        return {
          left: Math.min(...ps.map((p) => p.x)),
          right: Math.max(...ps.map((p) => p.x)),
          bottom: Math.min(...ps.map((p) => p.y)),
          top: Math.max(...ps.map((p) => p.y)),
        }
      },
      cameraAt: () => camera.position.toArray(),
    }
    Object.assign(canvas, { rcvaProbe: probe })

    stage.current = { scene, truck, load, render, fit }
    resize()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener('pointerdown', onDown, { capture: true })
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('dblclick', onDouble)
      box?.el.remove()
      controls.removeEventListener('change', render)
      controls.removeEventListener('start', onStart)
      controls.dispose()
      disposeGroup(truck)
      disposeGroup(load)
      renderer.dispose()
      canvas.remove()
      delete el.dataset.state
      stage.current = null
    }
  }, [])

  const { space, pieces, selected = null, selection, bad, view, viewTick } = props

  // The truck: when the size of the cargo space changes.
  useEffect(() => {
    const s = stage.current
    const el = host.current
    if (!s || !el) return
    disposeGroup(s.truck)
    buildTruck(s.truck, space, el)
    s.render()
  }, [space.L, space.W, space.H]) // eslint-disable-line react-hooks/exhaustive-deps

  // The blocks: when the plan or the choice changes.
  useEffect(() => {
    const s = stage.current
    const el = host.current
    if (!s || !el) return
    disposeGroup(s.load)
    const accent = token(el, '--truck3d-selected')
    const edge = token(el, '--truck3d-edge')
    const danger = token(el, '--truck3d-bad')
    for (const p of pieces) {
      const b = boxFor(p)
      const chosen = selection ? selection.includes(p.shipmentId) : p.shipmentId === selected
      const wrong = bad?.has(p.shipmentId) ?? false
      // While a shipment is chosen in the view, the others fade, so it stands out whatever its
      // colour (a tint in the accent alone barely shows on some of the colours). The editor
      // keeps them all solid, as smartLoad does, since they are moved around each other.
      const faded = !selection && selected !== null && !chosen
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(b.sx - 0.6, b.sy - 0.6, b.sz - 0.6),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(p.color),
          roughness: 0.75,
          emissive: chosen ? accent : new THREE.Color(0, 0, 0),
          emissiveIntensity: chosen ? (selection ? 0.35 : 0.2) : 0,
          transparent: faded,
          opacity: faded ? 0.22 : 1,
          depthWrite: !faded,
        }),
      )
      mesh.position.set(b.cx, b.cy, b.cz)
      mesh.userData = { shipmentId: p.shipmentId, selected: chosen }
      s.load.add(mesh)
      const strong = chosen || wrong
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({
          color: wrong ? danger : chosen ? accent : edge,
          transparent: !strong,
          opacity: strong ? 1 : faded ? 0.3 : 0.55,
        }),
      )
      edges.position.copy(mesh.position)
      s.load.add(edges)
    }
    // The occupied length: a thin frame across the cargo space, in the accent.
    const used = usedLength(pieces)
    if (used > 0) {
      const mark = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(space.W, space.H)),
        new THREE.LineBasicMaterial({ color: accent }),
      )
      mark.rotation.y = Math.PI / 2
      mark.position.set(used, space.H / 2, space.W / 2)
      s.load.add(mark)
    }
    s.render()
  }, [pieces, selected, selection, bad, space.W, space.H])

  // The views.
  useEffect(() => {
    stage.current?.fit(view)
  }, [view, viewTick, space.L, space.W, space.H])

  return <div ref={host} className="truck3d" data-testid="truck-visualizer" role="img" aria-label={props.label} />
}

/** One box of the truck model: size and centre in scene cm. */
function block(g: THREE.Group, mat: THREE.Material, sx: number, sy: number, sz: number, cx: number, cy: number, cz: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat)
  m.position.set(cx, cy, cz)
  g.add(m)
  return m
}

/**
 * The truck around the cargo space (a drawing, not the real measures of a vehicle): cab with
 * windscreen, mirrors, lights and bumper; chassis; wheels; for a semi the coupling and the
 * trailer's landing legs; the floor, corner posts and top rails (a curtain-sider seen through),
 * rear bumper and lights.
 */
function buildTruck(g: THREE.Group, s: Space, el: Element) {
  const t = truckShape(s.L)
  const ground = -t.deck
  const frameColor = token(el, '--truck3d-frame')
  const body = new THREE.MeshStandardMaterial({ color: token(el, '--truck3d-body'), roughness: 0.55, metalness: 0.1 })
  const trim = new THREE.MeshStandardMaterial({ color: token(el, '--truck3d-trim'), roughness: 0.8 })
  const steel = new THREE.MeshStandardMaterial({ color: token(el, '--truck3d-steel'), roughness: 0.6, metalness: 0.4 })
  const glass = new THREE.MeshStandardMaterial({
    color: token(el, '--truck3d-glass'),
    roughness: 0.15,
    metalness: 0.3,
    transparent: true,
    opacity: 0.85,
  })
  const tyre = new THREE.MeshStandardMaterial({ color: token(el, '--truck3d-tyre'), roughness: 0.95 })
  const rim = new THREE.MeshStandardMaterial({ color: token(el, '--truck3d-rim'), roughness: 0.4, metalness: 0.6 })
  const headlight = token(el, '--truck3d-headlight')
  const light = new THREE.MeshStandardMaterial({ color: headlight, emissive: headlight, emissiveIntensity: 0.4 })
  const tail = token(el, '--truck3d-tail-light')
  const red = new THREE.MeshStandardMaterial({ color: tail, emissive: tail, emissiveIntensity: 0.25 })
  const floorMat = new THREE.MeshStandardMaterial({ color: token(el, '--truck3d-floor'), roughness: 0.9 })
  const frameMat = new THREE.MeshStandardMaterial({ color: frameColor, transparent: true, opacity: 0.55, roughness: 0.6 })
  const wallMat = new THREE.MeshStandardMaterial({ color: frameColor, transparent: true, opacity: 0.12 })
  const W = s.W
  const zc = W / 2

  // A soft shadow on the ground.
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(t.total + 60, W + 2 * t.wheelOut + 60),
    new THREE.MeshBasicMaterial({ color: token(el, '--truck3d-shadow'), transparent: true, opacity: 0.18, depthWrite: false }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.set((s.L + 10 - t.x0) / 2, ground + 0.5, zc)
  g.add(shadow)

  // ---- The cargo space (trailer or body) ----
  block(g, floorMat, s.L, 4, W, s.L / 2, -2, zc)
  block(g, trim, s.L, 12, W + 4, s.L / 2, -10, zc) // floor edge
  const post = 7
  for (const x of [post / 2, s.L - post / 2]) {
    for (const z of [post / 2, W - post / 2]) block(g, frameMat, post, s.H, post, x, s.H / 2, z) // corner posts
  }
  for (const z of [post / 2, W - post / 2]) block(g, frameMat, s.L, post, post, s.L / 2, s.H - post / 2, z) // top rails
  for (const x of [post / 2, s.L - post / 2]) block(g, frameMat, post, post, W, x, s.H - post / 2, zc) // front and rear headers
  block(g, wallMat, 3, s.H, W, -1.5, s.H / 2, zc) // front wall
  // Metre marks on the floor edge.
  const marks: number[] = []
  for (let m = 100; m < s.L; m += 100) marks.push(m, 0.5, -1, m, 0.5, W + 1)
  g.add(
    new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(marks, 3)),
      new THREE.LineBasicMaterial({ color: frameColor, transparent: true, opacity: 0.15 }),
    ),
  )
  // Chassis under the floor, rear bumper and lights.
  const beamZ = [zc - 45, zc + 45]
  const chassisFrom = t.semi ? 0 : -t.x0 + 40
  for (const z of beamZ) block(g, steel, s.L - chassisFrom, 24, 14, (chassisFrom + s.L) / 2, -28, z)
  block(g, steel, 12, 14, W - 20, s.L + 4, ground + 50, zc) // underrun bar
  const barTop = ground + 50
  for (const z of [30, W - 30]) block(g, steel, 8, -16 - barTop, 8, s.L + 2, (barTop - 16) / 2, z) // its holders
  for (const z of [16, W - 16]) block(g, red, 4, 14, 26, s.L + 2, -28, z) // tail lights
  if (t.semi) {
    for (const z of [zc - 55, zc + 55]) block(g, steel, 12, t.deck - 30, 12, 160, ground + (t.deck - 30) / 2, z) // landing legs
  }

  // ---- Wheels ----
  const r = t.tyre / 2
  const wheelZ = [-t.wheelOut + 13, W + t.wheelOut - 13]
  t.axles.forEach((ax, i) => {
    const x = ax - t.x0
    const width = i > 0 ? 46 : 30 // drive and trailer axles: twin tyres
    for (const z of wheelZ) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 28), tyre)
      wheel.rotation.x = Math.PI / 2
      wheel.position.set(x, ground + r, z)
      g.add(wheel)
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, width + 1, 20), rim)
      hub.rotation.x = Math.PI / 2
      hub.position.copy(wheel.position)
      g.add(hub)
    }
    block(g, steel, 10, 10, W - 20, x, ground + r, zc) // axle
  })
  // Mudguards over the trailer wheels.
  if (t.semi) {
    const back = t.axles.slice(-3).map((a) => a - t.x0)
    for (const z of wheelZ) block(g, trim, back[2] - back[0] + t.tyre + 20, 4, 50, (back[0] + back[2]) / 2, ground + t.tyre + 8, z)
  }

  // ---- Tractor or rigid truck: chassis and cab ----
  const cabFront = -t.x0
  const cabBack = cabFront + t.cabL
  if (t.semi) {
    for (const z of beamZ) block(g, steel, t.x0 + 220, 22, 14, cabFront + (t.x0 + 220) / 2, ground + 70, z) // tractor frame
    const fifth = new THREE.Mesh(new THREE.CylinderGeometry(42, 42, 8, 24), trim) // coupling under the trailer front
    fifth.position.set(70, -40, zc)
    g.add(fifth)
    block(g, steel, 20, 30, 20, 70, -22, zc) // king pin housing
    for (const z of wheelZ) block(g, trim, t.tyre + 30, 4, 50, t.axles[1] - t.x0 + 65, ground + t.tyre + 8, z) // drive mudguards
  }
  const cabW = W * 0.94
  const cabBottom = ground + 55
  const cabTop = ground + t.cabH
  const cabTall = cabTop - cabBottom
  block(g, body, t.cabL, cabTall - 40, cabW, (cabFront + cabBack) / 2, (cabBottom + cabTop - 40) / 2, zc) // cab body
  block(g, body, t.cabL - 30, 40, cabW - 16, (cabFront + 15 + cabBack) / 2, cabTop - 20, zc) // roof, a little set back
  block(g, glass, 3, cabTall * 0.38, cabW - 26, cabFront - 1.5, cabBottom + cabTall * 0.58, zc) // windscreen
  for (const z of [zc - cabW / 2 - 1.5, zc + cabW / 2 + 1.5]) {
    block(g, glass, t.cabL * 0.45, cabTall * 0.3, 3, cabFront + t.cabL * 0.28, cabBottom + cabTall * 0.6, z) // side windows
  }
  for (const side of [-1, 1]) {
    block(g, trim, 6, 50, 6, cabFront + 18, cabBottom + cabTall * 0.62, zc + side * (cabW / 2 + 22)) // mirror
    block(g, trim, 6, 6, 22, cabFront + 18, cabBottom + cabTall * 0.62 + 25, zc + side * (cabW / 2 + 11)) // its arm
    block(g, light, 3, 14, 34, cabFront - 1, cabBottom + 22, zc + side * (cabW / 2 - 30)) // headlight
  }
  block(g, trim, 14, 34, cabW + 6, cabFront - 4, cabBottom + 2, zc) // bumper
  block(g, trim, 3, 40, cabW * 0.5, cabFront - 1.5, cabBottom + 62, zc) // grille
}

function disposeGroup(g: THREE.Group) {
  for (const o of [...g.children]) {
    g.remove(o)
    const m = o as THREE.Mesh
    m.geometry?.dispose()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
    else mat?.dispose()
  }
}
