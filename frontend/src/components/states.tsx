import type { ReactNode } from 'react'

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state state--empty">
      <p className="state__title">{title}</p>
      {children && <div className="state__hint">{children}</div>}
    </div>
  )
}

export function LoadingState({ label = 'Učitavanje…' }: { label?: string }) {
  return (
    <div className="state state--loading" role="status" aria-live="polite">
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
      <p className="state__title">{title}</p>
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Pokušaj ponovo
        </button>
      )}
    </div>
  )
}
