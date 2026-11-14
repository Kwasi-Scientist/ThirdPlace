# ThirdPlace

Freshness-verified third-place discovery app for **Brooklyn** and **Westchester County, NY**.

Unlike standard POI directories, ThirdPlace models ephemeral, high-churn attributes (`wifi`, `outlets`, `laptop_policy`, `noise_level`, `crowdedness`, `hours`) with tiered half-life confidence decay, cross-source entity resolution (OpenStreetMap Overpass, NYC Open Data, Westchester Open Data, and Overture), and 1-tap user micro-verifications to surface stale or contested data before users arrive at a closed or unusable spot.

## Key Features

- **Tiered Freshness & Decay Engine:** Exponential half-life decay (`slow`, `medium`, `fast` tiers) and source-weighted claim reconciliation.
- **Reverification Queue:** Automatically prioritizes contested and aging/stale attributes for quick 1-tap community checks.
- **Regional Adapters & Tiled Sync:** Bounding-box filtering and ingestion adapters for Brooklyn and Westchester (including tiled Overpass queries and Socrata/GeoJSON municipal feeds).
- **Zero-Build Web UI & REST API:** Built on Node.js v24 (`node:http`, `node:sqlite`, `node:test`) with an interactive spatial map, attribute/freshness filters, and duplicate-tap throttled micro-verification endpoints.

## Quick Start

```bash
# Run the test suite
node --test

# Start the local web app & API (seeds 10 Brooklyn/Westchester spots if empty)
node src/cli.js serve --port 3000 --db data/thirdplace.db

# Run a regional sync
node src/cli.js sync --region brooklyn --source osm --db data/thirdplace.db
node src/cli.js sync --region westchester --source osm --db data/thirdplace.db
```
