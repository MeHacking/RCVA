import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger'

const ICONS: Record<NoticeTone, IconName> = {
  info: 'info',
  success: 'check',
  warning: 'alert',
  danger: 'alert',
}

/** Highlighted message block with a title, e.g. validator outcome or infeasibility. */
export function Notice({
  tone,
  title,
  role,
  children,
}: {
  tone: NoticeTone
  title: string
  role?: 'alert' | 'status'
  children?: ReactNode
}) {
  return (
    <div className={`notice notice--${tone}`} role={role}>
      <span className="notice__icon">
        <Icon name={ICONS[tone]} size={18} />
      </span>
      <div className="notice__body">
        <p className="notice__title">{title}</p>
        {children}
      </div>
    </div>
  )
}
