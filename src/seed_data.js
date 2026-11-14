import { PLACE_STATUS } from './schema.js';

const MS_PER_DAY = 86_400_000;

function daysAgo(now, days) {
  return new Date(new Date(now).getTime() - days * MS_PER_DAY);
}

export const DEFAULT_SEED_PLACES = Object.freeze([
  // --- Brooklyn ---
  {
    sourceType: 'municipal',
    sourceId: 'seed-bk-bpl-central',
    name: 'Brooklyn Central Library',
    category: 'library',
    lat: 40.6726,
    lon: -73.9682,
    region: 'brooklyn',
    status: PLACE_STATUS.ACTIVE,
    signals: [
      { attributeKey: 'address', value: '10 Grand Army Plaza, Brooklyn, NY', sourceType: 'municipal', ageDays: 5 },
      { attributeKey: 'hours', value: '09:00-20:00', sourceType: 'municipal', ageDays: 5 },
      { attributeKey: 'wifi', value: true, sourceType: 'municipal', ageDays: 5 },
      { attributeKey: 'outlets', value: 'plenty', sourceType: 'user_micro_verify', ageDays: 4 },
      { attributeKey: 'laptop_policy', value: 'all_day', sourceType: 'user_micro_verify', ageDays: 4 },
      { attributeKey: 'noise_level', value: 'quiet', sourceType: 'user_micro_verify', ageDays: 6 },
      { attributeKey: 'seating', value: 'spacious', sourceType: 'user_micro_verify', ageDays: 6 },
      { attributeKey: 'crowdedness', value: 'moderate', sourceType: 'user_micro_verify', ageDays: 0 },
    ],
  },
  {
    sourceType: 'municipal',
    sourceId: 'seed-bk-prospect-boathouse',
    name: 'Prospect Park Boathouse & Audubon Center',
    category: 'community_space',
    lat: 40.6602,
    lon: -73.9652,
    region: 'brooklyn',
    status: PLACE_STATUS.ACTIVE,
    signals: [
      { attributeKey: 'address', value: '101 East Dr, Brooklyn, NY', sourceType: 'municipal', ageDays: 12 },
      { attributeKey: 'hours', value: '10:00-17:00', sourceType: 'municipal', ageDays: 68 },
      { attributeKey: 'wifi', value: true, sourceType: 'user_micro_verify', ageDays: 72 },
      { attributeKey: 'outlets', value: 'limited', sourceType: 'user_micro_verify', ageDays: 72 },
      { attributeKey: 'seating', value: 'moderate', sourceType: 'user_micro_verify', ageDays: 40 },
      { attributeKey: 'crowdedness', value: 'quiet', sourceType: 'user_micro_verify', ageDays: 5 },
    ],
  },
  {
    sourceType: 'overture',
    sourceId: 'seed-bk-devocion-williamsburg',
    name: 'Devoción Williamsburg',
    category: 'cafe',
    lat: 40.7161,
    lon: -73.9647,
    region: 'brooklyn',
    status: PLACE_STATUS.ACTIVE,
    signals: [
      { attributeKey: 'address', value: '69 Grand St, Brooklyn, NY', sourceType: 'overture', ageDays: 20 },
      { attributeKey: 'hours', value: '08:00-19:00', sourceType: 'overture', ageDays: 15 },
      { attributeKey: 'wifi', value: true, sourceType: 'user_micro_verify', ageDays: 8 },
      { attributeKey: 'outlets', value: 'limited', sourceType: 'user_micro_verify', ageDays: 10 },
      // Contested laptop policy (initial all_day, later contradicted by no_weekends)
      { attributeKey: 'laptop_policy', value: 'all_day', sourceType: 'user_micro_verify', ageDays: 35, actorId: 'seed-u1' },
      { attributeKey: 'laptop_policy', value: 'no_weekends', sourceType: 'user_micro_verify', ageDays: 3, actorId: 'seed-u2' },
      { attributeKey: 'noise_level', value: 'lively', sourceType: 'user_micro_verify', ageDays: 9 },
      { attributeKey: 'crowdedness', value: 'packed', sourceType: 'user_micro_verify', ageDays: 1 },
    ],
  },
  {
    sourceType: 'municipal',
    sourceId: 'seed-bk-bbp-pier1',
    name: 'Brooklyn Bridge Park Pier 1 Plaza',
    category: 'public_plaza',
    lat: 40.7018,
    lon: -73.9967,
    region: 'brooklyn',
    status: PLACE_STATUS.ACTIVE,
    signals: [
      { attributeKey: 'address', value: '334 Furman St, Brooklyn, NY', sourceType: 'municipal', ageDays: 14 },
      { attributeKey: 'hours', value: '06:00-01:00', sourceType: 'municipal', ageDays: 14 },
      { attributeKey: 'wifi', value: true, sourceType: 'municipal', ageDays: 85 },
      { attributeKey: 'outlets', value: 'none', sourceType: 'user_micro_verify', ageDays: 85 },
      { attributeKey: 'seating', value: 'spacious', sourceType: 'user_micro_verify', ageDays: 20 },
      { attributeKey: 'crowdedness', value: 'moderate', sourceType: 'user_micro_verify', ageDays: 2 },
    ],
  },
  {
    sourceType: 'municipal',
    sourceId: 'seed-bk-greenpoint-lib',
    name: 'Greenpoint Library & Environmental Education Center',
    category: 'library',
    lat: 40.7282,
    lon: -73.9541,
    region: 'brooklyn',
    status: PLACE_STATUS.ACTIVE,
    signals: [
      { attributeKey: 'address', value: '107 Norman Ave, Brooklyn, NY', sourceType: 'municipal', ageDays: 3 },
      { attributeKey: 'hours', value: '10:00-18:00', sourceType: 'municipal', ageDays: 3 },
      { attributeKey: 'wifi', value: true, sourceType: 'municipal', ageDays: 3 },
      { attributeKey: 'outlets', value: 'plenty', sourceType: 'user_micro_verify', ageDays: 7 },
      { attributeKey: 'laptop_policy', value: 'all_day', sourceType: 'user_micro_verify', ageDays: 7 },
      { attributeKey: 'noise_level', value: 'quiet', sourceType: 'user_micro_verify', ageDays: 7 },
      { attributeKey: 'crowdedness', value: 'quiet', sourceType: 'user_micro_verify', ageDays: 0 },
    ],
  },

  // --- Westchester ---
  {
    sourceType: 'municipal',
    sourceId: 'seed-wc-white-plains-lib',
    name: 'White Plains Public Library',
    category: 'library',
    lat: 41.0315,
    lon: -73.7669,
    region: 'westchester',
    status: PLACE_STATUS.ACTIVE,
    signals: [
      { attributeKey: 'address', value: '100 Martine Ave, White Plains, NY', sourceType: 'municipal', ageDays: 4 },
      { attributeKey: 'hours', value: '09:00-21:00', sourceType: 'municipal', ageDays: 4 },
      { attributeKey: 'wifi', value: true, sourceType: 'municipal', ageDays: 4 },
      { attributeKey: 'outlets', value: 'plenty', sourceType: 'user_micro_verify', ageDays: 10 },
      // Contested laptop policy
      { attributeKey: 'laptop_policy', value: 'all_day', sourceType: 'user_micro_verify', ageDays: 45, actorId: 'seed-w1' },
      { attributeKey: 'laptop_policy', value: 'quiet_zone_only', sourceType: 'user_micro_verify', ageDays: 2, actorId: 'seed-w2' },
      { attributeKey: 'noise_level', value: 'quiet', sourceType: 'user_micro_verify', ageDays: 10 },
      { attributeKey: 'crowdedness', value: 'moderate', sourceType: 'user_micro_verify', ageDays: 0 },
    ],
  },
  {
    sourceType: 'municipal',
    sourceId: 'seed-wc-yonkers-riverfront',
    name: 'Yonkers Riverfront Library',
    category: 'library',
    lat: 40.9348,
    lon: -73.9022,
    region: 'westchester',
    status: PLACE_STATUS.ACTIVE,
    signals: [
      { attributeKey: 'address', value: '1 Larkin Center, Yonkers, NY', sourceType: 'municipal', ageDays: 10 },
      { attributeKey: 'hours', value: '09:00-20:00', sourceType: 'municipal', ageDays: 10 },
      { attributeKey: 'wifi', value: true, sourceType: 'municipal', ageDays: 10 },
      { attributeKey: 'outlets', value: 'plenty', sourceType: 'user_micro_verify', ageDays: 18 },
      { attributeKey: 'laptop_policy', value: 'all_day', sourceType: 'user_micro_verify', ageDays: 18 },
      { attributeKey: 'seating', value: 'spacious', sourceType: 'user_micro_verify', ageDays: 18 },
    ],
  },
  {
    sourceType: 'overture',
    sourceId: 'seed-wc-slave-to-the-grind',
    name: 'Slave to the Grind Coffeehouse',
    category: 'cafe',
    lat: 40.9412,
    lon: -73.8329,
    region: 'westchester',
    status: PLACE_STATUS.ACTIVE,
    signals: [
      { attributeKey: 'address', value: '58 Pondfield Rd, Bronxville, NY', sourceType: 'overture', ageDays: 25 },
      { attributeKey: 'hours', value: '07:00-18:00', sourceType: 'overture', ageDays: 82 },
      { attributeKey: 'wifi', value: true, sourceType: 'user_micro_verify', ageDays: 78 },
      { attributeKey: 'outlets', value: 'limited', sourceType: 'user_micro_verify', ageDays: 78 },
      { attributeKey: 'laptop_policy', value: 'all_day', sourceType: 'user_micro_verify', ageDays: 65 },
      { attributeKey: 'noise_level', value: 'moderate', sourceType: 'user_micro_verify', ageDays: 20 },
    ],
  },
  {
    sourceType: 'overture',
    sourceId: 'seed-wc-climbing-wolf',
    name: 'Climbing Wolf Coffee & Beer',
    category: 'cafe',
    lat: 41.0138,
    lon: -73.8732,
    region: 'westchester',
    status: PLACE_STATUS.ACTIVE,
    signals: [
      { attributeKey: 'address', value: '78 Main St, Dobbs Ferry, NY', sourceType: 'overture', ageDays: 9 },
      { attributeKey: 'hours', value: '07:30-22:00', sourceType: 'overture', ageDays: 9 },
      { attributeKey: 'wifi', value: true, sourceType: 'user_micro_verify', ageDays: 6 },
      { attributeKey: 'outlets', value: 'plenty', sourceType: 'user_micro_verify', ageDays: 6 },
      { attributeKey: 'laptop_policy', value: 'all_day', sourceType: 'user_micro_verify', ageDays: 6 },
      { attributeKey: 'noise_level', value: 'moderate', sourceType: 'user_micro_verify', ageDays: 6 },
      { attributeKey: 'crowdedness', value: 'quiet', sourceType: 'user_micro_verify', ageDays: 1 },
    ],
  },
  {
    sourceType: 'municipal',
    sourceId: 'seed-wc-kensico-dam',
    name: 'Kensico Dam Plaza',
    category: 'public_plaza',
    lat: 41.0748,
    lon: -73.7665,
    region: 'westchester',
    status: PLACE_STATUS.ACTIVE,
    signals: [
      { attributeKey: 'address', value: '1 Bronx River Pkwy, Valhalla, NY', sourceType: 'municipal', ageDays: 30 },
      { attributeKey: 'hours', value: '08:00-20:00', sourceType: 'municipal', ageDays: 95 },
      { attributeKey: 'wifi', value: false, sourceType: 'user_micro_verify', ageDays: 90 },
      { attributeKey: 'outlets', value: 'none', sourceType: 'user_micro_verify', ageDays: 90 },
      { attributeKey: 'seating', value: 'spacious', sourceType: 'user_micro_verify', ageDays: 22 },
      { attributeKey: 'crowdedness', value: 'quiet', sourceType: 'user_micro_verify', ageDays: 4 },
    ],
  },
]);

/**
 * Idempotently seeds default Brooklyn and Westchester third places into the store.
 */
export function seedDefaultPlaces(store, now = new Date()) {
  let created = 0;
  let skipped = 0;
  let signalsApplied = 0;

  for (const item of DEFAULT_SEED_PLACES) {
    const existing = store.getPlaceBySourceRef(item.sourceType, item.sourceId);
    if (existing) {
      skipped += 1;
      continue;
    }

    const place = store.upsertPlace({
      name: item.name,
      category: item.category,
      lat: item.lat,
      lon: item.lon,
      region: item.region,
      status: item.status,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      observedAt: daysAgo(now, 30),
    });
    created += 1;

    for (const sig of item.signals) {
      store.applySignal({
        placeId: place.placeId,
        attributeKey: sig.attributeKey,
        value: sig.value,
        sourceType: sig.sourceType,
        actorId: sig.actorId ?? 'seed-bot',
        observedAt: daysAgo(now, sig.ageDays ?? 0),
      });
      signalsApplied += 1;
    }
  }

  return { created, skipped, signalsApplied };
}
