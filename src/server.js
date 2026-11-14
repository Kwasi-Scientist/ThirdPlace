import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatPlaceResponse, validateVerifyPayload } from './contracts.js';
import { seedDefaultPlaces } from './seed_data.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PUBLIC_DIR = resolve(__dirname, '../public');

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
});

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  let totalBytes = 0;
  const maxBytes = 64 * 1024;

  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      throw new Error('PAYLOAD_TOO_LARGE');
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

export function createAppServer({
  store,
  seedOnEmpty = true,
  nowFn = () => new Date(),
  publicDir = DEFAULT_PUBLIC_DIR,
} = {}) {
  if (!store) {
    throw new Error('createAppServer requires a FreshnessStore instance');
  }

  if (seedOnEmpty && store.listPlaces().length === 0) {
    seedDefaultPlaces(store, nowFn());
  }

  const staticRoutes = new Set(['/', '/index.html', '/app.js', '/styles.css']);

  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return;
      }

      const url = new URL(req.url ?? '/', 'http://localhost');
      const pathname = url.pathname;

      if (req.method === 'GET' && pathname === '/api/health') {
        sendJson(res, 200, {
          status: 'ok',
          placeCount: store.listPlaces().length,
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/places') {
        const region = url.searchParams.get('region') || null;
        const category = url.searchParams.get('category') || null;
        const wifiParam = url.searchParams.get('wifi');
        const wifi =
          wifiParam === 'true' ? true : wifiParam === 'false' ? false : null;
        const outlets = url.searchParams.get('outlets') || null;
        const laptopPolicy = url.searchParams.get('laptopPolicy') || null;
        const hideStale = url.searchParams.get('hideStale') === 'true';
        const minConfParam = url.searchParams.get('minConfidence');
        const minConfidence =
          minConfParam !== null && minConfParam !== ''
            ? Number(minConfParam)
            : null;

        const places = store.queryPlacesWithClaims({
          region,
          category,
          wifi,
          outlets,
          laptopPolicy,
          hideStale,
          minConfidence,
          now: nowFn(),
        });

        sendJson(res, 200, { places });
        return;
      }

      const placeDetailMatch = pathname.match(/^\/api\/places\/([^/]+)$/);
      if (req.method === 'GET' && placeDetailMatch) {
        const placeId = decodeURIComponent(placeDetailMatch[1]);
        const place = store.getPlace(placeId);
        if (!place) {
          sendJson(res, 404, { error: 'Place not found' });
          return;
        }
        const claims = store.getClaimsForPlace(placeId, nowFn());
        sendJson(res, 200, { place: formatPlaceResponse(place, claims) });
        return;
      }

      const placeVerifyMatch = pathname.match(/^\/api\/places\/([^/]+)\/verify$/);
      if (req.method === 'POST' && placeVerifyMatch) {
        const placeId = decodeURIComponent(placeVerifyMatch[1]);
        const place = store.getPlace(placeId);
        if (!place) {
          sendJson(res, 404, { error: 'Place not found' });
          return;
        }

        let body;
        try {
          body = await readJsonBody(req);
        } catch (err) {
          if (err.message === 'PAYLOAD_TOO_LARGE') {
            sendJson(res, 413, { error: 'Payload too large' });
            return;
          }
          sendJson(res, 400, { error: 'Invalid JSON request body' });
          return;
        }

        const validation = validateVerifyPayload(body);
        if (!validation.ok) {
          sendJson(res, 400, { error: validation.error });
          return;
        }

        const now = nowFn();
        const { attributeKey, value, actorId } = validation.data;

        if (
          store.hasRecentVerification({
            placeId,
            attributeKey,
            actorId,
            now,
          })
        ) {
          sendJson(res, 429, { error: 'Already verified recently' });
          return;
        }

        const claim = store.applySignal({
          placeId,
          attributeKey,
          value,
          sourceType: 'user_micro_verify',
          actorId,
          observedAt: now,
        });
        const claims = store.getClaimsForPlace(placeId, now);

        sendJson(res, 200, {
          claim,
          place: formatPlaceResponse(place, claims),
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/reverification-queue') {
        const region = url.searchParams.get('region') || null;
        const limitParam = Number(url.searchParams.get('limit') ?? 50);
        const limit =
          Number.isFinite(limitParam) && limitParam > 0
            ? Math.min(200, Math.floor(limitParam))
            : 50;

        const queue = store.getReverificationQueue({
          now: nowFn(),
          region,
          limit,
        });
        sendJson(res, 200, { queue });
        return;
      }

      if (req.method === 'GET' && staticRoutes.has(pathname)) {
        const relFile = pathname === '/' ? 'index.html' : pathname.slice(1);
        const filePath = join(publicDir, relFile);
        const content = await readFile(filePath);
        const contentType =
          MIME_TYPES[extname(filePath)] ?? 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      sendJson(res, 500, { error: err.message || 'Internal server error' });
    }
  });
}
