// Port of backend/.../optimization/routing/RoutePlanner.java; both must give the same
// lengths for the same input (the Java solver is the test oracle for this one).

/**
 * Orders the stops of one truck under the "two phases per route" assumption: start at the
 * base, all pickups, then all deliveries, then back to the base if `returnToBase`. The
 * solver only decides which shipments go on which truck; this gives the shortest order
 * for that set:
 * - up to EXACT_LIMIT shipments exactly (Held-Karp dynamic programming over the pickups
 *   from the base and over the deliveries back to the base);
 * - above that with nearest neighbour plus 2-opt inside each phase (not guaranteed optimal).
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

export interface RoutePlannerInput {
  /** metres between location indices */
  distance: number[][]
  base: number
  returnToBase: boolean
  /** location index of each shipment's pickup */
  pickupLocation: number[]
  /** location index of each shipment's delivery */
  deliveryLocation: number[]
}

export class RoutePlanner {
  private readonly distance: number[][]
  private readonly base: number
  private readonly returnToBase: boolean
  private readonly pickupLocation: number[]
  private readonly deliveryLocation: number[]
  private readonly exactLimit: number
  private readonly metersCache = new Map<string, number>()

  /** `exactLimit`: tests compare the heuristic with the exact order on the same data. */
  constructor(input: RoutePlannerInput, exactLimit = EXACT_LIMIT) {
    this.distance = input.distance
    this.base = input.base
    this.returnToBase = input.returnToBase
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

  /** Length of a route with this order, by the same rules (used by tests and the heuristic). */
  length(pickups: readonly number[], deliveries: readonly number[]): number {
    let meters = 0
    let at = this.base
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
    return sorted.length <= this.exactLimit ? this.exact(sorted) : this.heuristic(sorted)
  }

  private endCost(location: number): number {
    return this.returnToBase ? this.distance[location][this.base] : 0
  }

  private exact(shipments: number[]): Route {
    const n = shipments.length
    const full = (1 << n) - 1
    const p = shipments.map((s) => this.pickupLocation[s])
    const d = shipments.map((s) => this.deliveryLocation[s])
    const dist = this.distance

    // toPickup[mask][i]: from the base through the pickups in mask, ending at pickup i
    const toPickup = table(1 << n, n)
    for (let i = 0; i < n; i++) toPickup[1 << i][i] = dist[this.base][p[i]]
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

  private heuristic(shipments: number[]): Route {
    const pickups = this.nearestNeighbour(shipments, this.base, this.pickupLocation)
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

  private nearestNeighbour(shipments: number[], start: number, location: number[]): number[] {
    const left = [...shipments]
    const order: number[] = []
    let at = start
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
