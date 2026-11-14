import { normalizeMunicipalRecord } from '../ingestion.js';

/**
 * Default NY State / Westchester County public library & park dataset endpoint.
 * Override with any Socrata JSON or GeoJSON FeatureCollection URL.
 */
export const DEFAULT_WESTCHESTER_OPEN_DATA_URL =
  'https://data.ny.gov/resource/fe32-b95q.json?$where=county=%27Westchester%27&$limit=500';

function parseFlatRow(row) {
  const lat = Number(row.latitude ?? row.lat ?? row.y);
  const lon = Number(row.longitude ?? row.lon ?? row.x);
  const name = row.name ?? row.library ?? row.library_name ?? row.park_name ?? row.facility_name;
  const id = row.objectid ?? row.id ?? row.lib_id ?? `${name}-${lat}-${lon}`;

  if (!name || Number.isNaN(lat) || Number.isNaN(lon)) {
    return null;
  }

  const record = normalizeMunicipalRecord({
    id: `wc-${id}`,
    name: String(name).trim(),
    category: row.category ?? (row.library || row.library_name ? 'library' : 'park'),
    lat,
    lon,
    address: row.address ?? row.street_address ?? row.location ?? undefined,
    hours: row.hours ?? undefined,
    wifi: row.wifi !== undefined ? row.wifi : row.public_wifi !== undefined ? row.public_wifi : undefined,
  });
  record.region = 'westchester';
  return record;
}

function parseGeoJsonFeature(feature) {
  const props = feature?.properties ?? {};
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) {
    return null;
  }
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  const name = props.name ?? props.library ?? props.library_name ?? props.park_name ?? props.facility_name;
  const id = feature.id ?? props.objectid ?? props.id ?? `${name}-${lat}-${lon}`;

  if (!name || Number.isNaN(lat) || Number.isNaN(lon)) {
    return null;
  }

  const record = normalizeMunicipalRecord({
    id: `wc-${id}`,
    name: String(name).trim(),
    category: props.category ?? (props.library || props.library_name ? 'library' : 'park'),
    lat,
    lon,
    address: props.address ?? props.street_address ?? props.location ?? undefined,
    hours: props.hours ?? undefined,
    wifi: props.wifi !== undefined ? props.wifi : props.public_wifi !== undefined ? props.public_wifi : undefined,
  });
  record.region = 'westchester';
  return record;
}

/**
 * Normalizes Westchester municipal payloads (either flat JSON rows or GeoJSON
 * FeatureCollection) into municipal SourceRecords tagged for Westchester.
 */
export function parseWestchesterOpenData(payload) {
  if (!payload) return [];

  const records = [];
  if (Array.isArray(payload)) {
    for (const row of payload) {
      const rec = parseFlatRow(row);
      if (rec) records.push(rec);
    }
    return records;
  }

  if (payload.type === 'FeatureCollection' && Array.isArray(payload.features)) {
    for (const feature of payload.features) {
      const rec = parseGeoJsonFeature(feature);
      if (rec) records.push(rec);
    }
    return records;
  }

  return records;
}

export async function fetchWestchesterOpenData({
  url = DEFAULT_WESTCHESTER_OPEN_DATA_URL,
  fetchImpl = fetch,
} = {}) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(
      `Westchester Open Data error (${response.status}): ${response.statusText}`
    );
  }
  const payload = await response.json();
  return parseWestchesterOpenData(payload);
}
