import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/states'

export function DashboardPage() {
  return (
    <section>
      <PageHeader title="Pregled" />
      <EmptyState title="Ekran je u pripremi">
        Ovde će biti kartice (broj pošiljki, ukupno LDM, broj kamiona, pošiljke sa greškom), rezime
        poslednje optimizacije, upozorenja i brze akcije. Za sada: kamione uredite na ekranu „Kamioni“,
        a optimizaciju pokrenite dugmetom u gornjoj traci.
      </EmptyState>
    </section>
  )
}
