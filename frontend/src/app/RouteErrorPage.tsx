import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { ErrorState } from '../components/states'

/** Shown by the router when rendering a screen throws. */
export function RouteErrorPage() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Nepoznata greška.'

  return (
    <main className="app__main">
      <ErrorState title="Ekran nije mogao da se prikaže" message={message} />
      <p>
        <Link to="/">Nazad na pregled</Link>
      </p>
    </main>
  )
}

export function NotFoundPage() {
  return (
    <ErrorState title="Stranica ne postoji" message="Izaberite ekran u navigaciji levo." />
  )
}
