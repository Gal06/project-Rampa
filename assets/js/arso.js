// Project Rampa — ARSO podatki: fetch, XML parse, localStorage cache

const ARSO = (() => {
  const CACHE_PREFIX = 'project_rampa_';

  // --- Fetch ---

  async function fetchXml(url) {
    const proxyUrl = CONFIG.arso.proxy(url);
    const resp = await fetch(proxyUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    if (!json.contents) throw new Error('Prazen odgovor proxy strežnika');
    const parser = new DOMParser();
    const doc = parser.parseFromString(json.contents, 'text/xml');
    // Preveri XML parse napako
    const parseErr = doc.querySelector('parsererror');
    if (parseErr) throw new Error('XML parse napaka');
    return doc;
  }

  // --- Parse ---

  // Poišče postajo po šifri z getElementsByTagName (zanesljivo v XML)
  function findStation(xmlDoc, location) {
    const postaje = xmlDoc.getElementsByTagName('postaja');
    for (let i = 0; i < postaje.length; i++) {
      if (postaje[i].getAttribute('sifra') === location.arsoId) {
        return postaje[i];
      }
    }
    return null;
  }

  function getTagText(el, tag) {
    const found = el.getElementsByTagName(tag)[0];
    return found ? found.textContent.trim() : null;
  }

  function parseStation(postaja) {
    if (!postaja) return null;
    const flowStr = getTagText(postaja, 'pretok');
    const levelStr = getTagText(postaja, 'vodostaj');
    const tempStr = getTagText(postaja, 'temp_vode');
    const flow = parseFloat(flowStr);
    const level = parseFloat(levelStr);
    const temp = parseFloat(tempStr);
    return {
      flow: isNaN(flow) ? null : flow,
      level: isNaN(level) ? null : level,
      temp: isNaN(temp) ? null : temp,
      timestamp: getTagText(postaja, 'datum') || null,
    };
  }

  // --- Realtime ---

  async function fetchRealtime() {
    const xml = await fetchXml(CONFIG.arso.realtimeUrl);

    const results = {};
    for (const loc of CONFIG.locations) {
      const postaja = findStation(xml, loc);
      results[loc.id] = parseStation(postaja);
    }

    // Shrani v cache
    const now = new Date().toISOString();
    localStorage.setItem(CACHE_PREFIX + 'realtime', JSON.stringify({ ts: now, data: results }));
    appendToHistory(results);

    return results;
  }

  // --- Zgodovina (iz localStorage cache) ---
  // ARSO ne hrani zgodovinskih datotek, zato gradimo zgodovino sami.
  // Vsak uspešen realtime fetch doda vnos za danes v cache.

  function fetchHistory() {
    return Promise.resolve(loadHistoryCache());
  }

  // --- Cache helpers ---

  function loadHistoryCache() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_PREFIX + 'history') || '[]');
    } catch {
      return [];
    }
  }

  function loadRealtimeCache() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_PREFIX + 'realtime') || 'null');
    } catch {
      return null;
    }
  }

  // Appenda trenutne realtime podatke v dnevno historijo (datum danes)
  function appendToHistory(realtimeData) {
    const today = formatDateForArso(new Date()); // iz config.js
    const cache = loadHistoryCache();

    const existing = cache.find((d) => d.date === today);
    if (!existing) {
      cache.push({ date: today, data: realtimeData });
      const trimmed = cache.slice(-14);
      localStorage.setItem(CACHE_PREFIX + 'history', JSON.stringify(trimmed));
    }
  }

  // Združi fetched (ARSO dnevni) s cached (localStorage) — prioriteta: ARSO
  function mergeHistory(cached, fetched) {
    const map = {};
    for (const entry of cached) map[entry.date] = entry;
    for (const entry of fetched) map[entry.date] = entry;
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  }

  // --- Napoved (trendna ekstrapolacija) ---

  function buildForecast(history) {
    const forecast = {};

    for (const loc of CONFIG.locations) {
      const points = history
        .filter((d) => d.data[loc.id]?.flow != null)
        .map((d, i) => ({ x: i, y: d.data[loc.id].flow }));

      if (points.length < 2) {
        forecast[loc.id] = [];
        continue;
      }

      const n = points.length;
      const sumX = points.reduce((s, p) => s + p.x, 0);
      const sumY = points.reduce((s, p) => s + p.y, 0);
      const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
      const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
      const denom = n * sumX2 - sumX * sumX;
      const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
      const intercept = (sumY - slope * sumX) / n;

      const futureDays = [];
      for (let i = 1; i <= 7; i++) {
        const x = n - 1 + i;
        const d = new Date();
        d.setDate(d.getDate() + i);
        futureDays.push({
          date: formatDateForArso(d),
          flow: Math.max(0, slope * x + intercept),
        });
      }
      forecast[loc.id] = futureDays;
    }

    return forecast;
  }

  // --- Sparkline ---

  function buildSparkline(history, locationId) {
    // Vedno vrni zadnjih 7 dni — null za dneve brez meritve
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(formatDateForArso(d));
    }
    return days.map((date) => {
      const entry = history.find((h) => h.date === date);
      return { date, flow: entry?.data[locationId]?.flow ?? null };
    });
  }

  return {
    fetchRealtime,
    fetchHistory,
    buildForecast,
    buildSparkline,
    loadRealtimeCache,
    loadHistoryCache,
  };
})();
