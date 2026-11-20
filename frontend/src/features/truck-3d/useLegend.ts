import { useState } from 'react'

// Whether the editor's "Legenda" is open: open the first time, then as it was left on this device
// (only a convenience, so a closed browser storage changes nothing).

const KEY = 'rcva.legend.open'

function readOpen(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'false'
  } catch {
    return true
  }
}

export function useLegend(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(readOpen)
  return [
    open,
    (value: boolean) => {
      setOpen(value)
      try {
        localStorage.setItem(KEY, String(value))
      } catch {
        // only a convenience
      }
    },
  ]
}
