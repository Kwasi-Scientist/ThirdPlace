import { classifyRegion } from './regions.js';
import { PLACE_STATUS } from './schema.js';

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export function normalizeName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenJaccardSimilarity(a, b) {
  const tokensA = new Set(normalizeName(a).split(' ').filter(Boolean));
  const tokensB = new Set(normalizeName(b).split(' ').filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection += 1;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Normalizes an Overture Maps Places feature into our internal SourceRecord.
 */
export function normalizeOvertureRecord(raw) {
  return {
    sourceType: 'overture',
    sourceId: String(raw.id),
    name: raw.names?.primary ?? raw.name,
    category: raw.categories?.primary ?? raw.category ?? 'cafe',
    lat: Number(raw.geometry?.coordinates?.[1] ?? raw.lat),
    lon: Number(raw.geometry?.coordinates?.[0] ?? raw.lon),
    attributes: {
      ...(raw.address ? { address: raw.address } : {}),
      ...(raw.hours ? { hours: raw.hours } : {}),
    },
  };
}

/**
 * Normalizes an OpenStreetMap node/way tag payload into our internal SourceRecord.
 */
export function normalizeOsmRecord(raw) {
  const tags = raw.tags ?? {};
  const attributes = {};
  if (tags.opening_hours) attributes.hours = tags.opening_hours;
  if (tags.internet_access) {
    attributes.wifi =
      tags.internet_access === 'wlan' || tags.internet_access === 'yes';
  }
  if (tags['addr:street']) {
    attributes.address = [tags['addr:housenumber'], tags['addr:street']]
      .filter(Boolean)
      .join(' ');
  }

  return {
    sourceType: 'osm',
    sourceId: String(raw.id),
    name: tags.name ?? raw.name,
    category: tags.amenity ?? tags.leisure ?? 'community_space',
    lat: Number(raw.lat),
    lon: Number(raw.lon),
    attributes,
  };
}

/**
 * Normalizes a municipal open-data record (e.g., public library or park).
 */
export function normalizeMunicipalRecord(raw) {
  return {
    sourceType: 'municipal',
    sourceId: String(raw.id),
    name: raw.name,
    category: raw.category ?? 'library',
    lat: Number(raw.lat),
    lon: Number(raw.lon),
    attributes: {
      ...(raw.address ? { address: raw.address } : {}),
      ...(raw.hours ? { hours: raw.hours } : {}),
      ...(raw.wifi !== undefined ? { wifi: Boolean(raw.wifi) } : {}),
    },
  };
}

/**
 * Resolves an incoming SourceRecord to an existing canonical place via:
 * 1. Exact (sourceType, sourceId) reference match
 * 2. Spatial proximity (<= maxDistanceMeters) + name token similarity (>= minNameSimilarity)
 */
export function resolveCanonicalPlace(
  store,
  record,
  { maxDistanceMeters = 75, minNameSimilarity = 0.5 } = {}
) {
  const byRef = store.getPlaceBySourceRef(record.sourceType, record.sourceId);
  if (byRef) return byRef;

  const candidates = store.listPlaces();
  let bestMatch = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    const dist = haversineMeters(
      record.lat,
      record.lon,
      candidate.lat,
      candidate.lon
    );
    if (dist > maxDistanceMeters) continue;

    const sim = tokenJaccardSimilarity(record.name, candidate.name);
    if (sim < minNameSimilarity) continue;

    const score = sim - dist / (maxDistanceMeters * 4);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

/**
 * Ingests a snapshot of normalized SourceRecords into the FreshnessStore.
 */
export function ingestSnapshot(
  store,
  records,
  {
    sourceType,
    observedAt = new Date(),
    markMissingAsSuspectedClosed = false,
    allowedRegions = null,
  }
) {
  const stats = {
    created: 0,
    matched: 0,
    skippedOutOfRegion: 0,
    claimsUpdated: 0,
    suspectedClosedIds: [],
  };

  for (const record of records) {
    const region = record.region ?? classifyRegion(record.lat, record.lon);
    if (allowedRegions && !allowedRegions.includes(region)) {
      stats.skippedOutOfRegion += 1;
      continue;
    }

    const existing = resolveCanonicalPlace(store, record);
    const place = store.upsertPlace({
      placeId: existing?.placeId,
      name: record.name,
      category: record.category,
      lat: record.lat,
      lon: record.lon,
      region,
      status: PLACE_STATUS.ACTIVE,
      sourceType: record.sourceType ?? sourceType,
      sourceId: record.sourceId,
      observedAt,
    });

    if (existing) {
      stats.matched += 1;
    } else {
      stats.created += 1;
    }

    for (const [attributeKey, value] of Object.entries(record.attributes ?? {})) {
      if (value === undefined || value === null) continue;
      store.applySignal({
        placeId: place.placeId,
        attributeKey,
        value,
        sourceType: record.sourceType ?? sourceType,
        observedAt,
      });
      stats.claimsUpdated += 1;
    }
  }

  if (markMissingAsSuspectedClosed && sourceType) {
    stats.suspectedClosedIds = store.markMissingFromSnapshot(
      sourceType,
      observedAt
    );
  }

  return stats;
}
