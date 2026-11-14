import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyFreshness,
  computeDecayedConfidence,
  reconcileClaim,
} from '../src/freshness.js';
import {
  ingestSnapshot,
  normalizeMunicipalRecord,
  normalizeOsmRecord,
  normalizeOvertureRecord,
} from '../src/ingestion.js';
import { FRESHNESS_STATE, PLACE_STATUS, TIER_CONFIG } from '../src/schema.js';
import { FreshnessStore } from '../src/store.js';

test('computeDecayedConfidence halves confidence after one half-life', () => {
  const t0 = new Date('2026-01-01T00:00:00Z');
  const t75 = new Date(t0.getTime() + 75 * 86_400_000);

  const decayed = computeDecayedConfidence({
    baseConfidence: 0.8,
    lastVerifiedAt: t0,
    now: t75,
    halfLifeDays: 75,
  });

  assert.ok(Math.abs(decayed - 0.4) < 1e-6);
  assert.equal(classifyFreshness(decayed, TIER_CONFIG.medium), FRESHNESS_STATE.AGING);
});

test('reconcileClaim boosts confidence on agreement and flags disputes on contradiction', () => {
  const t0 = new Date('2026-01-01T00:00:00Z');
  const t10 = new Date('2026-01-11T00:00:00Z');
  const t60 = new Date('2026-03-02T00:00:00Z');

  const initial = reconcileClaim(
    null,
    { placeId: 'p1', attributeKey: 'wifi', value: true, sourceType: 'user_micro_verify' },
    t0
  );
  assert.equal(initial.confidence, 0.72);
  assert.equal(initial.verificationCount, 1);

  const agreed = reconcileClaim(
    initial,
    { placeId: 'p1', attributeKey: 'wifi', value: true, sourceType: 'user_micro_verify' },
    t10
  );
  assert.ok(agreed.confidence > initial.confidence);
  assert.equal(agreed.verificationCount, 2);
  assert.equal(agreed.needsReverification, false);

  // After 50 more days, a new user report contradicts the old claim
  const contested = reconcileClaim(
    agreed,
    { placeId: 'p1', attributeKey: 'wifi', value: false, sourceType: 'user_micro_verify' },
    t60
  );
  assert.equal(contested.value, false);
  assert.equal(contested.disputeCount, 1);
  assert.equal(contested.needsReverification, true);
});

test('entity resolution merges Overture, OSM, and Municipal records for the same place', () => {
  const store = new FreshnessStore(':memory:');
  const t0 = new Date('2026-09-01T12:00:00Z');

  const ov = normalizeOvertureRecord({
    id: 'ov-1',
    names: { primary: 'Grand Central Public Library' },
    categories: { primary: 'library' },
    geometry: { coordinates: [-73.9772, 40.7527] },
  });
  const osm = normalizeOsmRecord({
    id: 'osm-99',
    lat: 40.75275,
    lon: -73.97722,
    tags: {
      name: 'Grand Central Public Library',
      amenity: 'library',
      internet_access: 'wlan',
    },
  });
  const muni = normalizeMunicipalRecord({
    id: 'nyc-gc-1',
    name: 'Grand Central Public Library',
    category: 'library',
    lat: 40.75272,
    lon: -73.97719,
    wifi: true,
    hours: '09:00-18:00',
  });

  ingestSnapshot(store, [ov], { sourceType: 'overture', observedAt: t0 });
  const osmStats = ingestSnapshot(store, [osm], { sourceType: 'osm', observedAt: t0 });
  const muniStats = ingestSnapshot(store, [muni], {
    sourceType: 'municipal',
    observedAt: t0,
  });

  assert.equal(osmStats.matched, 1);
  assert.equal(muniStats.matched, 1);
  assert.equal(store.listPlaces().length, 1);

  const [place] = store.listPlaces();
  const claims = store.getClaimsForPlace(place.placeId, t0);
  const wifiClaim = claims.find((c) => c.attributeKey === 'wifi');
  assert.equal(wifiClaim.value, true);
  assert.equal(wifiClaim.verificationCount, 2);

  store.close();
});

test('missing places in an authoritative snapshot are marked suspected_closed', () => {
  const store = new FreshnessStore(':memory:');
  const t0 = new Date('2026-09-01T00:00:00Z');
  const t30 = new Date('2026-10-01T00:00:00Z');

  const recA = normalizeMunicipalRecord({
    id: 'm1',
    name: 'Park Plaza A',
    category: 'park',
    lat: 40.71,
    lon: -74.0,
  });
  const recB = normalizeMunicipalRecord({
    id: 'm2',
    name: 'Park Plaza B',
    category: 'park',
    lat: 40.72,
    lon: -74.01,
  });

  ingestSnapshot(store, [recA, recB], {
    sourceType: 'municipal',
    observedAt: t0,
  });

  const updateStats = ingestSnapshot(store, [recA], {
    sourceType: 'municipal',
    observedAt: t30,
    markMissingAsSuspectedClosed: true,
  });

  assert.equal(updateStats.suspectedClosedIds.length, 1);
  const placeB = store.getPlaceBySourceRef('municipal', 'm2');
  assert.equal(placeB.status, PLACE_STATUS.SUSPECTED_CLOSED);

  store.close();
});

test('reverification queue prioritizes contested and stale claims', () => {
  const store = new FreshnessStore(':memory:');
  const t0 = new Date('2026-09-01T00:00:00Z');
  const t10 = new Date('2026-09-11T00:00:00Z');

  const place = store.upsertPlace({
    name: 'Corner Cafe',
    category: 'cafe',
    lat: 40.75,
    lon: -73.99,
    sourceType: 'overture',
    sourceId: 'ov-corner',
    observedAt: t0,
  });

  store.applySignal({
    placeId: place.placeId,
    attributeKey: 'crowdedness',
    value: 'quiet',
    sourceType: 'user_micro_verify',
    observedAt: t0,
  });
  store.applySignal({
    placeId: place.placeId,
    attributeKey: 'wifi',
    value: true,
    sourceType: 'user_micro_verify',
    observedAt: t10,
  });

  const queue = store.getReverificationQueue({ now: t10 });
  assert.equal(queue.length, 1);
  assert.equal(queue[0].attributeKey, 'crowdedness');
  assert.equal(queue[0].freshnessState, FRESHNESS_STATE.STALE);

  store.close();
});
