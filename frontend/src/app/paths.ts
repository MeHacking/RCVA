/**
 * The screens' addresses. Optimizacija (user, 21.11.2026, as in smartLoad+) is one menu item with
 * four steps: the shipments (import from Excel or one by one), where the trucks are, the time
 * limit, and the result (routes, map and 3D, all trucks or one). The older addresses lead here.
 */
export const PATHS = {
  optimization: '/optimization',
  shipments: '/optimization/shipments',
  shipmentImport: '/optimization/shipments/import',
  truckLocations: '/optimization/trucks',
  time: '/optimization/time',
  result: '/optimization/result',
  resultMap: '/optimization/result/map',
  result3d: '/optimization/result/3d',
} as const
