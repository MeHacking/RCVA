import { BookmarkCheck, Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/**
 * The name of a saved optimization, as smartLoad+'s NameDialog (owner, 22.11.2026). After
 * "Sačuvaj" it is already in Istorija and this offers another name; in Istorija it renames. The
 * usual name is selected, so typing replaces it and Enter keeps it. Escape, a click beside it or
 * "Zadrži naziv" keep the name as it is.
 *
 * onDone: the new name, or null to keep it.
 */
export function NameDialog({
  title,
  text,
  name,
  usualName,
  onDone,
}: {
  title: string
  text: string
  /** the name it has now */
  name: string
  /** the name by its result ("3 kamiona - 1001,5 km"), shown when the field is emptied */
  usualName: string
  onDone: (name: string | null) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(name)

  useEffect(() => {
    const element = dialog.current
    if (!element || element.open) return
    element.showModal()
    input.current?.select()
  }, [])

  const finish = (keep: boolean) => {
    const next = value.trim()
    onDone(keep || next === name.trim() ? null : next)
  }

  return (
    <dialog
      ref={dialog}
      className="dialog dialog--narrow"
      aria-labelledby="name-dialog-title"
      onCancel={(event) => {
        event.preventDefault()
        finish(true)
      }}
      onClick={(event) => {
        if (event.target === dialog.current) finish(true)
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          finish(false)
        }}
      >
        <div className="dialog__header">
          <h2 id="name-dialog-title">
            <BookmarkCheck aria-hidden="true" size={20} /> {title}
          </h2>
        </div>
        <p className="dialog__note">{text}</p>
        <div className="field">
          <label htmlFor="name-dialog-input">Ime</label>
          <input
            id="name-dialog-input"
            ref={input}
            value={value}
            placeholder={usualName}
            onChange={(event) => setValue(event.target.value)}
          />
          <span className="field__hint">Prazno: „{usualName}“.</span>
        </div>
        <div className="dialog__actions">
          <button type="button" onClick={() => finish(true)}>
            Zadrži naziv
          </button>
          <button type="submit" className="button--primary">
            <Check aria-hidden="true" size={16} />
            Sačuvaj ime
          </button>
        </div>
      </form>
    </dialog>
  )
}
