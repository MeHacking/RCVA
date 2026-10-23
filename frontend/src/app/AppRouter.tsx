import { createBrowserRouter, RouterProvider } from 'react-router'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { OptimizationPage } from '../features/optimization/OptimizationPage'
import { RouteMapPage } from '../features/route-map/RouteMapPage'
import { ShipmentsPage } from '../features/shipments/ShipmentsPage'
import { Truck3dPage } from '../features/truck-3d/Truck3dPage'
import { TrucksPage } from '../features/trucks/TrucksPage'
import { AppLayout } from './AppLayout'
import { NotFoundPage, RouteErrorPage } from './RouteErrorPage'

// Browser history routing: clean URLs. The Spring Boot backend will need a fallback
// that serves index.html for these paths (not needed for the Vite dev server).
const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'shipments', element: <ShipmentsPage /> },
      { path: 'trucks', element: <TrucksPage /> },
      { path: 'optimization', element: <OptimizationPage /> },
      { path: 'truck-3d', element: <Truck3dPage /> },
      { path: 'route-map', element: <RouteMapPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
