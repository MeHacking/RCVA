/**
 * Soft layered waves behind the whole page (decoration only), like sheets of paper cut along a
 * wave: the lightest sheet on top, each darker one below it, every edge casting a soft shadow
 * on the sheet underneath. The colours are tokens (--wave-1 lightest ... --wave-4 darkest).
 */

/**
 * Each sheet covers everything above its edge (in a 1440 × 900 picture), top sheet first. The
 * edges differ in height, swing and length, so they never run parallel, but they never cross.
 */
const SHEETS = [
  'M-40,-40 H1480 V230 C1200,180 1000,380 700,330 S200,200 -40,300 Z',
  'M-40,-40 H1480 V600 C1250,640 1050,420 760,470 S260,640 -40,520 Z',
  'M-40,-40 H1480 V700 C1300,820 1100,860 860,760 S420,640 180,720 S-20,800 -40,790 Z',
]

export function BackgroundWaves() {
  return (
    <svg className="background-waves" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect className="background-waves__sheet--4" x="-40" y="-40" width="1520" height="980" />
      {/* The lower sheets first, so each lighter one lies on top and shades the next. */}
      {SHEETS.map((d, i) => ({ d, n: i + 1 }))
        .reverse()
        .map(({ d, n }) => (
          <path key={n} className={`background-waves__sheet background-waves__sheet--${n}`} d={d} />
        ))}
    </svg>
  )
}
