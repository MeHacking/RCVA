import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/states'

export function Truck3dPage() {
  return (
    <section>
      <PageHeader title="3D prikaz kamiona" />
      <EmptyState title="Ekran je u pripremi">
        Ovde će biti izbor kamiona, 3D prikaz tovarnog prostora i spisak pošiljki. Prikaz zahteva
        završenu optimizaciju; integracija TeGo vizuelizatora je posebna faza.
      </EmptyState>
    </section>
  )
}
