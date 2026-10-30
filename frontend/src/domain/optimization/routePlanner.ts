// Port of backend/.../optimization/routing/RoutePlanner.java. With baseRules (the Spec v2
// assumptions) both must give the same lengths for the same input, since the Java solver
// is the test oracle for this one; the other rules exist only here.

/**
 * Orders the stops of one truck: all pickups, then all deliveries ("two phases per
 * route"), with start, end and loading order given by RouteRules. The solver only decides
 * which shipments go on which truck; this gives the shortest order for that set:
 * - up to EXACT_LIMIT shipments exactly (Held-Karp dynamic programming; see exact and
 *   exactLifo);
 * - above that with nearest neighbour plus 2-opt (not guaranteed optimal).
 *
 * Shipments and locations are indices into the arrays and the distance matrix given to the
 * constructor. Results are cached per set of shipments.
 */
export const EXACT_LIMIT = 9

const CACHE_LIMIT = 200_000

/** `pickups` and `deliveries` are shipment indices in visiting order. */
export interface Route {
  pickups: number[]
  deliveries: number[]
  meters: number
}

export interface RouteRules {
  /** location every route starts from; null: a route starts at its first pickup (open route) */
  start: number | null
  /** location every route ends at; null: a route ends at its last delivery */
  end: number | null
  /**
   * Loaded from the rear only (D2): what is unloaded first must be loaded last, so a
   * shipment picked up at an earlier stop is never delivered at an earlier stop.
   * Shipments picked up (or delivered) at the same stop may be arranged freely.
   */
  lifo: boolean
}

/** Spec v2 assumptions, as in the Java RoutePlanner: from the base, back to it if asked. */
export function baseRules(base: number, returnToBase: boolean): RouteRules {
  return { start: base, end: returnToBase ? base : null, lifo: false }
}

/**
 * Process owner's answers of 29.10.2026: a route starts at its first warehouse and ends
 * at its last delivery (A2), and the truck is loaded from the rear (D2).
 */
export const OPEN_ROUTE_REAR_LOADING: RouteRules = { start: null, end: null, lifo: true }

export interface RoutePlannerInput extends RouteRules {
  /** metres between location indices */
  distance: number[][]
  /** location index of each shipment's pickup */
  pickupLocation: number[]
  /** location index of each shipment's delivery */
  deliveryLocation: number[]
}

export class RoutePlanner {
  private readonly distance: number[][]
  private readonly start: number | null
  private readonly end: number | null
  private readonly lifo: boolean
  private readonly pickupLocation: number[]
  private readonly deliveryLocation: number[]
  private readonly exactLimit: number
  private readonly metersCache = new Map<string, number>()

  /** `exactLimit`: tests compare the heuristic with the exact order on the same data. */
  constructor(input: RoutePlannerInput, exactLimit = EXACT_LIMIT) {
    this.distance = input.distance
    this.start = input.start
    this.end = input.end
    this.lifo = input.lifo
    this.pickupLocation = [...input.pickupLocation]
    this.deliveryLocation = [...input.deliveryLocation]
    this.exactLimit = exactLimit
  }

  /** Length of the best route found for these shipments (order of the argument does not matter). */
  meters(shipments: readonly number[]): number {
    const sorted = sortedCopy(shipments)
    const key = sorted.join(',')
    const cached = this.metersCache.get(key)
    if (cached !== undefined) return cached
    if (this.metersCache.size >= CACHE_LIMIT) this.metersCache.clear()
    const meters = this.planSorted(sorted).meters
    this.metersCache.set(key, meters)
    return meters
  }

  plan(shipments: readonly number[]): Route {
    return this.planSorted(sortedCopy(shipments))
  }

  /**
   * Length of a route with this order (used by tests and the heuristic). It does not check
   * the loading order; with lifo that is up to the caller.
   */
  length(pickups: readonly number[], deliveries: readonly number[]): number {
    if (pickups.length === 0) return 0
    let at = this.pickupLocation[pickups[0]]
    let meters = this.startCost(at)
    for (const s of pickups) {
      meters += this.distance[at][this.pickupLocation[s]]
      at = this.pickupLocation[s]
    }
    for (const s of deliveries) {
      meters += this.distance[at][this.deliveryLocation[s]]
      at = this.deliveryLocation[s]
    }
    return meters + this.endCost(at)
  }

  private planSorted(sorted: number[]): Route {
    if (sorted.length === 0) return { pickups: [], deliveries: [], meters: 0 }
    if (this.lifo) return sorted.length <= this.exactLimit ? this.exactLifo(sorted) : this.heuristicLifo(sorted)
    return sorted.length <= this.exactLimit ? this.exact(sorted) : this.heuristic(sorted)
  }

  private startCost(location: number): number {
    return this.start === null ? 0 : this.distance[this.start][location]
  }

  private endCost(location: number): number {
    return this.end === null ? 0 : this.distance[location][this.end]
  }

  private exact(shipments: number[]): Route {
    const n = shipments.length
    const full = (1 << n) - 1
    const p = shipments.map((s) => this.pickupLocation[s])
    const d = shipments.map((s) => this.deliveryLocation[s])
    const dist = this.distance

    // toPickup[mask][i]: from the start through the pickups in mask, ending at pickup i
    const toPickup = table(1 << n, n)
    for (let i = 0; i < n; i++) toPickup[1 << i][i] = this.startCost(p[i])
    for (let mask = 1; mask <= full; mask++) {
      for (let i = 0; i < n; i++) {
        const cost = toPickup[mask][i]
        if (cost === Infinity || (mask & (1 << i)) === 0) continue
        for (let j = 0; j < n; j++) {
          if ((mask & (1 << j)) === 0) {
            const next = mask | (1 << j)
            toPickup[next][j] = Math.min(toPickup[next][j], cost + dist[p[i]][p[j]])
          }
        }
      }
    }

    // fromDelivery[mask][i]: from delivery i through the deliveries in mask to the end
    const fromDelivery = table(1 << n, n)
    for (let i = 0; i < n; i++) fromDelivery[1 << i][i] = this.endCost(d[i])
    for (let mask = 1; mask <= full; mask++) {
      for (let i = 0; i < n; i++) {
        if ((mask & (1 << i)) === 0 || bitCount(mask) === 1) continue
        const rest = mask & ~(1 << i)
        let best = Infinity
        for (let j = 0; j < n; j++) {
          if ((rest & (1 << j)) !== 0) best = Math.min(best, dist[d[i]][d[j]] + fromDelivery[rest][j])
        }
        fromDelivery[mask][i] = best
      }
    }

    let best = Infinity
    let lastPickup = -1
    let firstDelivery = -1
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const cost = toPickup[full][i] + dist[p[i]][d[j]] + fromDelivery[full][j]
        if (cost < best) {
          best = cost
          lastPickup = i
          firstDelivery = j
        }
      }
    }

    // Walk the tables back to recover the order.
    const pickups = new Array<number>(n)
    let mask = full
    let current = lastPickup
    for (let position = n - 1; position >= 0; position--) {
      pickups[position] = shipments[current]
      const rest = mask & ~(1 << current)
      if (rest === 0) break
      for (let j = 0; j < n; j++) {
        if ((rest & (1 << j)) !== 0 && toPickup[rest][j] + dist[p[j]][p[current]] === toPickup[mask][current]) {
          mask = rest
          current = j
          break
        }
      }
    }
    const deliveries = new Array<number>(n)
    mask = full
    current = firstDelivery
    for (let position = 0; position < n; position++) {
      deliveries[position] = shipments[current]
      const rest = mask & ~(1 << current)
      if (rest === 0) break
      for (let j = 0; j < n; j++) {
        if ((rest & (1 << j)) !== 0 && dist[d[current]][d[j]] + fromDelivery[rest][j] === fromDelivery[mask][current]) {
          mask = rest
          current = j
          break
        }
      }
    }
    return { pickups, deliveries, meters: best }
  }

  /**
   * With lifo there is always a shortest route whose deliveries are the pickups reversed:
   * order the load from the front by pickup stop, and within a stop by the last delivery
   * first; then the deliveries are that order reversed, with the same stops as before.
   * So it is enough to find one order of the shipments. Held-Karp from the inside out:
   * inner[mask][i] is the shortest path from pickup i through the pickups and deliveries
   * of mask to delivery i, where i is picked up first and delivered last.
   */
  private exactLifo(shipments: number[]): Route {
    const n = shipments.length
    const full = (1 << n) - 1
    const p = shipments.map((s) => this.pickupLocation[s])
    const d = shipments.map((s) => this.deliveryLocation[s])
    const dist = this.distance

    const inner = table(1 << n, n)
    for (let i = 0; i < n; i++) inner[1 << i][i] = dist[p[i]][d[i]]
    for (let mask = 1; mask < full; mask++) {
      for (let i = 0; i < n; i++) {
        const cost = inner[mask][i]
        if (cost === Infinity) continue
        for (let j = 0; j < n; j++) {
          if ((mask & (1 << j)) === 0) {
            const next = mask | (1 << j)
            inner[next][j] = Math.min(inner[next][j], dist[p[j]][p[i]] + cost + dist[d[i]][d[j]])
          }
        }
      }
    }

    let best = Infinity
    let outer = -1
    for (let i = 0; i < n; i++) {
      const cost = this.startCost(p[i]) + inner[full][i] + this.endCost(d[i])
      if (cost < best) {
        best = cost
        outer = i
      }
    }

    // Walk the table back from the outermost shipment inwards.
    const pickups: number[] = []
    let mask = full
    let current = outer
    for (;;) {
      pickups.push(shipments[current])
      const rest = mask & ~(1 << current)
      if (rest === 0) break
      for (let j = 0; j < n; j++) {
        if ((rest & (1 << j)) !== 0 && dist[p[current]][p[j]] + inner[rest][j] + dist[d[j]][d[current]] === inner[mask][current]) {
          mask = rest
          current = j
          break
        }
      }
    }
    return { pickups, deliveries: [...pickups].reverse(), meters: best }
  }

  /** Nearest neighbour over the pickups, deliveries in reverse, then 2-opt on that one order. */
  private heuristicLifo(shipments: number[]): Route {
    const order = this.nearestNeighbour(shipments, this.start, this.pickupLocation)
    const lengthOf = () => this.length(order, [...order].reverse())
    let best = lengthOf()
    let improved = true
    while (improved) {
      improved = false
      for (let i = 0; i < order.length - 1; i++) {
        for (let j = i + 1; j < order.length; j++) {
          reverse(order, i, j)
          const candidate = lengthOf()
          if (candidate < best) {
            best = candidate
            improved = true
          } else {
            reverse(order, i, j)
          }
        }
      }
    }
    return { pickups: order, deliveries: [...order].reverse(), meters: best }
  }

  private heuristic(shipments: number[]): Route {
    const pickups = this.nearestNeighbour(shipments, this.start, this.pickupLocation)
    const deliveries = this.nearestNeighbour(
      shipments,
      this.pickupLocation[pickups[pickups.length - 1]],
      this.deliveryLocation,
    )
    let best = this.length(pickups, deliveries)
    let improved = true
    while (improved) {
      improved = false
      for (const segment of [pickups, deliveries]) {
        for (let i = 0; i < segment.length - 1; i++) {
          for (let j = i + 1; j < segment.length; j++) {
            reverse(segment, i, j)
            const candidate = this.length(pickups, deliveries)
            if (candidate < best) {
              best = candidate
              improved = true
            } else {
              reverse(segment, i, j)
            }
          }
        }
      }
    }
    return { pickups, deliveries, meters: best }
  }

  /** With no start (open route) the first shipment of the list goes first. */
  private nearestNeighbour(shipments: number[], start: number | null, location: number[]): number[] {
    const left = [...shipments]
    const order: number[] = []
    if (start === null) order.push(...left.splice(0, 1))
    let at = start ?? location[order[0]]
    while (left.length > 0) {
      // The first of equally near ones, as Java's Stream.min over the same list.
      let nearest = 0
      for (let k = 1; k < left.length; k++) {
        if (this.distance[at][location[left[k]]] < this.distance[at][location[left[nearest]]]) nearest = k
      }
      const [next] = left.splice(nearest, 1)
      order.push(next)
      at = location[next]
    }
    return order
  }
}

function sortedCopy(shipments: readonly number[]): number[] {
  return [...shipments].sort((a, b) => a - b)
}

function table(rows: number, columns: number): number[][] {
  return Array.from({ length: rows }, () => new Array<number>(columns).fill(Infinity))
}

function bitCount(mask: number): number {
  let count = 0
  for (let m = mask; m !== 0; m &= m - 1) count++
  return count
}

function reverse(array: number[], from: number, to: number): void {
  for (let i = from, j = to; i < j; i++, j--) {
    const tmp = array[i]
    array[i] = array[j]
    array[j] = tmp
  }
}
