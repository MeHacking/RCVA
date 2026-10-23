import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/states'

export function OptimizationPage() {
  return (
    <section>
      <PageHeader title="Rezultati optimizacije" />
      <EmptyState title="Ekran je u pripremi">
        Ovde će biti pokretanje sa vremenskim ograničenjem, praćenje statusa, rezime (kamioni, km, skor),
        rezultat validatora, tabela po kamionu i nedodeljene pošiljke. Status poslednjeg posla već se
        vidi u gornjoj traci.
      </EmptyState>
    </section>
  )
}
