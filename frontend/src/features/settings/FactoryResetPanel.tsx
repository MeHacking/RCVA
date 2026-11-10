import { useApi } from '../../api/apiContext'
import { AdminActionPanel } from './AdminActionPanel'

/** The factory reset: everything on the device goes, as on the first start. */
export function FactoryResetPanel() {
  const api = useApi()
  return (
    <AdminActionPanel
      n={6}
      title="Brisanje svih podataka"
      about={
        <>
          <p className="text--muted">
            Briše sve na ovom uređaju: pošiljke, kamione i tipove, rezultate, zapamćene koordinate i kilometraže,
            podešavanja i ključ za OpenRouteService. Aplikacija je posle toga kao pri prvom pokretanju.
          </p>
          <p className="text--muted">
            Ovo se ne može poništiti. Ako vam podaci trebaju, prvo ih izvezite (iznad, „Izvezi podatke“).
          </p>
        </>
      }
      action="Obriši sve podatke"
      act={async () => {
        await api.resetDevice()
        return 'Svi podaci na uređaju su obrisani; aplikacija je kao pri prvom pokretanju.'
      }}
    />
  )
}
