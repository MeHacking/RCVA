import type { ReactNode } from 'react'
import { Icon } from './Icon'

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state state--empty">
      <span className="state__icon">
        <Icon name="info" size={18} />
      </span>
      <div className="state__body">
        <p className="state__title">{title}</p>
        {children && <div className="state__hint">{children}</div>}
      </div>
    </div>
  )
}

export function LoadingState({ label = 'Učitavanje…' }: { label?: string }) {
  return (
    <div className="state state--loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  )
}

export function ErrorState({
  title = 'Greška',
  message,
  onRetry,
}: {
  title?: string
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="state state--error" role="alert">
      <span className="state__icon">
        <Icon name="alert" size={18} />
      </span>
      <div className="state__body">
        <p className="state__title">{title}</p>
        <p>{message}</p>
        {onRetry && (
          <button type="button" onClick={onRetry}>
            Pokušaj ponovo
          </button>
        )}
      </div>
    </div>
  )
}
