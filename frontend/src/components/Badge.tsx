import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export function Badge({ tone = 'neutral', pulse = false, children }: { tone?: BadgeTone; pulse?: boolean; children: ReactNode }) {
  const classes = ['badge', `badge--${tone}`, pulse && 'badge--pulse'].filter(Boolean).join(' ')
  return (
    <span className={classes}>
      <span className="badge__dot" aria-hidden="true" />
      {children}
    </span>
  )
}
