import test from 'node:test';
import assert from 'node:assert/strict';

import { createAppServer } from '../src/server.js';
import { FreshnessStore } from '../src/store.js';

async function startTestServer(nowFn = () => new Date('2026-11-13T12:00:00Z')) {
  const store = new FreshnessStore(':memory:');
  const server = createAppServer({ store, seedOnEmpty: true, nowFn });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return {
    store,
    server,
    baseUrl,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      store.close();
    },
  };
}

test('HTTP API lists regional places, filters by wifi/category, and serves static UI', async () => {
  const ctx = await startTestServer();
  try {
    const healthRes = await fetch(`${ctx.baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json();
    assert.equal(health.status, 'ok');
    assert.equal(health.placeCount, 10);

    const bkRes = await fetch(`${ctx.baseUrl}/api/places?region=brooklyn`);
    assert.equal(bkRes.status, 200);
    const bkData = await bkRes.json();
    assert.equal(bkData.places.length, 5);
    assert.ok(bkData.places.every((p) => p.region === 'brooklyn'));

    const wcRes = await fetch(`${ctx.baseUrl}/api/places?region=westchester&wifi=true`);
    assert.equal(wcRes.status, 200);
    const wcData = await wcRes.json();
    assert.equal(wcData.places.length, 4);
    assert.ok(wcData.places.every((p) => p.attributes.wifi?.value === true));

    const htmlRes = await fetch(`${ctx.baseUrl}/`);
    assert.equal(htmlRes.status, 200);
    assert.match(htmlRes.headers.get('content-type'), /text\/html/);
    const html = await htmlRes.text();
    assert.match(html, /ThirdPlace/);

    const jsRes = await fetch(`${ctx.baseUrl}/app.js`);
    assert.equal(jsRes.status, 200);
    assert.match(jsRes.headers.get('content-type'), /javascript/);
  } finally {
    await ctx.close();
  }
});

test('POST /api/places/:id/verify handles agreement boost, contradiction dispute, and 429 cooldown', async () => {
  let currentNow = new Date('2026-11-13T12:00:00Z');
  const ctx = await startTestServer(() => currentNow);

  try {
    const listRes = await fetch(`${ctx.baseUrl}/api/places?region=brooklyn&category=cafe`);
    const { places } = await listRes.json();
    assert.equal(places.length, 1);
    const cafe = places[0];

    const detailRes = await fetch(`${ctx.baseUrl}/api/places/${cafe.placeId}`);
    assert.equal(detailRes.status, 200);
    const { place: before } = await detailRes.json();
    const initialWifiConf = before.attributes.wifi.effectiveConfidence;

    // 1. Agreement boost from actor-a
    const verifyRes = await fetch(`${ctx.baseUrl}/api/places/${cafe.placeId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attributeKey: 'wifi',
        value: true,
        actorId: 'actor-a',
      }),
    });
    assert.equal(verifyRes.status, 200);
    const verifiedBody = await verifyRes.json();
    assert.ok(verifiedBody.claim.effectiveConfidence > initialWifiConf);

    // 2. Duplicate tap from same actor within 5 minutes -> 429
    const dupRes = await fetch(`${ctx.baseUrl}/api/places/${cafe.placeId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attributeKey: 'wifi',
        value: true,
        actorId: 'actor-a',
      }),
    });
    assert.equal(dupRes.status, 429);

    // 3. Contradicting signal from actor-b creates dispute & flags needsReverification
    const disputeRes = await fetch(`${ctx.baseUrl}/api/places/${cafe.placeId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attributeKey: 'outlets',
        value: 'none',
        actorId: 'actor-b',
      }),
    });
    assert.equal(disputeRes.status, 200);
    const disputed = await disputeRes.json();
    assert.equal(disputed.claim.disputeCount, 1);
    assert.equal(disputed.claim.needsReverification, true);

    // 4. Invalid payload -> 400
    const badRes = await fetch(`${ctx.baseUrl}/api/places/${cafe.placeId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attributeKey: 'unknown_field', value: 'x' }),
    });
    assert.equal(badRes.status, 400);

    // 5. Reverification queue returns Westchester items
    const qRes = await fetch(`${ctx.baseUrl}/api/reverification-queue?region=westchester`);
    assert.equal(qRes.status, 200);
    const { queue } = await qRes.json();
    assert.ok(queue.length > 0);
    assert.ok(queue.every((q) => q.region === 'westchester'));
  } finally {
    await ctx.close();
  }
});
