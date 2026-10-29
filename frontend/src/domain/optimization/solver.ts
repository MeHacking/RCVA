import { RoutePlanner, type Route } from './routePlanner'
import { SeededRandom } from './random'

// Replaces the Timefold model in backend/.../optimization/solver/: the solver decides only
// which truck carries which shipment; RoutePlanner gives the order of stops for that set.
// Same score as RoutingConstraints.java, compared level by level:
//   hard   = minus LDM tenths over a truck's capacity
//   medium = minus the number of trucks with at least one shipment
//   soft   = minus the metres of all routes
// Search: a construction heuristic (largest shipments first, each where it costs least),
// then simulated annealing (see solve) with five moves: move a shipment to another truck,
// swap two shipments between trucks, swap the loads of two trucks (to reach a truck of
// another capacity), ruin and recreate (take a few shipments off and put them back where
// they fit best), and empty a truck into the others (the move that lowers the number of
// trucks, which single moves rarely reach).

export interface SolverShipment {
  ldmTenths: number
  /** location index into `distance` */
  pickup: number
  delivery: number
}

export interface SolverTruck {
  id: number
  capacityLdmTenths: number
}

export interface SolverInput {
  /** metres between location indices */
  distance: number[][]
  base: number
  returnToBase: boolean
  shipments: SolverShipment[]
  trucks: SolverTruck[]
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
  /** truck index (into input.trucks) of each shipment */
  truckOfShipment: number[]
  /** used trucks in input order */
  routes: SolvedRoute[]
  steps: number
}

export function compareScores(a: Score, b: Score): number {
  return a.hard - b.hard || a.medium - b.medium || a.soft - b.soft
}

export function isFeasible(score: Score): boolean {
  return score.hard === 0
}

/** Score of a given assignment (truck index per shipment), without solving. */
export function scoreOf(input: SolverInput, truckOfShipment: number[], planner = plannerFor(input)): Score {
  const state = new State(input, planner)
  truckOfShipment.forEach((t, s) => state.add(s, t))
  return state.score()
}

export function plannerFor(input: SolverInput): RoutePlanner {
  return new RoutePlanner({
    distance: input.distance,
    base: input.base,
    returnToBase: input.returnToBase,
    pickupLocation: input.shipments.map((s) => s.pickup),
    deliveryLocation: input.shipments.map((s) => s.delivery),
  })
}

export function solve(input: SolverInput, options: SolverOptions = {}): SolverResult {
  if (options.stepLimit === undefined && options.timeLimitMs === undefined) {
    throw new Error('solve needs a stepLimit or a timeLimitMs')
  }
  if (input.trucks.length === 0 && input.shipments.length > 0) throw new Error('no trucks')
  const planner = plannerFor(input)
  const random = new SeededRandom(options.seed ?? 1)
  const state = construct(input, planner)

  let current = state.score()
  let best = current
  let bestAssignment = [...state.truckOf]
  const started = Date.now()
  const timeLimit = options.timeLimitMs ?? Infinity
  const stepLimit = options.stepLimit ?? Infinity
  // Simulated annealing on the soft level only: a move that makes hard or medium worse is
  // never taken; a longer route is taken with probability exp(-extra / temperature). The
  // temperature starts at a few percent of an average route and falls with progress.
  const startTemperature = (0.05 * -current.soft) / Math.max(1, -current.medium)
  const endTemperature = startTemperature / 1000
  let progress = 0
  let steps = 0

  while (progress < 1 && input.shipments.length > 0 && input.trucks.length > 1) {
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
    if (shipments.length > 0) routes.push({ truckId: truck.id, shipments, route: planner.plan(shipments) })
  })
  return { score: best, truckOfShipment: bestAssignment, routes, steps }
}

function accepts(candidate: Score, current: Score, temperature: number, random: SeededRandom): boolean {
  if (compareScores(candidate, current) >= 0) return true
  if (candidate.hard !== current.hard || candidate.medium !== current.medium || temperature <= 0) return false
  return random.next() < Math.exp((candidate.soft - current.soft) / temperature)
}

/** Current assignment with per-truck load and route length kept up to date. */
class State {
  readonly truckOf: number[]
  readonly members: number[][]
  readonly load: number[]
  readonly input: SolverInput
  private readonly meters: number[]
  private readonly planner: RoutePlanner

  constructor(input: SolverInput, planner: RoutePlanner) {
    this.input = input
    this.planner = planner
    this.truckOf = new Array<number>(input.shipments.length).fill(-1)
    this.members = input.trucks.map(() => [])
    this.load = input.trucks.map(() => 0)
    this.meters = input.trucks.map(() => 0)
  }

  add(shipment: number, truck: number): void {
    this.truckOf[shipment] = truck
    this.members[truck].push(shipment)
    this.load[truck] += this.input.shipments[shipment].ldmTenths
    this.refresh(truck)
  }

  remove(shipment: number): number {
    const truck = this.truckOf[shipment]
    const list = this.members[truck]
    list.splice(list.indexOf(shipment), 1)
    this.load[truck] -= this.input.shipments[shipment].ldmTenths
    this.truckOf[shipment] = -1
    this.refresh(truck)
    return truck
  }

  move(shipment: number, truck: number): void {
    this.remove(shipment)
    this.add(shipment, truck)
  }

  /** Score contribution of one truck. */
  truckScore(truck: number): Score {
    const over = this.load[truck] - this.input.trucks[truck].capacityLdmTenths
    return {
      hard: over > 0 ? -over : 0,
      medium: this.members[truck].length > 0 ? -1 : 0,
      soft: -this.meters[truck],
    }
  }

  score(): Score {
    const total = { hard: 0, medium: 0, soft: 0 }
    for (let t = 0; t < this.members.length; t++) {
      const part = this.truckScore(t)
      total.hard += part.hard
      total.medium += part.medium
      total.soft += part.soft
    }
    return total
  }

  /** Change of the score if an unassigned `shipment` were added to `truck` (no change made). */
  withAdded(shipment: number, truck: number): Score {
    const before = this.truckScore(truck)
    this.add(shipment, truck)
    const after = this.truckScore(truck)
    this.remove(shipment)
    return { hard: after.hard - before.hard, medium: after.medium - before.medium, soft: after.soft - before.soft }
  }

  private refresh(truck: number): void {
    this.meters[truck] = this.planner.meters(this.members[truck])
  }
}

/** Largest shipments first, each on the truck where it costs least (opening a truck costs a medium point). */
function construct(input: SolverInput, planner: RoutePlanner): State {
  const state = new State(input, planner)
  // Among equally good empty trucks the larger one wins, so a mixed fleet fills big trucks first.
  const trucks = input.trucks.map((_, t) => t).sort((a, b) => input.trucks[b].capacityLdmTenths - input.trucks[a].capacityLdmTenths)
  const order = input.shipments.map((_, s) => s).sort((a, b) => input.shipments[b].ldmTenths - input.shipments[a].ldmTenths)
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
 * where it adds the fewest metres without going over capacity). Applies only if all fit.
 */
function emptyTruckMove(state: State, random: SeededRandom): (() => void) | null {
  const used = state.members.flatMap((list, t) => (list.length > 0 ? [t] : []))
  if (used.length < 2) return null
  const emptied = used[random.nextInt(used.length)]
  const shipments = [...state.members[emptied]]
  const input = state.input
  shipments.sort((a, b) => input.shipments[b].ldmTenths - input.shipments[a].ldmTenths)
  const moved: number[] = []
  const undo = () => {
    for (const s of moved) state.move(s, emptied)
  }
  for (const s of shipments) {
    state.remove(s)
    let bestTruck = -1
    let bestSoft = -Infinity
    for (const t of used) {
      if (t === emptied || state.load[t] + input.shipments[s].ldmTenths > input.trucks[t].capacityLdmTenths) continue
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
