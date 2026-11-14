import test from 'node:test';
import assert from 'node:assert/strict';

import { parseWestchesterOpenData } from '../src/adapters/westchester_open_data.js';
import { REGIONS } from '../src/regions.js';
import { FreshnessStore } from '../src/store.js';
import { splitBboxIntoTiles, syncRegion, withRetry } from '../src/sync.js';

test('parseWestchesterOpenData normalizes flat JSON rows for Westchester', () => {
  const rows = [
    {
      id: 'lib-101',
      library_name: 'Scarsdale Public Library',
      latitude: '40.9964',
      longitude: '-73.7885',
      street_address: '54 Olmsted Rd',
      hours: '09:00-21:00',
      public_wifi: true,
    },
    {
      id: 'bad-row',
      library_name: 'Missing Coords',
    },
  ];

  const records = parseWestchesterOpenData(rows);
  assert.equal(records.length, 1);
  assert.equal(records[0].sourceType, 'municipal');
  assert.equal(records[0].sourceId, 'wc-lib-101');
  assert.equal(records[0].region, 'westchester');
  assert.equal(records[0].category, 'library');
  assert.equal(records[0].attributes.wifi, true);
  assert.equal(records[0].attributes.address, '54 Olmsted Rd');
});

test('parseWestchesterOpenData normalizes GeoJSON FeatureCollection payloads', () => {
  const geojson = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'park-7',
        geometry: { type: 'Point', coordinates: [-73.8615, 41.0762] },
        properties: {
          park_name: 'Rockefeller State Park Preserve',
          category: 'park',
          hours: '07:00-19:00',
        },
      },
    ],
  };

  const records = parseWestchesterOpenData(geojson);
  assert.equal(records.length, 1);
  assert.equal(records[0].name, 'Rockefeller State Park Preserve');
  assert.equal(records[0].lat, 41.0762);
  assert.equal(records[0].lon, -73.8615);
  assert.equal(records[0].region, 'westchester');
  assert.equal(records[0].category, 'park');
});

test('splitBboxIntoTiles covers the bounding box without gaps', () => {
  const bbox = REGIONS.westchester.bbox;
  const tiles = splitBboxIntoTiles(bbox, 2, 2);

  assert.equal(tiles.length, 4);
  assert.equal(tiles[0].minLat, bbox.minLat);
  assert.equal(tiles[0].minLon, bbox.minLon);
  assert.equal(tiles[3].maxLat, bbox.maxLat);
  assert.equal(tiles[3].maxLon, bbox.maxLon);
});

test('withRetry retries transient errors before succeeding', async () => {
  let attempts = 0;
  const result = await withRetry(
    async () => {
      attempts += 1;
      if (attempts < 2) throw new Error('Transient 429');
      return 'ok';
    },
    { retries: 2, baseDelayMs: 1 }
  );

  assert.equal(result, 'ok');
  assert.equal(attempts, 2);
});

test('syncRegion ingests Westchester municipal feed and tiled Overpass results', async () => {
  const store = new FreshnessStore(':memory:');
  const t0 = new Date('2026-10-01T12:00:00Z');

  const muniFetch = async () => ({
    ok: true,
    json: async () => [
      {
        id: 'wp-1',
        library_name: 'White Plains Public Library',
        latitude: 41.0315,
        longitude: -73.7669,
        wifi: true,
      },
    ],
  });

  const muniResult = await syncRegion(store, {
    region: 'westchester',
    source: 'westchester-open-data',
    observedAt: t0,
    fetchImpl: muniFetch,
  });

  assert.equal(muniResult.created, 1);
  assert.equal(muniResult.fetchedCount, 1);

  // Simulate tiled Overpass returning the same boundary node across tiles -> deduped
  let overpassCalls = 0;
  const osmFetch = async () => {
    overpassCalls += 1;
    return {
      ok: true,
      json: async () => ({
        elements: [
          {
            type: 'node',
            id: 9001,
            lat: 40.9412,
            lon: -73.8329,
            tags: { name: 'Slave to the Grind', amenity: 'cafe', internet_access: 'wlan' },
          },
        ],
      }),
    };
  };

  const osmResult = await syncRegion(store, {
    region: 'westchester',
    source: 'osm',
    observedAt: t0,
    fetchImpl: osmFetch,
    tileRows: 2,
    tileCols: 2,
  });

  assert.equal(overpassCalls, 4);
  assert.equal(osmResult.fetchedCount, 1);
  assert.equal(osmResult.created, 1);
  assert.equal(store.listPlaces({ region: 'westchester' }).length, 2);

  store.close();
});
