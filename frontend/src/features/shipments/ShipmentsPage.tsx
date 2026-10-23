import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/states'

export function ShipmentsPage() {
  return (
    <section>
      <PageHeader title="Pošiljke" />
      <EmptyState title="Ekran je u pripremi">
        Ovde će biti tabela pošiljki, uvoz Excel-a u četiri koraka (fajl, mapiranje kolona, greške i
        duplikati, potvrda), ručna ispravka nejasnih lokacija i izvoz.
      </EmptyState>
    </section>
  )
}
