import test from 'node:test';
import assert from 'node:assert/strict';

import { parseNycOpenDataRows } from '../src/adapters/nyc_open_data.js';
import {
  buildOverpassQuery,
  parseOverpassResponse,
} from '../src/adapters/overpass.js';
import { ingestSnapshot, normalizeOvertureRecord } from '../src/ingestion.js';
import { classifyRegion } from '../src/regions.js';
import { FreshnessStore } from '../src/store.js';

test('classifyRegion separates Brooklyn, Westchester, and out-of-region coordinates', () => {
  // Brooklyn Central Library
  assert.equal(classifyRegion(40.6726, -73.9682), 'brooklyn');
  // White Plains Public Library (Westchester)
  assert.equal(classifyRegion(41.0315, -73.7669), 'westchester');
  // Midtown Manhattan (outside target regions)
  assert.equal(classifyRegion(40.7580, -73.9857), null);
});

test('Overpass adapter builds regional bbox queries and parses node/way elements', () => {
  const bkQuery = buildOverpassQuery('brooklyn');
  assert.match(bkQuery, /40\.5707,-74\.0421,40\.7395,-73\.8334/);

  const wcQuery = buildOverpassQuery('westchester');
  assert.match(wcQuery, /40\.88,-73\.98,41\.37,-73\.48/);

  const parsed = parseOverpassResponse(
    {
      elements: [
        {
          type: 'node',
          id: 111,
          lat: 40.6782,
          lon: -73.9442,
          tags: { name: 'Bed-Stuy Roasters', amenity: 'cafe', internet_access: 'wlan' },
        },
        {
          type: 'way',
          id: 222,
          center: { lat: 41.032, lon: -73.765 },
          tags: { name: 'Turnure Park', leisure: 'park' },
        },
        {
          type: 'node',
          id: 333,
          lat: 40.67,
          lon: -73.95,
          tags: { amenity: 'cafe' }, // missing name -> skipped
        },
      ],
    },
    'brooklyn'
  );

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].attributes.wifi, true);
  assert.equal(parsed[1].category, 'park');
});

test('NYC Open Data parser normalizes Brooklyn rows and FreshnessStore filters by region', () => {
  const rows = [
    {
      objectid: '501',
      name: 'McCarren Park Fieldhouse',
      location: '776 Lorimer St',
      latitude: '40.7204',
      longitude: '-73.9519',
      ssid: 'NYCWiFi',
    },
  ];
  const muniRecords = parseNycOpenDataRows(rows);
  assert.equal(muniRecords.length, 1);
  assert.equal(muniRecords[0].region, 'brooklyn');
  assert.equal(muniRecords[0].attributes.wifi, true);

  const store = new FreshnessStore(':memory:');
  const t0 = new Date('2026-09-01T10:00:00Z');
  const t90 = new Date('2026-11-30T10:00:00Z');

  ingestSnapshot(store, muniRecords, {
    sourceType: 'municipal',
    observedAt: t0,
    allowedRegions: ['brooklyn', 'westchester'],
  });

  const outOfRegion = normalizeOvertureRecord({
    id: 'ov-mn',
    names: { primary: 'Times Square Kiosk' },
    categories: { primary: 'cafe' },
    geometry: { coordinates: [-73.9855, 40.758] },
  });
  const ovStats = ingestSnapshot(store, [outOfRegion], {
    sourceType: 'overture',
    observedAt: t0,
    allowedRegions: ['brooklyn', 'westchester'],
  });

  assert.equal(ovStats.skippedOutOfRegion, 1);
  assert.equal(store.listPlaces({ region: 'brooklyn' }).length, 1);
  assert.equal(store.listPlaces({ region: 'westchester' }).length, 0);

  const bkQueue = store.getReverificationQueue({ now: t90, region: 'brooklyn' });
  assert.ok(bkQueue.length >= 1);
  assert.equal(bkQueue[0].region, 'brooklyn');

  store.close();
});
