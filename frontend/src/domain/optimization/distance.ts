// Great-circle distance from lat/lon, the same formula as the backend's
// HaversineDistanceProvider. On the device it is used only without an OpenRouteService
// key (src/api/local/openRouteService.ts gives road distances), and the result says so.

const EARTH_RADIUS_KM = 6371

export interface LatLon {
  lat: number
  lon: number
}

/** Whole metres along the great circle */
export function haversineMeters(from: LatLon, to: LatLon): number {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const lat1 = rad(from.lat)
  const lat2 = rad(to.lat)
  const a = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(rad(to.lon - from.lon) / 2) ** 2
  return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a)) * 1000)
}

export function haversineMatrix(points: LatLon[]): number[][] {
  return points.map((from) => points.map((to) => haversineMeters(from, to)))
}
