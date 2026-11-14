/**
 * Shared API contracts, validation, and response formatting for the
 * Brooklyn & Westchester third-place app.
 */

export const VERIFIABLE_ATTRIBUTES = Object.freeze([
  'wifi',
  'outlets',
  'laptop_policy',
  'noise_level',
  'seating',
  'crowdedness',
  'hours',
  'temp_closure',
]);

export const ALLOWED_CATEGORIES = Object.freeze([
  'cafe',
  'library',
  'park',
  'public_plaza',
  'community_space',
  'coworking_space',
  'public_wifi_spot',
]);

export function validateVerifyPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const { attributeKey, value, actorId } = body;

  if (typeof attributeKey !== 'string' || !VERIFIABLE_ATTRIBUTES.includes(attributeKey)) {
    return {
      ok: false,
      error: `Invalid attributeKey. Expected one of: ${VERIFIABLE_ATTRIBUTES.join(', ')}`,
    };
  }

  if (value === undefined || value === null) {
    return { ok: false, error: 'value is required and cannot be null or undefined' };
  }

  if (typeof value === 'string' && value.trim().length === 0) {
    return { ok: false, error: 'value cannot be an empty string' };
  }

  const normalizedActorId =
    typeof actorId === 'string' && actorId.trim().length > 0
      ? actorId.trim()
      : 'anon-web';

  return {
    ok: true,
    data: {
      attributeKey,
      value: typeof value === 'string' ? value.trim() : value,
      actorId: normalizedActorId,
    },
  };
}

export function formatPlaceResponse(place, claims = []) {
  const overallConfidence =
    claims.length > 0
      ? Number(
          (
            claims.reduce((sum, c) => sum + c.effectiveConfidence, 0) / claims.length
          ).toFixed(4)
        )
      : null;

  let staleClaimCount = 0;
  let needsReverificationCount = 0;
  const attributes = {};

  for (const claim of claims) {
    if (claim.freshnessState === 'stale') {
      staleClaimCount += 1;
    }
    if (claim.needsReverification) {
      needsReverificationCount += 1;
    }
    attributes[claim.attributeKey] = claim;
  }

  return {
    ...place,
    overallConfidence,
    staleClaimCount,
    needsReverificationCount,
    attributes,
    claims,
  };
}
