import {
  ingestSnapshot,
  normalizeMunicipalRecord,
  normalizeOvertureRecord,
} from './ingestion.js';
import { createAppServer } from './server.js';
import { FreshnessStore } from './store.js';
import { syncRegion } from './sync.js';

function parseArgs(argv) {
  const [command = 'demo', ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = rest[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    }
  }
  return { command, flags };
}

function runDemo() {
  const store = new FreshnessStore(':memory:');
  const day0 = new Date('2026-09-01T10:00:00Z');
  const day80 = new Date('2026-11-20T10:00:00Z');

  // Seed Brooklyn + Westchester + 1 out-of-region (Manhattan) spot to verify bbox filtering
  const overtureSeed = [
    normalizeOvertureRecord({
      id: 'ov-bk-1',
      names: { primary: 'Prospect Park Boathouse' },
      categories: { primary: 'community_space' },
      geometry: { coordinates: [-73.9652, 40.6602] }, // Brooklyn
      hours: '08:00-18:00',
    }),
    normalizeOvertureRecord({
      id: 'ov-wc-1',
      names: { primary: 'White Plains Public Library' },
      categories: { primary: 'library' },
      geometry: { coordinates: [-73.7669, 41.0315] }, // Westchester
      hours: '09:00-21:00',
    }),
    normalizeOvertureRecord({
      id: 'ov-mn-1',
      names: { primary: 'Midtown Espresso Bar' },
      categories: { primary: 'cafe' },
      geometry: { coordinates: [-73.9857, 40.7580] }, // Manhattan (outside target)
    }),
  ];

  const municipalSeed = [
    normalizeMunicipalRecord({
      id: 'bpl-central',
      name: 'Brooklyn Central Library',
      category: 'library',
      lat: 40.6726,
      lon: -73.9682,
      hours: '09:00-20:00',
      wifi: true,
    }),
    normalizeMunicipalRecord({
      id: 'wc-lib-wp',
      name: 'White Plains Public Library',
      category: 'library',
      lat: 41.03152,
      lon: -73.76688,
      hours: '09:00-21:00',
      wifi: true,
    }),
  ];

  const ovStats = ingestSnapshot(store, overtureSeed, {
    sourceType: 'overture',
    observedAt: day0,
    allowedRegions: ['brooklyn', 'westchester'],
  });
  const muniStats = ingestSnapshot(store, municipalSeed, {
    sourceType: 'municipal',
    observedAt: day0,
    allowedRegions: ['brooklyn', 'westchester'],
  });

  // Add user micro-verifications in Brooklyn and Westchester
  const bpl = store.getPlaceBySourceRef('municipal', 'bpl-central');
  store.applySignal({
    placeId: bpl.placeId,
    attributeKey: 'outlets',
    value: 'plenty',
    sourceType: 'user_micro_verify',
    actorId: 'user-bk-1',
    observedAt: day0,
  });

  const wpLib = store.getPlaceBySourceRef('municipal', 'wc-lib-wp');
  store.applySignal({
    placeId: wpLib.placeId,
    attributeKey: 'laptop_policy',
    value: 'all_day',
    sourceType: 'user_micro_verify',
    actorId: 'user-wc-1',
    observedAt: day0,
  });

  // Simulate conflicting report on White Plains Library at day 80
  store.applySignal({
    placeId: wpLib.placeId,
    attributeKey: 'laptop_policy',
    value: 'quiet_zone_only',
    sourceType: 'user_micro_verify',
    actorId: 'user-wc-2',
    observedAt: day80,
  });

  console.log('=== Regional Ingestion Summary (Brooklyn + Westchester) ===');
  console.log({ ovStats, muniStats });

  for (const region of ['brooklyn', 'westchester']) {
    console.log(`\n=== ${region.toUpperCase()} Places ===`);
    for (const p of store.listPlaces({ region })) {
      console.log(`- ${p.name} [${p.category}] (${p.status})`);
    }
    console.log(`=== ${region.toUpperCase()} Reverification Queue (Day 80) ===`);
    for (const q of store.getReverificationQueue({ now: day80, region })) {
      console.log(
        `- ${q.placeName} | ${q.attributeKey}=${JSON.stringify(q.value)} | ` +
          `conf=${q.effectiveConfidence} | state=${q.freshnessState} | disputes=${q.disputeCount}`
      );
    }
  }

  store.close();
}

async function runSync(flags) {
  const region = flags.region ?? 'brooklyn';
  const source = flags.source ?? 'osm';
  const dbPath = flags.db ?? 'data/thirdplace.db';
  const store = new FreshnessStore(dbPath);

  try {
    const result = await syncRegion(store, {
      region,
      source,
      observedAt: new Date(),
    });
    console.log(`Synced ${source} for ${region} into ${dbPath}`);
    console.log(result);
  } finally {
    store.close();
  }
}

function runServe(flags) {
  const port = Number(flags.port ?? 3000);
  const dbPath = flags.db ?? 'data/thirdplace.db';
  const store = new FreshnessStore(dbPath);
  const server = createAppServer({ store, seedOnEmpty: true });

  server.listen(port, '127.0.0.1', () => {
    console.log(
      `Third-Place app server running at http://127.0.0.1:${port} (db: ${dbPath})`
    );
  });

  const shutdown = () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const { command, flags } = parseArgs(process.argv.slice(2));
if (command === 'sync') {
  runSync(flags).catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
} else if (command === 'serve') {
  runServe(flags);
} else {
  runDemo();
}
