const state = {
  region: '',
  tab: 'explore',
  places: [],
  queue: [],
  selectedPlaceId: null,
  selectedPlace: null,
};

function getActorId() {
  const key = 'thirdplace_actor_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `web-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCategory(cat) {
  return String(cat ?? '').replace(/_/g, ' ');
}

function formatRegionLabel(region) {
  if (region === 'brooklyn') return 'Brooklyn';
  if (region === 'westchester') return 'Westchester';
  return region || 'Regional';
}

function overallFreshnessClass(place) {
  if (place.status === 'suspected_closed' || place.status === 'closed') {
    return 'suspected_closed';
  }
  const conf = place.overallConfidence;
  if (conf === null || conf === undefined) return 'stale';
  if (conf >= 0.7) return 'fresh';
  if (conf >= 0.4) return 'aging';
  return 'stale';
}

function formatClaimValue(value) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value).replace(/_/g, ' ');
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3200);
}

function buildPlacesQuery() {
  const params = new URLSearchParams();
  if (state.region) params.set('region', state.region);

  const category = document.getElementById('filter-category').value;
  if (category) params.set('category', category);

  if (document.getElementById('filter-wifi').checked) {
    params.set('wifi', 'true');
  }
  if (document.getElementById('filter-outlets').checked) {
    params.set('outlets', 'available');
  }
  if (document.getElementById('filter-laptop').checked) {
    params.set('laptopPolicy', 'friendly');
  }
  if (document.getElementById('filter-hide-stale').checked) {
    params.set('hideStale', 'true');
  }

  return params.toString();
}

async function fetchPlaces() {
  const qs = buildPlacesQuery();
  const res = await fetch(`/api/places${qs ? `?${qs}` : ''}`);
  const data = await res.json();
  state.places = data.places ?? [];

  if (state.selectedPlaceId) {
    const match = state.places.find((p) => p.placeId === state.selectedPlaceId);
    if (match) {
      state.selectedPlace = match;
    }
  }

  renderPlacesList();
  renderMap();
  renderDetailPanel();
}

async function fetchQueue() {
  const params = new URLSearchParams();
  if (state.region) params.set('region', state.region);
  const res = await fetch(`/api/reverification-queue?${params.toString()}`);
  const data = await res.json();
  state.queue = data.queue ?? [];
  document.getElementById('queue-badge').textContent = String(state.queue.length);
  renderQueueList();
}

async function selectPlace(placeId) {
  state.selectedPlaceId = placeId;
  const res = await fetch(`/api/places/${encodeURIComponent(placeId)}`);
  if (res.ok) {
    const data = await res.json();
    state.selectedPlace = data.place;
  }
  renderPlacesList();
  renderMap();
  renderDetailPanel();
}

async function submitVerification(placeId, attributeKey, value) {
  const res = await fetch(`/api/places/${encodeURIComponent(placeId)}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attributeKey,
      value,
      actorId: getActorId(),
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    showToast(data.error || 'Verification failed', true);
    return;
  }

  state.selectedPlace = data.place;
  showToast(`Verified ${attributeKey.replace(/_/g, ' ')}: ${formatClaimValue(value)}`);
  await Promise.all([fetchPlaces(), fetchQueue()]);
}

function renderMap() {
  const svg = document.getElementById('spatial-map');
  const width = 640;
  const height = 480;
  const pad = 44;

  const places = state.places;
  if (places.length === 0) {
    svg.innerHTML = `<text x="320" y="240" text-anchor="middle" fill="#64748b" font-size="14">No places match the current filters</text>`;
    return;
  }

  let minLat = Math.min(...places.map((p) => p.lat));
  let maxLat = Math.max(...places.map((p) => p.lat));
  let minLon = Math.min(...places.map((p) => p.lon));
  let maxLon = Math.max(...places.map((p) => p.lon));

  if (maxLat - minLat < 0.02) {
    minLat -= 0.01;
    maxLat += 0.01;
  }
  if (maxLon - minLon < 0.02) {
    minLon -= 0.01;
    maxLon += 0.01;
  }

  const projectX = (lon) =>
    pad + ((lon - minLon) / (maxLon - minLon)) * (width - pad * 2);
  const projectY = (lat) =>
    height - pad - ((lat - minLat) / (maxLat - minLat)) * (height - pad * 2);

  const colorMap = {
    fresh: '#10b981',
    aging: '#f59e0b',
    stale: '#ef4444',
    suspected_closed: '#64748b',
  };

  const gridLines = [];
  for (let i = 1; i <= 4; i += 1) {
    const x = (width / 5) * i;
    const y = (height / 5) * i;
    gridLines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#e2e8f0" stroke-dasharray="4 4" />`);
    gridLines.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#e2e8f0" stroke-dasharray="4 4" />`);
  }

  const pins = places
    .map((p) => {
      const cx = projectX(p.lon).toFixed(1);
      const cy = projectY(p.lat).toFixed(1);
      const cls = overallFreshnessClass(p);
      const color = colorMap[cls] ?? '#ef4444';
      const isSelected = p.placeId === state.selectedPlaceId;
      const radius = isSelected ? 10 : 7;
      const stroke = isSelected ? '#141922' : '#ffffff';
      const strokeWidth = isSelected ? 3 : 2;
      const label = escapeHtml(p.name.length > 22 ? `${p.name.slice(0, 21)}…` : p.name);

      return `
        <g class="map-pin" data-place-id="${escapeHtml(p.placeId)}" style="cursor:pointer">
          <circle cx="${cx}" cy="${cy}" r="${radius}" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}" />
          <text x="${cx}" y="${Number(cy) - 12}" text-anchor="middle" font-size="10.5" font-weight="${isSelected ? '700' : '500'}" fill="#1e293b">${label}</text>
        </g>
      `;
    })
    .join('');

  svg.innerHTML = `${gridLines.join('')}${pins}`;

  svg.querySelectorAll('.map-pin').forEach((pin) => {
    pin.addEventListener('click', () => {
      selectPlace(pin.getAttribute('data-place-id'));
    });
  });
}

function renderPlacesList() {
  const container = document.getElementById('places-list');
  document.getElementById('places-count').textContent = String(state.places.length);

  if (state.places.length === 0) {
    container.innerHTML = `<p class="empty-state">No third places match those filters.</p>`;
    return;
  }

  const highlightKeys = ['wifi', 'outlets', 'laptop_policy', 'hours', 'crowdedness'];

  container.innerHTML = state.places
    .map((place) => {
      const cls = overallFreshnessClass(place);
      const confPct =
        place.overallConfidence !== null
          ? `${Math.round(place.overallConfidence * 100)}% conf`
          : 'Unverified';
      const selectedCls = place.placeId === state.selectedPlaceId ? 'selected' : '';

      const chips = highlightKeys
        .filter((k) => place.attributes?.[k])
        .map((k) => {
          const claim = place.attributes[k];
          return `
            <span class="attr-chip">
              <i class="dot ${escapeHtml(claim.freshnessState)}"></i>
              <strong>${escapeHtml(k.replace(/_/g, ' '))}:</strong>
              ${escapeHtml(formatClaimValue(claim.value))}
            </span>
          `;
        })
        .join('');

      return `
        <article class="place-card ${selectedCls}" data-place-id="${escapeHtml(place.placeId)}">
          <div class="card-top">
            <div>
              <h3 class="card-title">${escapeHtml(place.name)}</h3>
              <div class="card-meta">
                ${escapeHtml(formatRegionLabel(place.region))} · ${escapeHtml(formatCategory(place.category))}
                ${place.status === 'suspected_closed' ? ' · <strong>Suspected Closed</strong>' : ''}
              </div>
            </div>
            <span class="conf-pill ${cls}">${escapeHtml(confPct)}</span>
          </div>
          <div class="chips-row">${chips}</div>
        </article>
      `;
    })
    .join('');

  container.querySelectorAll('.place-card').forEach((card) => {
    card.addEventListener('click', () => {
      selectPlace(card.getAttribute('data-place-id'));
    });
  });
}

function renderDetailPanel() {
  const panel = document.getElementById('detail-panel');
  const content = document.getElementById('detail-content');
  const place = state.selectedPlace;

  if (!place) {
    panel.classList.add('empty');
    content.innerHTML = `<p class="empty-state">Select a place on the map or list to inspect attribute freshness and submit 1-tap micro-verifications.</p>`;
    return;
  }

  panel.classList.remove('empty');
  const cls = overallFreshnessClass(place);
  const confText =
    place.overallConfidence !== null
      ? `${Math.round(place.overallConfidence * 100)}% overall confidence`
      : 'No claims yet';

  const claimsHtml = (place.claims ?? [])
    .map((c) => {
      const pct = Math.round(c.effectiveConfidence * 100);
      const dateStr = new Date(c.lastVerifiedAt).toLocaleDateString();
      return `
        <div class="claim-row">
          <div>
            <div>
              <i class="dot ${escapeHtml(c.freshnessState)}"></i>
              <strong>${escapeHtml(c.attributeKey.replace(/_/g, ' '))}:</strong>
              ${escapeHtml(formatClaimValue(c.value))}
            </div>
            <div class="claim-sub">
              Verified ${escapeHtml(dateStr)} · ${c.verificationCount} checks · ${c.disputeCount} disputes
            </div>
          </div>
          <span class="conf-pill ${escapeHtml(c.freshnessState)}">${pct}%</span>
        </div>
      `;
    })
    .join('');

  content.innerHTML = `
    <div class="detail-header">
      <h2>${escapeHtml(place.name)}</h2>
      <div class="card-meta">
        ${escapeHtml(formatRegionLabel(place.region))} · ${escapeHtml(formatCategory(place.category))} ·
        <span class="conf-pill ${cls}">${escapeHtml(confText)}</span>
      </div>
    </div>

    <div class="claims-table">${claimsHtml}</div>

    <div class="verify-box">
      <h3>1-Tap Micro-Verification</h3>
      <div class="verify-group">
        <span class="verify-label">Still has Wi-Fi?</span>
        <div class="verify-buttons">
          <button class="tap-btn" data-attr="wifi" data-val="true" data-type="bool">Yes</button>
          <button class="tap-btn" data-attr="wifi" data-val="false" data-type="bool">No</button>
        </div>
      </div>

      <div class="verify-group">
        <span class="verify-label">Outlets available?</span>
        <div class="verify-buttons">
          <button class="tap-btn" data-attr="outlets" data-val="plenty">Plenty</button>
          <button class="tap-btn" data-attr="outlets" data-val="limited">Limited</button>
          <button class="tap-btn" data-attr="outlets" data-val="none">None</button>
        </div>
      </div>

      <div class="verify-group">
        <span class="verify-label">Laptop policy?</span>
        <div class="verify-buttons">
          <button class="tap-btn" data-attr="laptop_policy" data-val="all_day">All Day</button>
          <button class="tap-btn" data-attr="laptop_policy" data-val="quiet_zone_only">Quiet Zone Only</button>
          <button class="tap-btn" data-attr="laptop_policy" data-val="no_weekends">No Weekends</button>
          <button class="tap-btn" data-attr="laptop_policy" data-val="no_laptops">No Laptops</button>
        </div>
      </div>

      <div class="verify-group">
        <span class="verify-label">Crowdedness right now?</span>
        <div class="verify-buttons">
          <button class="tap-btn" data-attr="crowdedness" data-val="quiet">Quiet</button>
          <button class="tap-btn" data-attr="crowdedness" data-val="moderate">Moderate</button>
          <button class="tap-btn" data-attr="crowdedness" data-val="packed">Packed</button>
        </div>
      </div>
    </div>
  `;

  content.querySelectorAll('.tap-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const attr = btn.getAttribute('data-attr');
      const rawVal = btn.getAttribute('data-val');
      const type = btn.getAttribute('data-type');
      const val = type === 'bool' ? rawVal === 'true' : rawVal;
      submitVerification(place.placeId, attr, val);
    });
  });
}

function renderQueueList() {
  const container = document.getElementById('queue-list');
  if (state.queue.length === 0) {
    container.innerHTML = `<p class="empty-state">All claims in this region are fresh and uncontested.</p>`;
    return;
  }

  container.innerHTML = state.queue
    .map((item) => {
      const pct = Math.round(item.effectiveConfidence * 100);
      return `
        <article class="queue-card">
          <div class="card-top">
            <div>
              <strong>${escapeHtml(item.placeName)}</strong>
              <div class="card-meta">${escapeHtml(formatRegionLabel(item.region))}</div>
            </div>
            <span class="conf-pill ${escapeHtml(item.freshnessState)}">${pct}% · ${escapeHtml(item.freshnessState)}</span>
          </div>
          <div>
            <strong>${escapeHtml(item.attributeKey.replace(/_/g, ' '))}:</strong>
            ${escapeHtml(formatClaimValue(item.value))}
          </div>
          <div class="claim-sub">
            Disputes: ${item.disputeCount} · Contested: ${item.needsReverification ? 'Yes' : 'No'}
          </div>
          <button class="tap-btn queue-jump" data-place-id="${escapeHtml(item.placeId)}">Verify this spot</button>
        </article>
      `;
    })
    .join('');

  container.querySelectorAll('.queue-jump').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const placeId = btn.getAttribute('data-place-id');
      switchTab('explore');
      await selectPlace(placeId);
    });
  });
}

function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
  });
  document.getElementById('explore-view').classList.toggle('hidden', tab !== 'explore');
  document.getElementById('filter-bar').classList.toggle('hidden', tab !== 'explore');
  document.getElementById('queue-view').classList.toggle('hidden', tab !== 'queue');
}

function bindControls() {
  document.querySelectorAll('.region-switcher .chip-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      state.region = btn.getAttribute('data-region') || '';
      document.querySelectorAll('.region-switcher .chip-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      await Promise.all([fetchPlaces(), fetchQueue()]);
    });
  });

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTab(btn.getAttribute('data-tab'));
    });
  });

  [
    'filter-category',
    'filter-wifi',
    'filter-outlets',
    'filter-laptop',
    'filter-hide-stale',
  ].forEach((id) => {
    document.getElementById(id).addEventListener('change', fetchPlaces);
  });
}

async function init() {
  bindControls();
  await Promise.all([fetchPlaces(), fetchQueue()]);
}

init();
