/**
 * Target region definitions and bounding-box helpers for Brooklyn and Westchester.
 */

export const REGIONS = Object.freeze({
  brooklyn: Object.freeze({
    id: 'brooklyn',
    label: 'Brooklyn, NY',
    bbox: Object.freeze({
      minLat: 40.5707,
      maxLat: 40.7395,
      minLon: -74.0421,
      maxLon: -73.8334,
    }),
  }),
  westchester: Object.freeze({
    id: 'westchester',
    label: 'Westchester County, NY',
    bbox: Object.freeze({
      minLat: 40.8800,
      maxLat: 41.3700,
      minLon: -73.9800,
      maxLon: -73.4800,
    }),
  }),
});

export function isPointInBbox(lat, lon, bbox) {
  return (
    lat >= bbox.minLat &&
    lat <= bbox.maxLat &&
    lon >= bbox.minLon &&
    lon <= bbox.maxLon
  );
}

export function classifyRegion(lat, lon) {
  for (const region of Object.values(REGIONS)) {
    if (isPointInBbox(lat, lon, region.bbox)) {
      return region.id;
    }
  }
  return null;
}

export function getRegion(regionId) {
  const region = REGIONS[regionId];
  if (!region) {
    throw new Error(
      `Unknown region "${regionId}". Expected one of: ${Object.keys(REGIONS).join(', ')}`
    );
  }
  return region;
}
