import { normalizeOsmRecord } from '../ingestion.js';
import { getRegion } from '../regions.js';

const DEFAULT_OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

export function buildOverpassQueryForBbox(bbox) {
  const box = `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`;
  return `
[out:json][timeout:25];
(
  node["amenity"~"^(cafe|library|community_centre|coworking_space)$"]["name"](${box});
  way["amenity"~"^(cafe|library|community_centre|coworking_space)$"]["name"](${box});
  way["leisure"="park"]["name"](${box});
);
out center tags;
`.trim();
}

/**
 * Builds an Overpass QL query for candidate third places (cafes, libraries,
 * community centers, coworking spaces, and parks) inside the target region bbox.
 */
export function buildOverpassQuery(regionId) {
  const { bbox } = getRegion(regionId);
  return buildOverpassQueryForBbox(bbox);
}

export function parseOverpassResponse(payload, regionId = null) {
  const elements = payload?.elements ?? [];
  const records = [];

  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    const name = el.tags?.name;
    if (lat === undefined || lon === undefined || !name) continue;

    const normalized = normalizeOsmRecord({
      id: `${el.type ?? 'node'}-${el.id}`,
      lat,
      lon,
      tags: el.tags,
    });
    if (regionId) {
      normalized.region = regionId;
    }
    records.push(normalized);
  }

  return records;
}

export async function fetchOverpassBbox(
  bbox,
  regionId = null,
  { endpoint = DEFAULT_OVERPASS_ENDPOINT, fetchImpl = fetch } = {}
) {
  const query = buildOverpassQueryForBbox(bbox);
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ data: query }),
  });

  if (!response.ok) {
    throw new Error(`Overpass API error (${response.status}): ${response.statusText}`);
  }

  const payload = await response.json();
  return parseOverpassResponse(payload, regionId);
}

export async function fetchOverpassRegion(
  regionId,
  { endpoint = DEFAULT_OVERPASS_ENDPOINT, fetchImpl = fetch } = {}
) {
  const { bbox } = getRegion(regionId);
  return fetchOverpassBbox(bbox, regionId, { endpoint, fetchImpl });
}
