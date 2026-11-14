import { normalizeMunicipalRecord } from '../ingestion.js';

/**
 * Default NYC Open Data Wi-Fi / public space Socrata JSON endpoint (Brooklyn).
 * Callers can override with any Socrata dataset URL for libraries, parks, etc.
 */
export const DEFAULT_BROOKLYN_OPEN_DATA_URL =
  'https://data.cityofnewyork.us/resource/yjub-udmw.json?$where=boroname=%27Brooklyn%27&$limit=500';

/**
 * Normalizes Socrata JSON rows from NYC Open Data into municipal SourceRecords
 * tagged for Brooklyn. Supports both NYC Wi-Fi hotspot rows and generic
 * library/park rows.
 */
export function parseNycOpenDataRows(rows) {
  const records = [];

  for (const row of rows ?? []) {
    const lat = Number(row.latitude ?? row.lat);
    const lon = Number(row.longitude ?? row.lon);
    const name = row.name ?? row.location ?? row.library_name ?? row.park_name;
    const id = row.objectid ?? row.id ?? row.bbl ?? `${name}-${lat}-${lon}`;

    if (!name || Number.isNaN(lat) || Number.isNaN(lon)) continue;

    const record = normalizeMunicipalRecord({
      id: `nyc-${id}`,
      name: String(name).trim(),
      category: row.category ?? (row.ssid ? 'public_wifi_spot' : 'public_space'),
      lat,
      lon,
      address: row.location ?? row.address ?? undefined,
      hours: row.hours ?? undefined,
      wifi: row.ssid !== undefined ? true : row.wifi,
    });
    record.region = 'brooklyn';
    records.push(record);
  }

  return records;
}

export async function fetchBrooklynOpenData({
  url = DEFAULT_BROOKLYN_OPEN_DATA_URL,
  fetchImpl = fetch,
} = {}) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(
      `NYC Open Data error (${response.status}): ${response.statusText}`
    );
  }
  const rows = await response.json();
  return parseNycOpenDataRows(rows);
}
