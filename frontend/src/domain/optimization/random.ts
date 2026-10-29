/** Seeded pseudo-random numbers (mulberry32), so solver runs and tests can be repeated. */
export class SeededRandom {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Whole number in [0, bound). */
  nextInt(bound: number): number {
    return Math.floor(this.next() * bound)
  }
}
