import { useApi } from '../../api/apiContext'
import { MapPinOff } from 'lucide-react'
import { AdminActionPanel } from './AdminActionPanel'
import type { PartRef } from './SettingsPart'

/** Forgets where every place is, for places found wrong; the shipments and trucks stay. */
export function ForgetPlacesPanel({ partRef }: { partRef: PartRef }) {
  const api = useApi()
  return (
    <AdminActionPanel
      id="lokacije"
      icon={MapPinOff}
      partRef={partRef}
      title="Zaboravljanje svih lokacija"
      about={
        <>
          <p className="text--muted">
            Aplikacija zaboravlja koordinate svih mesta, pomeranja do puteva za kamione, lokacije kamiona i zapamćene
            odgovore pretrage. Pošiljke i kamioni ostaju, a pošiljke dobijaju status „Nejasna lokacija“.
          </p>
          <p className="text--muted">
            Mesta se ponovo traže pri sledećem uvozu Excel-a ili čuvanju pošiljke, a lokaciju svakog kamiona treba ponovo
            uneti. Ovo se ne može poništiti; ako vam podaci trebaju, prvo ih izvezite (iznad, „Izvezi podatke“).
          </p>
        </>
      }
      action="Zaboravi sve lokacije"
      act={async () => {
        const { places } = await api.forgetAllPlaces()
        return `Zaboravljene su sve lokacije (mesta: ${places}). Pošiljke i kamioni su ostali.`
      }}
    />
  )
}
