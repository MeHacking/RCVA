import { createBrowserRouter, Navigate, RouterProvider, useLocation } from 'react-router'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { HelpPage } from '../features/help/HelpPage'
import { HistoryPage } from '../features/history/HistoryPage'
import { OptimizationIndex, OptimizationLayout } from '../features/optimization/OptimizationLayout'
import { OptimizationPage } from '../features/optimization/OptimizationPage'
import { ResultStep, TimeStep, TruckLocationsStep } from '../features/optimization/OptimizationSteps'
import { RouteMapPage } from '../features/route-map/RouteMapPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { ImportPage } from '../features/shipments/import/ImportPage'
import { ShipmentsPage } from '../features/shipments/ShipmentsPage'
import { Truck3dPage } from '../features/truck-3d/Truck3dPage'
import { TrucksPage } from '../features/trucks/TrucksPage'
import { AppLayout } from './AppLayout'
import { PATHS } from './paths'
import { NotFoundPage, RouteErrorPage } from './RouteErrorPage'

/** An older address: the same screen in Optimizacija, with its ?job= and ?truck=. */
function MovedTo({ to }: { to: string }) {
  const { search } = useLocation()
  return <Navigate to={`${to}${search}`} replace />
}

// Browser history routing: clean URLs. The Spring Boot backend will need a fallback
// that serves index.html for these paths (not needed for the Vite dev server).
const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <DashboardPage /> },
      {
        path: 'optimization',
        element: <OptimizationLayout />,
        children: [
          { index: true, element: <OptimizationIndex /> },
          { path: 'shipments', element: <ShipmentsPage /> },
          { path: 'shipments/import', element: <ImportPage /> },
          { path: 'trucks', element: <TruckLocationsStep /> },
          { path: 'time', element: <TimeStep /> },
          {
            path: 'result',
            element: <ResultStep />,
            children: [
              { index: true, element: <OptimizationPage /> },
              { path: 'map', element: <RouteMapPage /> },
              { path: '3d', element: <Truck3dPage /> },
            ],
          },
        ],
      },
      { path: 'history', element: <HistoryPage /> },
      { path: 'trucks', element: <TrucksPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'help', element: <HelpPage /> },
      // Before Optimizacija had steps (21.11.2026), these were screens of their own.
      { path: 'shipments', element: <MovedTo to={PATHS.shipments} /> },
      { path: 'shipments/import', element: <MovedTo to={PATHS.shipmentImport} /> },
      { path: 'route-map', element: <MovedTo to={PATHS.resultMap} /> },
      { path: 'truck-3d', element: <MovedTo to={PATHS.result3d} /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
