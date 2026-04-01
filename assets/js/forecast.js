// Project Rampa — napoved pretoka na podlagi Open-Meteo vremenske napovedi

const FORECAST = (() => {
  const CACHE_PREFIX = 'project_rampa_wx_';

  const DAY_SL = ['ned', 'pon', 'tor', 'sre', 'čet', 'pet', 'sob'];

  // --- Fetch Open-Meteo ---

  async function fetchWeather(lat, lng) {
    const today = new Date().toISOString().split('T')[0];
    const key = `${CACHE_PREFIX}${lat.toFixed(3)}_${lng.toFixed(3)}_${today}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const { data } = JSON.parse(raw);
      return data; // isti datum = veljavni cache
    }

    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lng}` +
      `&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,weathercode` +
      `&forecast_days=7&timezone=Europe%2FBerlin`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const data = await res.json();
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
    return data;
  }

  // --- Besedilna napoved ---

  function generateText(loc, currentFlow, weather) {
    const { time, precipitation_sum: precip, temperature_2m_max: tempMax } = weather.daily;

    const totalPrecip = precip.reduce((a, b) => a + b, 0);
    const status = getFlowStatus(currentFlow, loc.thresholds);
    const statusLabel = getStatusLabel(status).toLowerCase();

    // Dnevi z dežjem
    const rainDays = [];
    for (let i = 0; i < time.length; i++) {
      if (precip[i] >= 5) rainDays.push({ day: DAY_SL[new Date(time[i]).getDay()], mm: precip[i] });
    }
    const heavyDays = rainDays.filter(d => d.mm >= 20);

    const parts = [];

    // Trenutno stanje
    if (currentFlow != null) {
      parts.push(`Trenutni pretok je ${currentFlow.toFixed(1)} m³/s (${statusLabel}).`);
    } else {
      parts.push(`Podatek o pretoku trenutno ni na voljo.`);
    }

    // Padavinska napoved
    if (totalPrecip < 8) {
      parts.push(
        `V prihodnjem tednu padavin skoraj ne pričakujemo (skupaj le ~${totalPrecip.toFixed(0)} mm).`
      );
      if (status === 'ok') {
        parts.push(`Pretok bo verjetno postopoma upadal — ugodni pogoji za veslanje.`);
      } else if (status === 'high' || status === 'danger') {
        parts.push(`Pretok naj bi se postopoma umirjal brez svežih padavin.`);
      } else {
        parts.push(`Pretok bo ostal nizek ali bo še rahlo padel.`);
      }
    } else if (totalPrecip < 50) {
      const dayList = rainDays.map(d => d.day).join(', ');
      parts.push(
        `Predvidene so zmerne padavine (~${totalPrecip.toFixed(0)} mm v 7 dneh${dayList ? ', predvsem v ' + dayList : ''}).`
      );
      if (status === 'ok' || status === 'low') {
        parts.push(`Pretok bo verjetno rahlo narastel in ostal v normalnih mejah.`);
      } else {
        parts.push(`Pretok bo verjetno rahlo narastel — pazite na morebitne spremembe.`);
      }
    } else {
      const heavy = heavyDays.length
        ? heavyDays.map(d => `${d.day} (~${d.mm.toFixed(0)} mm)`).join(', ')
        : rainDays.map(d => d.day).join(', ');
      parts.push(
        `Pričakujemo obilne padavine (~${totalPrecip.toFixed(0)} mm v 7 dneh${heavy ? ', z intenzivnimi padavinami v ' + heavy : ''}).`
      );
      parts.push(
        `Pretok bo verjetno znatno narastel. Pred odhodom na vodo preverite aktualne pogoje in uradna opozorila.`
      );
    }

    // Vpliv elektrarne (Solkan — Soške elektrarne regulirajo pretok)
    if (loc.id === 'soca-solkan') {
      parts.push(
        `Opozorilo: pretok pri Solkanu je pod neposrednim vplivom regulacije Soških elektrarn. Elektrarna lahko pretok poveča ali zmanjša neodvisno od padavin — vremenska napoved je le orientacijska, dejanski pretok določa elektrarna.`
      );
    }

    // Taljenje snega (gorske reke, pomlad, naraščajoče temperature)
    const month = new Date().getMonth(); // 0 = januar
    const isSpring = month >= 1 && month <= 5;
    const isMountain = loc.river === 'Soča' || ['sava-tacen', 'sava-radovljica'].includes(loc.id);
    const warmDays = tempMax.filter(t => t > 7).length;
    const maxTemp = Math.max(...tempMax);
    if (isMountain && isSpring && warmDays >= 3) {
      parts.push(
        `Ob naraščajočih temperaturah (do ${maxTemp.toFixed(0)} °C) je pričakovati tudi taljenje snega v gorah, ki dodatno dvigne pretok.`
      );
    }

    return parts.join(' ');
  }

  // --- Javni vmesnik ---

  async function getForecast(loc, currentFlow) {
    try {
      const weather = await fetchWeather(loc.lat, loc.lng);
      return {
        text: generateText(loc, currentFlow, weather),
        daily: weather.daily,
        ok: true,
      };
    } catch (err) {
      console.warn('[Rampa] Napoved napaka:', err.message);
      return {
        text: 'Vremenska napoved trenutno ni na voljo. Preverite spletne vire.',
        daily: null,
        ok: false,
      };
    }
  }

  return { getForecast };
})();
