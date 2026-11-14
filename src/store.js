import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { formatPlaceResponse } from './contracts.js';
import { evaluateClaimFreshness, reconcileClaim } from './freshness.js';
import { PLACE_STATUS } from './schema.js';

export class FreshnessStore {
  constructor(dbPath = ':memory:') {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.#initSchema();
  }

  #initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS places (
        place_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        region TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS place_source_refs (
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        place_id TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        PRIMARY KEY (source_type, source_id),
        FOREIGN KEY (place_id) REFERENCES places(place_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS attribute_claims (
        place_id TEXT NOT NULL,
        attribute_key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        source_type TEXT NOT NULL,
        confidence REAL NOT NULL,
        last_verified_at TEXT NOT NULL,
        verification_count INTEGER NOT NULL DEFAULT 1,
        dispute_count INTEGER NOT NULL DEFAULT 0,
        needs_reverification INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (place_id, attribute_key),
        FOREIGN KEY (place_id) REFERENCES places(place_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS verification_events (
        event_id TEXT PRIMARY KEY,
        place_id TEXT NOT NULL,
        attribute_key TEXT NOT NULL,
        observed_value_json TEXT NOT NULL,
        source_type TEXT NOT NULL,
        actor_id TEXT,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (place_id) REFERENCES places(place_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_claims_reverify
        ON attribute_claims (needs_reverification, last_verified_at);
      CREATE INDEX IF NOT EXISTS idx_events_place_time
        ON verification_events (place_id, timestamp);
    `);
  }

  close() {
    this.db.close();
  }

  getPlaceBySourceRef(sourceType, sourceId) {
    const row = this.db
      .prepare(
        `SELECT p.*
         FROM places p
         JOIN place_source_refs r ON r.place_id = p.place_id
         WHERE r.source_type = ? AND r.source_id = ?`
      )
      .get(sourceType, sourceId);
    return row ? this.#mapPlaceRow(row) : null;
  }

  listPlaces({ region = null } = {}) {
    const rows = region
      ? this.db
          .prepare('SELECT * FROM places WHERE region = ? ORDER BY name ASC')
          .all(region)
      : this.db.prepare('SELECT * FROM places ORDER BY name ASC').all();
    return rows.map((r) => this.#mapPlaceRow(r));
  }

  upsertPlace({
    placeId = randomUUID(),
    name,
    category,
    lat,
    lon,
    region = null,
    status = PLACE_STATUS.ACTIVE,
    sourceType,
    sourceId,
    observedAt = new Date(),
  }) {
    const nowIso = new Date(observedAt).toISOString();
    const existing = this.db
      .prepare('SELECT * FROM places WHERE place_id = ?')
      .get(placeId);

    if (existing) {
      this.db
        .prepare(
          `UPDATE places
           SET name = ?, category = ?, lat = ?, lon = ?, region = COALESCE(?, region), status = ?, updated_at = ?
           WHERE place_id = ?`
        )
        .run(name, category, lat, lon, region, status, nowIso, placeId);
    } else {
      this.db
        .prepare(
          `INSERT INTO places (place_id, name, category, lat, lon, region, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(placeId, name, category, lat, lon, region, status, nowIso, nowIso);
    }

    if (sourceType && sourceId) {
      this.db
        .prepare(
          `INSERT INTO place_source_refs (source_type, source_id, place_id, last_seen_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (source_type, source_id)
           DO UPDATE SET place_id = excluded.place_id, last_seen_at = excluded.last_seen_at`
        )
        .run(sourceType, sourceId, placeId, nowIso);
    }

    return this.getPlace(placeId);
  }

  getPlace(placeId) {
    const row = this.db
      .prepare('SELECT * FROM places WHERE place_id = ?')
      .get(placeId);
    return row ? this.#mapPlaceRow(row) : null;
  }

  getClaim(placeId, attributeKey) {
    const row = this.db
      .prepare(
        `SELECT * FROM attribute_claims
         WHERE place_id = ? AND attribute_key = ?`
      )
      .get(placeId, attributeKey);
    return row ? this.#mapClaimRow(row) : null;
  }

  getClaimsForPlace(placeId, now = new Date()) {
    const rows = this.db
      .prepare('SELECT * FROM attribute_claims WHERE place_id = ?')
      .all(placeId);
    return rows.map((row) => evaluateClaimFreshness(this.#mapClaimRow(row), now));
  }

  applySignal({
    placeId,
    attributeKey,
    value,
    sourceType,
    actorId = null,
    observedAt = new Date(),
  }) {
    const nowIso = new Date(observedAt).toISOString();
    const existing = this.getClaim(placeId, attributeKey);
    const updated = reconcileClaim(
      existing,
      { placeId, attributeKey, value, sourceType },
      observedAt
    );

    this.db
      .prepare(
        `INSERT INTO attribute_claims (
          place_id, attribute_key, value_json, source_type, confidence,
          last_verified_at, verification_count, dispute_count, needs_reverification
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (place_id, attribute_key) DO UPDATE SET
          value_json = excluded.value_json,
          source_type = excluded.source_type,
          confidence = excluded.confidence,
          last_verified_at = excluded.last_verified_at,
          verification_count = excluded.verification_count,
          dispute_count = excluded.dispute_count,
          needs_reverification = excluded.needs_reverification`
      )
      .run(
        updated.placeId,
        updated.attributeKey,
        JSON.stringify(updated.value),
        updated.sourceType,
        updated.confidence,
        updated.lastVerifiedAt,
        updated.verificationCount,
        updated.disputeCount,
        updated.needsReverification ? 1 : 0
      );

    this.db
      .prepare(
        `INSERT INTO verification_events (
          event_id, place_id, attribute_key, observed_value_json,
          source_type, actor_id, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        placeId,
        attributeKey,
        JSON.stringify(value),
        sourceType,
        actorId,
        nowIso
      );

    return evaluateClaimFreshness(updated, observedAt);
  }

  /**
   * Marks places linked to `sourceType` as `suspected_closed` if they were not
   * seen in the latest authoritative snapshot at `observedAt`.
   */
  markMissingFromSnapshot(sourceType, observedAt) {
    const nowIso = new Date(observedAt).toISOString();
    const missingRows = this.db
      .prepare(
        `SELECT DISTINCT p.place_id
         FROM places p
         JOIN place_source_refs r ON r.place_id = p.place_id
         WHERE r.source_type = ?
           AND r.last_seen_at < ?
           AND p.status = 'active'`
      )
      .all(sourceType, nowIso);

    if (missingRows.length === 0) {
      return [];
    }

    const updateStmt = this.db.prepare(
      `UPDATE places SET status = ?, updated_at = ? WHERE place_id = ?`
    );
    for (const row of missingRows) {
      updateStmt.run(PLACE_STATUS.SUSPECTED_CLOSED, nowIso, row.place_id);
    }
    return missingRows.map((r) => r.place_id);
  }

  hasRecentVerification({
    placeId,
    attributeKey,
    actorId,
    withinMs = 300_000,
    now = new Date(),
  }) {
    if (!actorId) return false;
    const row = this.db
      .prepare(
        `SELECT timestamp
         FROM verification_events
         WHERE place_id = ? AND attribute_key = ? AND actor_id = ?
         ORDER BY timestamp DESC
         LIMIT 1`
      )
      .get(placeId, attributeKey, actorId);

    if (!row) return false;
    const elapsedMs = new Date(now).getTime() - new Date(row.timestamp).getTime();
    return elapsedMs >= 0 && elapsedMs < withinMs;
  }

  queryPlacesWithClaims({
    region = null,
    category = null,
    wifi = null,
    outlets = null,
    laptopPolicy = null,
    hideStale = false,
    minConfidence = null,
    now = new Date(),
  } = {}) {
    const places = this.listPlaces({ region: region || null });
    const results = [];

    for (const place of places) {
      if (category && place.category !== category) continue;

      const claims = this.getClaimsForPlace(place.placeId, now);
      const formatted = formatPlaceResponse(place, claims);

      if (wifi !== null) {
        const wifiClaim = formatted.attributes.wifi;
        if (!wifiClaim || Boolean(wifiClaim.value) !== Boolean(wifi)) continue;
      }

      if (outlets) {
        const outletsVal = formatted.attributes.outlets?.value;
        if (outlets === 'available') {
          if (outletsVal !== 'plenty' && outletsVal !== 'limited') continue;
        } else if (outletsVal !== outlets) {
          continue;
        }
      }

      if (laptopPolicy) {
        const lpVal = formatted.attributes.laptop_policy?.value;
        if (laptopPolicy === 'friendly') {
          if (lpVal !== 'all_day' && lpVal !== 'quiet_zone_only') continue;
        } else if (lpVal !== laptopPolicy) {
          continue;
        }
      }

      if (hideStale) {
        if (
          formatted.status === PLACE_STATUS.SUSPECTED_CLOSED ||
          formatted.status === PLACE_STATUS.CLOSED ||
          formatted.overallConfidence === null ||
          formatted.overallConfidence < 0.4
        ) {
          continue;
        }
      }

      if (minConfidence !== null && !Number.isNaN(Number(minConfidence))) {
        if (
          formatted.overallConfidence === null ||
          formatted.overallConfidence < Number(minConfidence)
        ) {
          continue;
        }
      }

      results.push(formatted);
    }

    return results;
  }

  /**
   * Returns a prioritized reverification queue sorted by lowest effective
   * confidence (and contested/disputed claims first).
   */
  getReverificationQueue({ now = new Date(), region = null, limit = 50 } = {}) {
    const rows = region
      ? this.db
          .prepare(
            `SELECT c.*, p.name AS place_name, p.status AS place_status, p.region AS place_region
             FROM attribute_claims c
             JOIN places p ON p.place_id = c.place_id
             WHERE p.status != 'closed' AND p.region = ?`
          )
          .all(region)
      : this.db
          .prepare(
            `SELECT c.*, p.name AS place_name, p.status AS place_status, p.region AS place_region
             FROM attribute_claims c
             JOIN places p ON p.place_id = c.place_id
             WHERE p.status != 'closed'`
          )
          .all();

    return rows
      .map((row) => {
        const evaluated = evaluateClaimFreshness(this.#mapClaimRow(row), now);
        return {
          ...evaluated,
          placeName: row.place_name,
          placeStatus: row.place_status,
          region: row.place_region,
        };
      })
      .filter((c) => c.needsReverification || c.freshnessState !== 'fresh')
      .sort((a, b) => {
        if (a.needsReverification !== b.needsReverification) {
          return a.needsReverification ? -1 : 1;
        }
        return a.effectiveConfidence - b.effectiveConfidence;
      })
      .slice(0, limit);
  }

  #mapPlaceRow(row) {
    return {
      placeId: row.place_id,
      name: row.name,
      category: row.category,
      lat: row.lat,
      lon: row.lon,
      region: row.region ?? null,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  #mapClaimRow(row) {
    return {
      placeId: row.place_id,
      attributeKey: row.attribute_key,
      value: JSON.parse(row.value_json),
      sourceType: row.source_type,
      confidence: row.confidence,
      lastVerifiedAt: row.last_verified_at,
      verificationCount: row.verification_count,
      disputeCount: row.dispute_count,
      needsReverification: Boolean(row.needs_reverification),
    };
  }
}
