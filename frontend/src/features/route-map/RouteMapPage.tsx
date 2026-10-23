import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/states'

export function RouteMapPage() {
  return (
    <section>
      <PageHeader title="Mapa ruta" />
      <EmptyState title="Ekran je u pripremi">
        U ovoj fazi ovde dolazi spisak ruta i stanica iz poslednje optimizacije; mapa dolazi kasnije.
      </EmptyState>
    </section>
  )
}
