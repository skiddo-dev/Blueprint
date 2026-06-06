// Pure geo math shared by the prospecting feature — the ATTOM client
// (distance-from-center), the mock generator (scatter points in a radius), and
// the Prospects map. No DOM/Node deps so it runs on the server, the client, and
// under Vitest. Distances are in statute miles to match how the UI talks about
// a "30 mile radius".

const EARTH_RADIUS_MI = 3958.7613

const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/** Great-circle distance between two lat/lng points, in miles. */
export function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Point reached by travelling `distanceMi` miles from (lat,lng) on `bearingDeg`
 *  (0 = north, 90 = east). Used to scatter realistic mock prospects inside the
 *  search radius. */
export function destinationPoint(
  lat: number,
  lng: number,
  bearingDeg: number,
  distanceMi: number,
): { lat: number; lng: number } {
  const angular = distanceMi / EARTH_RADIUS_MI
  const brng = toRad(bearingDeg)
  const lat1 = toRad(lat)
  const lng1 = toRad(lng)
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(brng),
  )
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    )
  return { lat: toDeg(lat2), lng: toDeg(lng2) }
}
