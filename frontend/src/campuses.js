// UiTM campus coordinates — shared between MapView and PropertyDetail
export const CAMPUSES = {
  'UiTM Seremban 3 (NS)':      { lat: 2.6703, lng: 101.9353 },
  'UiTM Kuala Pilah (NS)':     { lat: 2.7890, lng: 102.2180 },
  'UiTM Rembau (NS)':          { lat: 2.5111, lng: 102.0633 },
  'UiTM Melaka (Alor Gajah)':  { lat: 2.3679, lng: 102.1801 },
  'UiTM Jasin (Melaka)':       { lat: 2.2212, lng: 102.4523 },
  'UiTM Bandaraya (Melaka)':   { lat: 2.1907, lng: 102.2465 },
  'UiTM Segamat (Johor)':      { lat: 2.4880, lng: 102.7293 },
  'UiTM Pasir Gudang (Johor)': { lat: 1.5267, lng: 103.8780 },
}

// Approximate state-centre coordinates — used when a property has no lat/lng
// (mirrors campus_config.json's state_fallback_coords)
export const STATE_FALLBACK_COORDS = {
  'Negeri Sembilan': { lat: 2.7297, lng: 101.9381 },
  'Melaka':          { lat: 2.1966, lng: 102.2501 },
  'Johor':           { lat: 1.4927, lng: 103.7414 },
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const R    = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a    = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2
  return +(R * 2 * Math.asin(Math.sqrt(a))).toFixed(1)
}

export function findNearestCampus(lat, lng) {
  let best = null, bestDist = Infinity
  for (const [name, pos] of Object.entries(CAMPUSES)) {
    const d = haversineKm(lat, lng, pos.lat, pos.lng)
    if (d < bestDist) { bestDist = d; best = { name, pos, dist: bestDist } }
  }
  return best
}

// Returns distance (km) from a property to a named campus, or null if not found
export function distanceToCampus(lat, lng, campusName) {
  const pos = Object.entries(CAMPUSES).find(([name]) =>
    name.toLowerCase().includes(campusName?.toLowerCase() || '__none__')
  )?.[1]
  if (!pos) return null
  return haversineKm(lat, lng, pos.lat, pos.lng)
}
