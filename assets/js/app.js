// Project Rampa — glavna logika aplikacije

const App = (() => {
  // Stanje
  let state = {
    realtime: {},      // { locationId: { flow, level, temp, timestamp } }
    history: [],       // [ { date, data: { locationId: {...} } } ]
    activeFilter: 'all',
    loading: false,
    lastUpdated: null,
    _leafletMap: null,
  };

  // --- DOM reference ---
  const $ = (id) => document.getElementById(id);
  const grid = () => $('cards-grid');
  const lastUpdatedEl = () => $('last-updated');
  const btnRefresh = () => $('btn-refresh');
  const errorBanner = () => $('error-banner');
  const modalOverlay = () => $('modal-overlay');

  // --- Init ---

  async function init() {
    initTheme();
    renderSkeletons();
    bindEvents();
    await loadData();
  }

  // --- Fetch podatkov ---

  async function loadData() {
    setLoading(true);
    hideError();

    // 1. Najprej naloži realtime (prikaz čim prej)
    try {
      console.log('[Rampa] Nalagam realtime podatke...');
      state.realtime = await ARSO.fetchRealtime();
      state.lastUpdated = new Date();
      console.log('[Rampa] Realtime OK:', state.realtime);
    } catch (err) {
      console.error('[Rampa] Realtime napaka:', err.message);
      const cached = ARSO.loadRealtimeCache();
      if (cached) {
        state.realtime = cached.data;
        state.lastUpdated = new Date(cached.ts);
        console.log('[Rampa] Uporabim cache:', state.realtime);
        // Podatki so iz cache — tiha opomba brez rdečega bannerja
      } else {
        // Ni niti cache — pokažemo napako
        showError();
      }
    }

    setLoading(false);
    updateLastUpdated();
    renderCards();

    // 2. Historia v ozadju (ne blokira prikaza)
    try {
      console.log('[Rampa] Nalagam historijo...');
      state.history = await ARSO.fetchHistory();
      console.log('[Rampa] Historia OK, dni:', state.history.length);
    } catch (err) {
      console.warn('[Rampa] Historia napaka:', err.message);
      state.history = ARSO.loadHistoryCache();
    }
  }

  // --- Renderiranje ---

  function renderSkeletons() {
    grid().innerHTML = CONFIG.locations.map((loc) => `
      <div class="card skeleton" data-id="${loc.id}" data-river="${loc.river}">
        <div class="card-header">
          <div class="card-location">
            <h2>${loc.name}</h2>
            <span class="river-tag">${loc.river}</span>
          </div>
          <span class="status-badge">—</span>
        </div>
        <div class="card-flow">
          <span class="flow-value">—</span>
          <span class="flow-unit">m³/s</span>
        </div>
        <div class="card-meta">
          <span>~ cm</span>
          <span>~ °C</span>
        </div>
        <div class="sparkline-container"></div>
      </div>
    `).join('');
  }

  function renderCards() {
    renderSummary();

    const activeRivers = state.activeFilter === 'all'
      ? CONFIG.rivers
      : [state.activeFilter];

    let html = '';
    for (const river of activeRivers) {
      const locs = CONFIG.locations.filter((l) => l.river === river);
      html += `<div class="river-section">
        <div class="river-heading">
          <span class="river-heading-name">${river}</span>
          <span class="river-heading-line"></span>
        </div>
        <div class="river-cards">`;

      for (const loc of locs) {
        const data = state.realtime[loc.id];
        const status = getFlowStatus(data?.flow ?? null, loc.thresholds);
        const label = getStatusLabel(status);
        const color = getStatusColor(status);
        const sparklineData = ARSO.buildSparkline(state.history, loc.id);
        const flowDisplay = data?.flow != null ? data.flow.toFixed(1) : '—';
        const levelDisplay = data?.level != null ? `${data.level.toFixed(0)} cm` : '~ cm';
        const tempDisplay = data?.temp != null ? `${data.temp.toFixed(1)} °C` : '~ °C';

        html += `
          <article
            class="card"
            data-id="${loc.id}"
            data-river="${loc.river}"
            data-status="${status}"
            style="--status-color: ${color}"
            tabindex="0"
            role="button"
            aria-label="${loc.name} — ${loc.river}, pretok: ${flowDisplay} m³/s, ${label}"
          >
            <div class="card-header">
              <div class="card-location">
                <h2>${loc.name}</h2>
                <span class="card-arso">ARSO · ${loc.arsoName}</span>
              </div>
              <span class="status-badge">${label}</span>
            </div>
            <div class="card-flow">
              <span class="flow-value">${flowDisplay}</span>
              <span class="flow-unit">m³/s</span>
            </div>
            <div class="card-meta">
              <span title="Vodostaj">📏 ${levelDisplay}</span>
              <span title="Temperatura vode">🌡 ${tempDisplay}</span>
            </div>
            <div class="sparkline-container">
              ${renderSparklineSvg(sparklineData, color)}
            </div>
          </article>`;
      }
      html += `</div></div>`;
    }

    grid().innerHTML = html;

    grid().querySelectorAll('.card').forEach((card) => {
      card.addEventListener('click', () => openModal(card.dataset.id));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') openModal(card.dataset.id);
      });
    });
  }

  function renderSummary() {
    const counts = { ok: 0, low: 0, high: 0, danger: 0, unknown: 0 };
    for (const loc of CONFIG.locations) {
      const data = state.realtime[loc.id];
      const status = getFlowStatus(data?.flow ?? null, loc.thresholds);
      counts[status] = (counts[status] || 0) + 1;
    }

    const parts = [];
    if (counts.ok)      parts.push(`<span class="sum-ok">✓ ${counts.ok} primerno</span>`);
    if (counts.high)    parts.push(`<span class="sum-high">⚠ ${counts.high} visoko</span>`);
    if (counts.danger)  parts.push(`<span class="sum-danger">✕ ${counts.danger} nevarno</span>`);
    if (counts.low)     parts.push(`<span class="sum-low">↓ ${counts.low} prenizko</span>`);
    if (counts.unknown) parts.push(`<span class="sum-unknown">? ${counts.unknown} ni podatka</span>`);

    $('summary-bar').innerHTML = parts.join('');
  }

  // --- Sparkline (inline SVG) ---

  function renderSparklineSvg(points, color) {
    if (!points.length) return '<svg></svg>';

    const W = 260, H = 40, pad = 4;
    const values = points.map((p) => p.flow);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const coords = values.map((v, i) => {
      const x = pad + (i / (values.length - 1 || 1)) * (W - 2 * pad);
      const y = H - pad - ((v - min) / range) * (H - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    return `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <polyline
          points="${coords.join(' ')}"
          fill="none"
          stroke="${color}"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          opacity="0.7"
        />
      </svg>
    `;
  }

  // --- Filter ---

  function applyFilter(river) {
    state.activeFilter = river;

    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.river === river);
    });

    // Rerenderiramo — grupiranje po rekah se prilagodi filtru
    renderCards();
  }

  // --- Padavinski mini grafikon (7 dni) ---

  function renderPrecipBars(daily) {
    const DAY_SHORT = ['N', 'P', 'T', 'S', 'Č', 'P', 'S'];
    const { time, precipitation_sum: precip } = daily;
    const maxMm = Math.max(...precip, 5);

    const bars = time.map((d, i) => {
      const mm = precip[i];
      const h = mm > 0 ? Math.max(4, Math.round((mm / maxMm) * 48)) : 2;
      const color = mm > 20 ? '#e74c3c' : mm > 8 ? '#f39c12' : mm > 0 ? '#5b9bd5' : 'rgba(255,255,255,0.1)';
      const label = mm > 0 ? `${mm.toFixed(0)}` : '0';
      const dayName = DAY_SHORT[new Date(d).getDay()];
      return `
        <div class="precip-col">
          <div class="precip-wrap"><div class="precip-bar" style="height:${h}px;background:${color}"></div></div>
          <div class="precip-mm">${label}</div>
          <div class="precip-day">${dayName}</div>
        </div>`;
    }).join('');

    return `<div class="precip-chart">${bars}</div>`;
  }

  // --- Modal ---

  function openModal(locationId) {
    const loc = CONFIG.locations.find((l) => l.id === locationId);
    if (!loc) return;

    const data = state.realtime[locationId];
    const status = getFlowStatus(data?.flow ?? null, loc.thresholds);
    const color = getStatusColor(status);
    const label = getStatusLabel(status);

    // Header
    $('modal-river').textContent = loc.river;
    $('modal-title').textContent = loc.name;

    // Stats
    const flowDisplay = data?.flow != null ? `${data.flow.toFixed(1)} m³/s` : '—';
    const levelDisplay = data?.level != null ? `${data.level.toFixed(0)} cm` : '—';
    const tempDisplay = data?.temp != null ? `${data.temp.toFixed(1)} °C` : '—';

    $('modal-stats').innerHTML = `
      <div class="stat-item">
        <span class="stat-label">Pretok</span>
        <span class="stat-value colored" style="--status-color: ${color}">${flowDisplay}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Status</span>
        <span class="stat-value" style="color: ${color}">${label}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Vodostaj</span>
        <span class="stat-value">${levelDisplay}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Temp. vode</span>
        <span class="stat-value">${tempDisplay}</span>
      </div>
    `;

    // Kluby
    $('modal-clubs').innerHTML = `
      <strong>Kajak klubi / točke:</strong>
      ${loc.clubs.join(', ')}
      <br><small>ARSO postaja: ${loc.arsoName}</small>
    `;

    // Graf
    const historyPoints = ARSO.buildSparkline(state.history, locationId);
    // Dodaj danes
    if (data?.flow != null) {
      const today = formatDateForArso(new Date());
      if (!historyPoints.find((p) => p.date === today)) {
        historyPoints.push({ date: today, flow: data.flow });
      }
    }
    CHARTS.renderDetailChart('detail-chart', {
      location: loc,
      history: historyPoints,
      thresholds: loc.thresholds,
      statusColor: color,
    });

    // Napoved — takoj pokaži "nalagam", potem naloži asinhrono
    const forecastEl = $('modal-forecast');
    forecastEl.innerHTML = `<div class="forecast-loading">⏳ Nalagam vremensko napoved...</div>`;
    FORECAST.getForecast(loc, data?.flow ?? null).then(({ text, daily }) => {
      let html = `<div class="forecast-header">📅 Napoved — 7 dni</div>`;
      html += `<p class="forecast-text">${text}</p>`;
      forecastEl.innerHTML = html;
    });

    modalOverlay().classList.add('open');
    document.body.style.overflow = 'hidden';

    // Leaflet mapa — inicializiraj po kratki zamudi (modal mora biti viden)
    if (state._leafletMap) {
      state._leafletMap.remove();
      state._leafletMap = null;
    }
    setTimeout(() => {
      const mapEl = $('modal-map');
      const map = L.map(mapEl, { center: [loc.lat, loc.lng], zoom: 14 });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
      }).addTo(map);
      L.marker([loc.lat, loc.lng])
        .addTo(map)
        .bindPopup(`<b>${loc.name}</b><br>${loc.clubs.join('<br>')}`)
        .openPopup();
      state._leafletMap = map;
    }, 80);
  }

  function closeModal() {
    modalOverlay().classList.remove('open');
    document.body.style.overflow = '';
    CHARTS.destroyDetailChart();
    if (state._leafletMap) {
      state._leafletMap.remove();
      state._leafletMap = null;
    }
  }

  // --- Stanje UI ---

  function setLoading(on) {
    state.loading = on;
    const btn = btnRefresh();
    btn.classList.toggle('loading', on);
    btn.querySelector('.icon').textContent = on ? '↻' : '↻';
  }

  function updateLastUpdated() {
    if (!state.lastUpdated) return;
    const h = state.lastUpdated.getHours().toString().padStart(2, '0');
    const m = state.lastUpdated.getMinutes().toString().padStart(2, '0');
    lastUpdatedEl().textContent = `Posodobljeno: ${h}:${m}`;
  }

  function showError() {
    errorBanner().classList.add('visible');
  }

  function hideError() {
    errorBanner().classList.remove('visible');
  }

  // --- Teme ---

  function initTheme() {
    const saved = localStorage.getItem('project_rampa_theme') || 'blue';
    // Crypto tema se ne obnovi samodejno ob zagonu
    applyTheme(saved === 'crypto' ? 'blue' : saved);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('.theme-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.t === theme);
    });
    localStorage.setItem('project_rampa_theme', theme);

    // Crypto ozadje
    const bg = $('crypto-bg');
    if (theme === 'crypto' && bg.childElementCount === 0) {
      const coins = [
        {
          cls: 'btc', abbr: 'BTC',
          svg: `<svg viewBox="0 0 32 32" fill="none"><text x="16" y="25" text-anchor="middle" font-size="26" fill="#f7931a" font-family="Arial,sans-serif" font-weight="bold">₿</text></svg>`,
        },
        {
          cls: 'eth', abbr: 'ETH',
          svg: `<svg viewBox="0 0 32 48" fill="none"><polygon points="16,1 31,25 16,32 1,25" fill="#627eea"/><polygon points="16,1 1,25 16,32" fill="#8a9efa"/><polygon points="16,35 31,27 16,47 1,27" fill="#627eea" opacity="0.75"/><polygon points="16,35 1,27 16,47" fill="#4a6ed8" opacity="0.75"/></svg>`,
        },
        {
          cls: 'sol', abbr: 'SOL',
          svg: `<svg viewBox="0 0 36 28"><defs><linearGradient id="sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#00ffa3"/><stop offset="100%" stop-color="#9945ff"/></linearGradient></defs><polygon points="4,0 36,0 32,9 0,9" fill="url(#sg)"/><polygon points="0,10 32,10 36,19 4,19" fill="url(#sg)"/><polygon points="4,20 36,20 32,28 0,28" fill="url(#sg)"/></svg>`,
        },
        {
          cls: 'xrp', abbr: 'XRP',
          svg: `<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" stroke="#00aae4" stroke-width="2"/><path d="M9,9 Q16,16 23,9M9,23 Q16,16 23,23" stroke="#00aae4" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>`,
        },
        {
          cls: 'sui', abbr: 'SUI',
          svg: `<svg viewBox="0 0 32 40" fill="none"><path d="M16,2 C10,10 2,20 2,28 C2,35.5 8.3,39 16,39 C23.7,39 30,35.5 30,28 C30,20 22,10 16,2Z" fill="#6fbcf0"/><path d="M10,22 Q16,16 22,22" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
        },
      ];

      let idx = 0;
      for (const coin of coins) {
        const sym = document.createElement('div');
        sym.className = `crypto-coin is-symbol ${coin.cls}`;
        sym.innerHTML = coin.svg;
        sym.style.left = `${5 + (idx * 18) % 84}%`;
        sym.style.animationDuration = `${3 + (idx * 0.7) % 2}s`;
        sym.style.animationDelay = `${(idx * 1.9) % 7}s`;
        bg.appendChild(sym);
        idx++;

        const abbr = document.createElement('div');
        abbr.className = `crypto-coin is-abbr ${coin.cls}`;
        abbr.textContent = coin.abbr;
        abbr.style.left = `${5 + (idx * 18) % 84}%`;
        abbr.style.animationDuration = `${3 + (idx * 0.7) % 2}s`;
        abbr.style.animationDelay = `${(idx * 1.9) % 7}s`;
        bg.appendChild(abbr);
        idx++;
      }
    }
  }

  // --- Event binding ---

  function bindEvents() {
    // Refresh gumb
    btnRefresh().addEventListener('click', () => {
      if (!state.loading) loadData();
    });

    // Filter gumbi
    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => applyFilter(btn.dataset.river));
    });

    // Zapri modal
    $('btn-close-modal').addEventListener('click', closeModal);
    modalOverlay().addEventListener('click', (e) => {
      if (e.target === modalOverlay()) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    // Preklopnik tem
    document.querySelectorAll('.theme-btn').forEach((btn) => {
      btn.addEventListener('click', () => applyTheme(btn.dataset.t));
    });

    // Auto-refresh vsakih 15 minut
    setInterval(() => {
      if (!state.loading) loadData();
    }, CONFIG.refreshIntervalMs);
  }

  return { init };
})();

// Zaženi po nalaganju DOM
document.addEventListener('DOMContentLoaded', () => App.init());
