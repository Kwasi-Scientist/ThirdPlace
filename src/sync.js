import { fetchBrooklynOpenData } from './adapters/nyc_open_data.js';
import { fetchOverpassBbox } from './adapters/overpass.js';
import { fetchWestchesterOpenData } from './adapters/westchester_open_data.js';
import { ingestSnapshot } from './ingestion.js';
import { getRegion } from './regions.js';
import { seedDefaultPlaces } from './seed_data.js';

export function splitBboxIntoTiles(bbox, rows = 2, cols = 2) {
  if (rows < 1 || cols < 1) {
    throw new Error('rows and cols must be >= 1');
  }
  const latStep = (bbox.maxLat - bbox.minLat) / rows;
  const lonStep = (bbox.maxLon - bbox.minLon) / cols;
  const tiles = [];

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      tiles.push({
        minLat: Number((bbox.minLat + r * latStep).toFixed(6)),
        maxLat: Number((r === rows - 1 ? bbox.maxLat : bbox.minLat + (r + 1) * latStep).toFixed(6)),
        minLon: Number((bbox.minLon + c * lonStep).toFixed(6)),
        maxLon: Number((c === cols - 1 ? bbox.maxLon : bbox.minLon + (c + 1) * lonStep).toFixed(6)),
      });
    }
  }

  return tiles;
}

export async function withRetry(fn, { retries = 2, baseDelayMs = 300 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries && baseDelayMs > 0) {
        const delay = baseDelayMs * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Syncs a target region from osm, nyc-open-data, westchester-open-data, or seed.
 */
export async function syncRegion(
  store,
  {
    region = 'brooklyn',
    source = 'osm',
    observedAt = new Date(),
    fetchImpl = fetch,
    tileRows = 2,
    tileCols = 2,
    retries = 2,
    baseDelayMs = 300,
    overpassEndpoint,
  } = {}
) {
  if (source === 'seed') {
    const seedStats = seedDefaultPlaces(store, observedAt);
    return {
      region: 'all',
      source: 'seed',
      fetchedCount: seedStats.created + seedStats.skipped,
      ...seedStats,
    };
  }

  const regionDef = getRegion(region);
  let records = [];
  let sourceType = source;

  if (source === 'osm') {
    const rows = region === 'westchester' ? tileRows : 1;
    const cols = region === 'westchester' ? tileCols : 1;
    const tiles = splitBboxIntoTiles(regionDef.bbox, rows, cols);
    const deduped = new Map();

    for (const tile of tiles) {
      const tileRecords = await withRetry(
        () =>
          fetchOverpassBbox(tile, region, {
            ...(overpassEndpoint ? { endpoint: overpassEndpoint } : {}),
            fetchImpl,
          }),
        { retries, baseDelayMs }
      );
      for (const rec of tileRecords) {
        deduped.set(rec.sourceId, rec);
      }
    }
    records = Array.from(deduped.values());
    sourceType = 'osm';
  } else if (source === 'nyc-open-data') {
    if (region !== 'brooklyn') {
      throw new Error('nyc-open-data adapter currently targets region=brooklyn');
    }
    records = await withRetry(() => fetchBrooklynOpenData({ fetchImpl }), {
      retries,
      baseDelayMs,
    });
    sourceType = 'municipal';
  } else if (source === 'westchester-open-data') {
    if (region !== 'westchester') {
      throw new Error('westchester-open-data adapter currently targets region=westchester');
    }
    records = await withRetry(() => fetchWestchesterOpenData({ fetchImpl }), {
      retries,
      baseDelayMs,
    });
    sourceType = 'municipal';
  } else {
    throw new Error(
      `Unsupported source "${source}". Use osm, nyc-open-data, westchester-open-data, or seed.`
    );
  }

  const stats = ingestSnapshot(store, records, {
    sourceType,
    observedAt,
    allowedRegions: ['brooklyn', 'westchester'],
    markMissingAsSuspectedClosed: sourceType === 'municipal',
  });

  return {
    region,
    source,
    fetchedCount: records.length,
    ...stats,
  };
}
