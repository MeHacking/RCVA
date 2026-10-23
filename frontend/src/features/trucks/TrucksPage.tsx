import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/states'

export function TrucksPage() {
  return (
    <section>
      <PageHeader title="Kamioni" />
      <EmptyState title="Ekran je u pripremi">Ovde će biti tabela kamiona i forma za izmenu.</EmptyState>
    </section>
  )
}
