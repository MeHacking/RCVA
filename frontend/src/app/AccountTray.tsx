import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import type { JobNotice } from './jobNotices'

/*
 * The right end of the top bar, in a small bar of its own, as in smartLoad+ (owner, 20.11.2026):
 * notifications (the bell) and the user. Sign-in is not part of RCVA yet, so the user popup only
 * says so and leads to the settings.
 *
 * Motion as in smartLoad+ (skill charles-ux-animation): the bell rings only when a notification
 * arrives, then the number lands on it; a press gives a little; the popups grow from their button
 * and stay mounted (inert) while closed, so they can leave with a fade. All off with reduced
 * motion (layout.css).
 */

type Open = 'bell' | 'user' | null

const time = new Intl.DateTimeFormat('sr-Latn-RS', { hour: '2-digit', minute: '2-digit' })

export function AccountTray({
  notices,
  openNotice,
  openSettings,
}: {
  notices: JobNotice[]
  openNotice: (notice: JobNotice) => void
  /** null where there are no settings (mock and server) */
  openSettings: (() => void) | null
}) {
  const [open, setOpen] = useState<Open>(null)
  const tray = useRef<HTMLDivElement>(null)
  // The bell rings (and the number lands) when the number of notifications grows, not on load.
  const [ring, setRing] = useState(0)
  const [count, setCount] = useState(notices.length)
  if (notices.length !== count) {
    if (notices.length > count) setRing(ring + 1)
    setCount(notices.length)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (tray.current && !tray.current.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (which: Exclude<Open, null>) => setOpen((o) => (o === which ? null : which))

  return (
    <div className="tray" ref={tray}>
      <button
        type="button"
        className="tray__button"
        aria-label={notices.length ? `Obaveštenja (${notices.length} novo)` : 'Obaveštenja'}
        title="Obaveštenja"
        aria-haspopup="dialog"
        aria-expanded={open === 'bell'}
        onClick={() => toggle('bell')}
      >
        <span key={ring} className={`tray__icon tray__icon--bell${ring ? ' is-ringing' : ''}`}>
          <Icon name="bell" size={20} />
        </span>
        {notices.length > 0 && (
          <span key={`b${ring}`} className={`tray__badge${ring ? ' is-landing' : ''}`} aria-hidden="true">
            {notices.length}
          </span>
        )}
      </button>
      <button
        type="button"
        className="tray__button tray__button--user"
        aria-label="Korisnik"
        title="Korisnik"
        aria-haspopup="dialog"
        aria-expanded={open === 'user'}
        onClick={() => toggle('user')}
      >
        <span className="tray__icon tray__icon--user">
          <Icon name="user" size={24} />
        </span>
      </button>

      <div className="popover" role="dialog" aria-label="Obaveštenja" data-open={open === 'bell' || undefined} inert={open !== 'bell'}>
        <h2 className="popover__title">Obaveštenja</h2>
        {notices.length === 0 ? (
          <div className="popover__empty">
            <Icon name="bell-off" size={28} />
            <p>Nema novih obaveštenja.</p>
            <small>Ovde stiže kraj optimizacije dok ste na drugom ekranu.</small>
          </div>
        ) : (
          <ul className="notices">
            {notices.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={`notice-item notice-item--${n.kind}`}
                  onClick={() => {
                    setOpen(null)
                    openNotice(n)
                  }}
                >
                  <Icon name={n.kind === 'done' ? 'check' : 'alert'} size={20} />
                  <span>
                    <strong>{n.title}</strong>
                    <small>{n.detail}</small>
                  </span>
                  <time dateTime={n.at}>{time.format(new Date(n.at))}</time>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="popover" role="dialog" aria-label="Korisnik" data-open={open === 'user' || undefined} inert={open !== 'user'}>
        <div className="popover__user">
          <span className="popover__avatar" aria-hidden="true">
            <Icon name="user" size={26} />
          </span>
          <span>
            <strong>Niste prijavljeni</strong>
            <small>Prijava i upravljanje pristupom stižu u jednoj od sledećih verzija.</small>
          </span>
        </div>
        {openSettings && (
          <button
            type="button"
            className="popover__action"
            onClick={() => {
              setOpen(null)
              openSettings()
            }}
          >
            <Icon name="settings" size={18} />
            Podešavanja
          </button>
        )}
      </div>
    </div>
  )
}
