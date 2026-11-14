import {
  FRESHNESS_STATE,
  getSourceTrust,
  getTierConfig,
} from './schema.js';

const MS_PER_DAY = 86_400_000;

/**
 * Exponential half-life decay: C(t) = C0 * 0.5^(dt_days / halfLifeDays)
 */
export function computeDecayedConfidence({
  baseConfidence,
  lastVerifiedAt,
  now = new Date(),
  halfLifeDays,
}) {
  const verifiedMs = new Date(lastVerifiedAt).getTime();
  const nowMs = new Date(now).getTime();
  if (Number.isNaN(verifiedMs) || Number.isNaN(nowMs)) {
    throw new Error('Invalid timestamp passed to computeDecayedConfidence');
  }
  const elapsedDays = Math.max(0, (nowMs - verifiedMs) / MS_PER_DAY);
  const decayed = baseConfidence * Math.pow(0.5, elapsedDays / halfLifeDays);
  return Math.max(0, Math.min(1, decayed));
}

export function classifyFreshness(confidence, tierConfig) {
  if (confidence >= tierConfig.freshThreshold) {
    return FRESHNESS_STATE.FRESH;
  }
  if (confidence >= tierConfig.agingThreshold) {
    return FRESHNESS_STATE.AGING;
  }
  return FRESHNESS_STATE.STALE;
}

export function evaluateClaimFreshness(claim, now = new Date()) {
  const tierConfig = getTierConfig(claim.attributeKey);
  const effectiveConfidence = computeDecayedConfidence({
    baseConfidence: claim.confidence,
    lastVerifiedAt: claim.lastVerifiedAt,
    now,
    halfLifeDays: tierConfig.halfLifeDays,
  });
  const state = classifyFreshness(effectiveConfidence, tierConfig);
  return {
    ...claim,
    effectiveConfidence: Number(effectiveConfidence.toFixed(4)),
    freshnessState: state,
    needsReverification:
      Boolean(claim.needsReverification) || state === FRESHNESS_STATE.STALE,
  };
}

function normalizeValue(value) {
  return JSON.stringify(value);
}

/**
 * Reconciles an incoming observation against an existing AttributeClaim.
 * - If no existing claim exists, initializes one from the source's trust weight.
 * - If the observed value agrees with the existing claim, boosts confidence
 *   toward 1.0 and refreshes lastVerifiedAt.
 * - If the observed value contradicts the existing claim, compares the
 *   incoming source's trust against the decayed existing confidence:
 *     - Stronger incoming signal replaces the value with damped confidence and
 *       flags needsReverification if contested.
 *     - Weaker incoming signal penalizes existing confidence and flags
 *       needsReverification so the UI/queue can prompt another check.
 */
export function reconcileClaim(existingClaim, incomingSignal, now = new Date()) {
  const nowIso = new Date(now).toISOString();
  const incomingTrust = getSourceTrust(incomingSignal.sourceType);

  if (!existingClaim) {
    return {
      placeId: incomingSignal.placeId,
      attributeKey: incomingSignal.attributeKey,
      value: incomingSignal.value,
      sourceType: incomingSignal.sourceType,
      confidence: Number(incomingTrust.toFixed(4)),
      lastVerifiedAt: nowIso,
      verificationCount: 1,
      disputeCount: 0,
      needsReverification: false,
    };
  }

  const tierConfig = getTierConfig(existingClaim.attributeKey);
  const currentDecayed = computeDecayedConfidence({
    baseConfidence: existingClaim.confidence,
    lastVerifiedAt: existingClaim.lastVerifiedAt,
    now,
    halfLifeDays: tierConfig.halfLifeDays,
  });

  const isAgreement =
    normalizeValue(existingClaim.value) === normalizeValue(incomingSignal.value);

  if (isAgreement) {
    // Independent confirmation reduces residual uncertainty: 1 - (1 - c)*(1 - w*0.6)
    const boosted = Math.min(
      1,
      1 - (1 - Math.max(currentDecayed, incomingTrust * 0.8)) * (1 - incomingTrust * 0.5)
    );
    return {
      ...existingClaim,
      value: existingClaim.value,
      sourceType: incomingSignal.sourceType,
      confidence: Number(boosted.toFixed(4)),
      lastVerifiedAt: nowIso,
      verificationCount: existingClaim.verificationCount + 1,
      needsReverification: false,
    };
  }

  // Contradiction handling
  const nextDisputeCount = existingClaim.disputeCount + 1;
  if (incomingTrust >= currentDecayed) {
    // Incoming signal is at least as credible as the decayed prior: flip value,
    // but temper confidence because the attribute was contested.
    const temperedConfidence = Math.max(0.45, incomingTrust * 0.85);
    return {
      ...existingClaim,
      value: incomingSignal.value,
      sourceType: incomingSignal.sourceType,
      confidence: Number(temperedConfidence.toFixed(4)),
      lastVerifiedAt: nowIso,
      verificationCount: existingClaim.verificationCount + 1,
      disputeCount: nextDisputeCount,
      needsReverification: true,
    };
  }

  // Existing claim still outweighs the single contradicting signal, but loses confidence.
  const penalized = Math.max(0.1, currentDecayed * (1 - incomingTrust * 0.45));
  return {
    ...existingClaim,
    confidence: Number(penalized.toFixed(4)),
    disputeCount: nextDisputeCount,
    needsReverification: true,
  };
}
