/**
 * Canonical schema, attribute decay tiers, and source trust weights
 * for the third-place freshness pipeline.
 */

export const PLACE_STATUS = Object.freeze({
  ACTIVE: 'active',
  UNVERIFIED: 'unverified',
  SUSPECTED_CLOSED: 'suspected_closed',
  CLOSED: 'closed',
});

export const FRESHNESS_STATE = Object.freeze({
  FRESH: 'fresh',
  AGING: 'aging',
  STALE: 'stale',
});

/**
 * Tiered decay configuration:
 * - slow:   directory/geometry attributes (name, category, address)
 * - medium: third-place utility attributes (wifi, outlets, laptop_policy, hours, seating)
 * - fast:   ephemeral conditions (crowdedness, temp_closure)
 */
export const TIER_CONFIG = Object.freeze({
  slow: Object.freeze({
    halfLifeDays: 365,
    freshThreshold: 0.7,
    agingThreshold: 0.4,
  }),
  medium: Object.freeze({
    halfLifeDays: 75,
    freshThreshold: 0.7,
    agingThreshold: 0.4,
  }),
  fast: Object.freeze({
    halfLifeDays: 3,
    freshThreshold: 0.7,
    agingThreshold: 0.4,
  }),
});

export const ATTRIBUTE_TIERS = Object.freeze({
  name: 'slow',
  category: 'slow',
  address: 'slow',
  hours: 'medium',
  wifi: 'medium',
  outlets: 'medium',
  laptop_policy: 'medium',
  noise_level: 'medium',
  seating: 'medium',
  crowdedness: 'fast',
  temp_closure: 'fast',
});

/**
 * Prior trust weights by signal origin (0..1).
 * Authoritative municipal/owner feeds carry higher initial confidence than
 * crowd-sourced or scraped signals.
 */
export const SOURCE_TRUST_WEIGHTS = Object.freeze({
  municipal: 0.95,
  owner: 0.92,
  overture: 0.80,
  osm: 0.75,
  user_micro_verify: 0.72,
  automated_check: 0.65,
});

export function getTierForAttribute(attributeKey) {
  return ATTRIBUTE_TIERS[attributeKey] ?? 'medium';
}

export function getTierConfig(attributeKey) {
  const tier = getTierForAttribute(attributeKey);
  return TIER_CONFIG[tier];
}

export function getSourceTrust(sourceType) {
  return SOURCE_TRUST_WEIGHTS[sourceType] ?? 0.5;
}
