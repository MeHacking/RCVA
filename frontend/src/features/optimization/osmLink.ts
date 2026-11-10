/** The point on the OpenStreetMap map (opens in the browser). */
export const osmLink = (p: { lat: number; lon: number }) =>
  `https://www.openstreetmap.org/?mlat=${p.lat.toFixed(5)}&mlon=${p.lon.toFixed(5)}#map=17/${p.lat.toFixed(5)}/${p.lon.toFixed(5)}`
