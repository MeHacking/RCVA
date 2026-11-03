import { RoutePlanner, type Route, type RouteRules } from './routePlanner'
import { SeededRandom } from './random'

// Replaces the Timefold model in backend/.../optimization/solver/: the solver decides only
// which truck carries which shipment; RoutePlanner gives the order of stops for that set.
// Same score as RoutingConstraints.java, compared level by level, plus weight (B2), which
// the Java model does not have:
//   hard   = minus LDM tenths and kilograms over a truck's capacity (0 means feasible)
//   medium = minus the number of trucks with at least one shipment
//   soft   = minus the metres of all routes
// Options the Java model does not have (all off by default, so the score above is unchanged):
// - a truck may have its own start (`SolverTruck.start`), e.g. where it is now;
// - `allowUnassigned`: a shipment may stay without a truck; medium then counts first the LDM
//   left out (each tenth worse than any number of trucks), then the trucks, so the solver
//   leaves out as little as it can and overloads nothing;
// - `freeTrucks`: up to this many used trucks cost nothing, so only metres decide between
//   them (planning after the advice "one more truck");
// - `exactTrucks`: every truck more or fewer than this costs a point, so the solver finds
//   the shortest routes with exactly that many (the comparison "what if one more truck
//   were used": otherwise a truck without an empty drive would only replace another).
// Search: a construction heuristic (largest shipments first, each where it costs least),
// then simulated annealing (see solve) with five moves: move a shipment to another truck,
// swap two shipments between trucks, swap the loads of two trucks (to reach a truck of
// another capacity), ruin and recreate (take a few shipments off and put them back where
// they fit best), and empty a truck into the others (the move that lowers the number of
// trucks, which single moves rarely reach).

export interface SolverShipment {
  ldmTenths: number
  weightKg: number
  /** location index into `distance` */
  pickup: number
  delivery: number
}

export interface SolverTruck {
  id: number
  capacityLdmTenths: number
  /** Infinity: weight is not limited (the Java model) */
  capacityKg: number
  /** location index this truck starts from; missing: `rules.start` */
  start?: number | null
}

export interface SolverInput {
  /** metres between location indices */
  distance: number[][]
  rules: RouteRules
  shipments: SolverShipment[]
  trucks: SolverTruck[]
  /** a shipment may stay without a truck (see the score above); default false */
  allowUnassigned?: boolean
  /** this many used trucks cost nothing at the medium level; default 0 */
  freeTrucks?: number
  /** each used truck more or fewer than this costs a medium point (instead of freeTrucks) */
  exactTrucks?: number
}

export interface SolverOptions {
  seed?: number
  /** stop after this many steps (repeatable runs, for tests) */
  stepLimit?: number
  /** stop after this many milliseconds */
  timeLimitMs?: number
}

export interface Score {
  hard: number
  medium: number
  soft: number
}

export interface SolvedRoute {
  truckId: number
  /** shipment indices, ascending */
  shipments: number[]
  route: Route
}

export interface SolverResult {
  score: Score
  /** truck index (into input.trucks) of each shipment; input.trucks.length: without a truck */
  truckOfShipment: number[]
  /** used trucks in input order */
  routes: SolvedRoute[]
  /** shipment indices left without a truck (only with allowUnassigned), ascending */
  unassigned: number[]
  steps: number
}

export function compareScores(a: Score, b: Score): number {
  return a.hard - b.hard || a.medium - b.medium || a.soft - b.soft
}

export function isFeasible(score: Score): boolean {
  return score.hard === 0
}

/** Score of a given assignment (truck index per shipment), without solving. */
export function scoreOf(input: SolverInput, truckOfShipment: number[], planners = plannersFor(input)): Score {
  const state = new State(input, planners)
  truckOfShipment.forEach((t, s) => state.add(s, t))
  return state.score()
}

/** The planner of routes from `start` (default: the rules' start). */
export function plannerFor(input: SolverInput, start: number | null = input.rules.start): RoutePlanner {
  return new RoutePlanner({
    distance: input.distance,
    ...input.rules,
    start,
    pickupLocation: input.shipments.map((s) => s.pickup),
    deliveryLocation: input.shipments.map((s) => s.delivery),
  })
}

/** One planner per truck, shared by trucks with the same start (it caches route lengths). */
export function plannersFor(input: SolverInput): RoutePlanner[] {
  const byStart = new Map<number | null, RoutePlanner>()
  return input.trucks.map((truck) => {
    const start = truck.start === undefined ? input.rules.start : truck.start
    let planner = byStart.get(start)
    if (!planner) {
      planner = plannerFor(input, start)
      byStart.set(start, planner)
    }
    return planner
  })
}

export function solve(input: SolverInput, options: SolverOptions = {}): SolverResult {
  if (options.stepLimit === undefined && options.timeLimitMs === undefined) {
    throw new Error('solve needs a stepLimit or a timeLimitMs')
  }
  if (input.trucks.length === 0 && input.shipments.length > 0) throw new Error('no trucks')
  const planners = plannersFor(input)
  const random = new SeededRandom(options.seed ?? 1)
  const state = construct(input, planners)

  let current = state.score()
  let best = current
  let bestAssignment = [...state.truckOf]
  const started = Date.now()
  const timeLimit = options.timeLimitMs ?? Infinity
  const stepLimit = options.stepLimit ?? Infinity
  // Simulated annealing on the soft level only: a move that makes hard or medium worse is
  // never taken; a longer route is taken with probability exp(-extra / temperature). The
  // temperature starts at a few percent of an average route and falls with progress.
  const startTemperature = (0.05 * -current.soft) / Math.max(1, state.usedTrucks())
  const endTemperature = startTemperature / 1000
  let progress = 0
  let steps = 0

  while (progress < 1 && input.shipments.length > 0 && state.members.length > 1) {
    if (steps % 100 === 0) progress = Math.max(steps / stepLimit, (Date.now() - started) / timeLimit)
    else progress = Math.max(progress, steps / stepLimit)
    const undo = randomMove(state, random)
    if (undo !== null) {
      const candidate = state.score()
      const temperature = startTemperature > 0 ? startTemperature * (endTemperature / startTemperature) ** progress : 0
      if (accepts(candidate, current, temperature, random)) {
        current = candidate
        if (compareScores(current, best) > 0) {
          best = current
          bestAssignment = [...state.truckOf]
        }
      } else {
        undo()
      }
    }
    steps++
  }

  const routes: SolvedRoute[] = []
  input.trucks.forEach((truck, t) => {
    const shipments = bestAssignment.flatMap((owner, s) => (owner === t ? [s] : []))
    if (shipments.length > 0) routes.push({ truckId: truck.id, shipments, route: planners[t].plan(shipments) })
  })
  const unassigned = bestAssignment.flatMap((owner, s) => (owner === input.trucks.length ? [s] : []))
  return { score: best, truckOfShipment: bestAssignment, routes, unassigned, steps }
}

function accepts(candidate: Score, current: Score, temperature: number, random: SeededRandom): boolean {
  if (compareScores(candidate, current) >= 0) return true
  if (candidate.hard !== current.hard || candidate.medium !== current.medium || temperature <= 0) return false
  return random.next() < Math.exp((candidate.soft - current.soft) / temperature)
}

/**
 * Current assignment with per-truck load and route length kept up to date. With
 * allowUnassigned there is one more "truck" after the real ones: the shipments left out.
 */
class State {
  readonly truckOf: number[]
  readonly members: number[][]
  readonly load: number[]
  readonly weight: number[]
  readonly input: SolverInput
  /** index of the left-out shipments, or -1 */
  readonly outside: number
  /** real trucks with at least one shipment */
  private used = 0
  private readonly meters: number[]
  private readonly planners: RoutePlanner[]

  constructor(input: SolverInput, planners: RoutePlanner[]) {
    this.input = input
    this.planners = planners
    this.outside = input.allowUnassigned ? input.trucks.length : -1
    const buckets = input.trucks.length + (input.allowUnassigned ? 1 : 0)
    this.truckOf = new Array<number>(input.shipments.length).fill(-1)
    this.members = Array.from({ length: buckets }, () => [])
    this.load = new Array<number>(buckets).fill(0)
    this.weight = new Array<number>(buckets).fill(0)
    this.meters = new Array<number>(buckets).fill(0)
  }

  add(shipment: number, truck: number): void {
    this.truckOf[shipment] = truck
    this.members[truck].push(shipment)
    if (truck !== this.outside && this.members[truck].length === 1) this.used++
    this.load[truck] += this.input.shipments[shipment].ldmTenths
    this.weight[truck] += this.input.shipments[shipment].weightKg
    this.refresh(truck)
  }

  remove(shipment: number): number {
    const truck = this.truckOf[shipment]
    const list = this.members[truck]
    list.splice(list.indexOf(shipment), 1)
    if (truck !== this.outside && list.length === 0) this.used--
    this.load[truck] -= this.input.shipments[shipment].ldmTenths
    this.weight[truck] -= this.input.shipments[shipment].weightKg
    this.truckOf[shipment] = -1
    this.refresh(truck)
    return truck
  }

  move(shipment: number, truck: number): void {
    this.remove(shipment)
    this.add(shipment, truck)
  }

  /** Real trucks with at least one shipment. */
  usedTrucks(): number {
    return this.used
  }

  score(): Score {
    const total = { hard: 0, medium: this.medium(), soft: 0 }
    for (let t = 0; t < this.input.trucks.length; t++) {
      const part = this.truckPart(t)
      total.hard += part.hard
      total.soft += part.soft
    }
    return total
  }

  /** Change of the score if an unassigned `shipment` were added to `truck` (no change made). */
  withAdded(shipment: number, truck: number): Score {
    const before = this.truckPart(truck)
    const mediumBefore = this.medium()
    this.add(shipment, truck)
    const after = this.truckPart(truck)
    const mediumAfter = this.medium()
    this.remove(shipment)
    return { hard: after.hard - before.hard, medium: mediumAfter - mediumBefore, soft: after.soft - before.soft }
  }

  /** Hard and soft score of one truck (nothing for the left-out shipments). */
  private truckPart(truck: number): { hard: number; soft: number } {
    if (truck === this.outside) return { hard: 0, soft: 0 }
    const { capacityLdmTenths, capacityKg } = this.input.trucks[truck]
    const over = Math.max(0, this.load[truck] - capacityLdmTenths) + Math.max(0, this.weight[truck] - capacityKg)
    return { hard: -over, soft: -this.meters[truck] }
  }

  private medium(): number {
    const { exactTrucks, freeTrucks = 0 } = this.input
    const trucks = exactTrucks === undefined ? Math.max(0, this.used - freeTrucks) : Math.abs(this.used - exactTrucks)
    // Each tenth of LDM left out weighs more than every truck together.
    const leftOut = this.outside < 0 ? 0 : this.load[this.outside] * (this.input.trucks.length + 1)
    return 0 - (leftOut + trucks)
  }

  /** Whether `shipment` fits on `truck` next to its current load (always outside the trucks). */
  fits(shipment: number, truck: number): boolean {
    if (truck === this.outside) return true
    const s = this.input.shipments[shipment]
    const t = this.input.trucks[truck]
    return this.load[truck] + s.ldmTenths <= t.capacityLdmTenths && this.weight[truck] + s.weightKg <= t.capacityKg
  }

  private refresh(truck: number): void {
    this.meters[truck] = truck === this.outside ? 0 : this.planners[truck].meters(this.members[truck])
  }
}

/**
 * Size of a shipment as the larger of its LDM and weight shares of the largest capacities
 * (by LDM alone when weight is not limited, as in the Java model).
 */
function sizeOf(input: SolverInput): (shipment: number) => number {
  const maxLdm = Math.max(...input.trucks.map((t) => t.capacityLdmTenths))
  const maxKg = Math.max(...input.trucks.map((t) => t.capacityKg))
  return (s) => Math.max(input.shipments[s].ldmTenths / maxLdm, input.shipments[s].weightKg / maxKg)
}

/** Largest shipments first, each on the truck where it costs least (opening a truck costs a medium point). */
function construct(input: SolverInput, planners: RoutePlanner[]): State {
  const state = new State(input, planners)
  // Among equally good empty trucks the larger one wins, so a mixed fleet fills big trucks first.
  const trucks = input.trucks.map((_, t) => t).sort((a, b) => input.trucks[b].capacityLdmTenths - input.trucks[a].capacityLdmTenths)
  // Left out only where every truck would be overloaded.
  if (state.outside >= 0) trucks.push(state.outside)
  const size = sizeOf(input)
  const order = input.shipments.map((_, s) => s).sort((a, b) => size(b) - size(a))
  for (const s of order) {
    let bestTruck = -1
    let bestDelta: Score | null = null
    for (const t of trucks) {
      const delta = state.withAdded(s, t)
      if (bestDelta === null || compareScores(delta, bestDelta) > 0) {
        bestDelta = delta
        bestTruck = t
      }
    }
    state.add(s, bestTruck)
  }
  return state
}

/** Applies a random move and returns how to undo it, or null if the move does not apply. */
function randomMove(state: State, random: SeededRandom): (() => void) | null {
  const choice = random.next()
  if (choice < 0.4) return changeMove(state, random)
  if (choice < 0.7) return swapMove(state, random)
  if (choice < 0.75) return swapTrucksMove(state, random)
  if (choice < 0.95) return ruinAndRecreateMove(state, random)
  return emptyTruckMove(state, random)
}

/**
 * Takes 2 to 5 random shipments off their trucks and puts them back one by one, in random
 * order, each where the score gains most. Reaches changes that need several single moves
 * in a row (e.g. swap two shipments, then move a third into the freed room).
 */
function ruinAndRecreateMove(state: State, random: SeededRandom): (() => void) | null {
  const n = state.truckOf.length
  if (n < 2) return null
  const count = Math.min(n, 2 + random.nextInt(4))
  const picked: number[] = []
  while (picked.length < count) {
    const s = random.nextInt(n)
    if (!picked.includes(s)) picked.push(s)
  }
  const from = picked.map((s) => state.remove(s))
  for (const s of picked) {
    let bestTruck = 0
    let bestDelta: Score | null = null
    for (let t = 0; t < state.members.length; t++) {
      const delta = state.withAdded(s, t)
      if (bestDelta === null || compareScores(delta, bestDelta) > 0) {
        bestDelta = delta
        bestTruck = t
      }
    }
    state.add(s, bestTruck)
  }
  return () => picked.forEach((s, i) => state.move(s, from[i]))
}

/** Swaps the whole loads of two trucks, e.g. onto an unused truck of another capacity. */
function swapTrucksMove(state: State, random: SeededRandom): (() => void) | null {
  const a = random.nextInt(state.members.length)
  const b = random.nextInt(state.members.length)
  if (a === b || (state.members[a].length === 0 && state.members[b].length === 0)) return null
  const swap = () => {
    const onA = [...state.members[a]]
    const onB = [...state.members[b]]
    for (const s of onA) state.move(s, b)
    for (const s of onB) state.move(s, a)
  }
  swap()
  return swap
}

function changeMove(state: State, random: SeededRandom): (() => void) | null {
  const s = random.nextInt(state.truckOf.length)
  const to = random.nextInt(state.members.length)
  const from = state.truckOf[s]
  if (to === from) return null
  state.move(s, to)
  return () => state.move(s, from)
}

function swapMove(state: State, random: SeededRandom): (() => void) | null {
  const a = random.nextInt(state.truckOf.length)
  const b = random.nextInt(state.truckOf.length)
  const ta = state.truckOf[a]
  const tb = state.truckOf[b]
  if (ta === tb) return null
  state.move(a, tb)
  state.move(b, ta)
  return () => {
    state.move(a, ta)
    state.move(b, tb)
  }
}

/**
 * Moves every shipment of one used truck onto the other used trucks (largest first, each
 * where it adds the fewest metres without going over LDM or weight). Applies only if all fit.
 */
function emptyTruckMove(state: State, random: SeededRandom): (() => void) | null {
  const used = state.members.flatMap((list, t) => (list.length > 0 && t !== state.outside ? [t] : []))
  if (used.length < 2) return null
  const emptied = used[random.nextInt(used.length)]
  const shipments = [...state.members[emptied]]
  const size = sizeOf(state.input)
  shipments.sort((a, b) => size(b) - size(a))
  const moved: number[] = []
  const undo = () => {
    for (const s of moved) state.move(s, emptied)
  }
  for (const s of shipments) {
    state.remove(s)
    let bestTruck = -1
    let bestSoft = -Infinity
    for (const t of used) {
      if (t === emptied || !state.fits(s, t)) continue
      const delta = state.withAdded(s, t)
      if (delta.soft > bestSoft) {
        bestSoft = delta.soft
        bestTruck = t
      }
    }
    if (bestTruck < 0) {
      state.add(s, emptied)
      undo()
      return null
    }
    state.add(s, bestTruck)
    moved.push(s)
  }
  return undo
}
