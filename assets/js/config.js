// Project Rampa — konfiguracija lokacij, ARSO postaj in pragov težavnosti

const CONFIG = {
  arso: {
    realtimeUrl: 'http://www.arso.gov.si/xml/vode/hidro_podatki_zadnji.xml',
    proxy: (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
  },

  refreshIntervalMs: 15 * 60 * 1000, // 15 minut

  locations: [
    {
      id: 'soca-bovec',
      name: 'Bovec / Kobarid',
      river: 'Soča',
      arsoId: '8080',
      arsoName: 'Kobarid',
      clubs: ['Soča Splash', 'Kayak Soča', 'Alpe Šport', 'Kobarid Kayak School', 'Kamp Koren'],
      thresholds: { low: 5, ok: 40, high: 80 },
      lat: 46.33479, lng: 13.55286,  // Soča Splash, Rupa 14a, Bovec
    },
    {
      id: 'soca-solkan',
      name: 'Solkan',
      river: 'Soča',
      arsoId: '8180',
      arsoName: 'Solkan',
      clubs: ['KK Soške elektrarne (KKSE)'],
      thresholds: { low: 15, ok: 70, high: 150 },
      lat: 45.97214, lng: 13.64213,  // KKSE, Pot na breg 9, Solkan
    },
    {
      id: 'sava-tacen',
      name: 'Tacen (Ljubljana)',
      river: 'Sava',
      arsoId: '3570',
      arsoName: 'Šentjakob',
      clubs: ['KK Tacen'],
      thresholds: { low: 20, ok: 80, high: 200 },
      lat: 46.11690, lng: 14.45770,  // KK Tacen, Marinovševa 8a
    },
    {
      id: 'sava-radovljica',
      name: 'Radovljica / Bled',
      river: 'Sava',
      arsoId: '3420',
      arsoName: 'Radovljica',
      clubs: ['KK Bohinj', 'xsport.si'],
      thresholds: { low: 10, ok: 60, high: 150 },
      lat: 46.34400, lng: 14.17260,  // KK Bohinj / xsport.si, ob Savi pri Radovljici
    },
    {
      id: 'sava-hrastnik',
      name: 'Hrastnik',
      river: 'Sava',
      arsoId: '3725',
      arsoName: 'Hrastnik',
      clubs: ['Kajak klub TKI Hrastnik'],
      thresholds: { low: 30, ok: 150, high: 400 },
      lat: 46.12120, lng: 15.08950,  // Kajak klub TKI Hrastnik, Podkraj 67a
    },
    {
      id: 'savinja-luce',
      name: 'Luče / Mozirje',
      river: 'Savinja',
      arsoId: '6068',
      arsoName: 'Letuš',
      clubs: ['Adventure Valley', 'Hotel Grof'],
      thresholds: { low: 5, ok: 30, high: 60 },
      lat: 46.35580, lng: 14.74240,  // Adventure Valley, Luče 103
    },
    {
      id: 'savinja-celje',
      name: 'Celje',
      river: 'Savinja',
      arsoId: '6140',
      arsoName: 'Celje II - brv',
      clubs: ['Kajak kanu klub Nivo Celje'],
      thresholds: { low: 10, ok: 80, high: 200 },
      lat: 46.23309, lng: 15.24290,  // KKK Nivo Celje, Špica - sotočje Savinje in Ložnice
    },
  ],

  colors: {
    bg: '#0d1b2a',
    card: '#1a2f4a',
    accent: '#FF6B35',
    text: '#ffffff',
    textMuted: '#b0c4de',
    low: '#5b9bd5',
    ok: '#2ecc71',
    high: '#f39c12',
    danger: '#e74c3c',
  },

  rivers: ['Soča', 'Sava', 'Savinja'],
};

// Določi status pretoka glede na pragove
function getFlowStatus(flow, thresholds) {
  if (flow === null || flow === undefined) return 'unknown';
  if (flow < thresholds.low) return 'low';
  if (flow < thresholds.ok) return 'ok';
  if (flow < thresholds.high) return 'high';
  return 'danger';
}

function getStatusLabel(status) {
  const labels = {
    low: 'Prenizko',
    ok: 'Primerno',
    high: 'Visoko',
    danger: 'Nevarno',
    unknown: 'Ni podatka',
  };
  return labels[status] || 'Ni podatka';
}

function getStatusColor(status) {
  const colorMap = {
    low: CONFIG.colors.low,
    ok: CONFIG.colors.ok,
    high: CONFIG.colors.high,
    danger: CONFIG.colors.danger,
    unknown: CONFIG.colors.textMuted,
  };
  return colorMap[status] || CONFIG.colors.textMuted;
}

// Formatiraj datum za ARSO URL (YYYY-MM-DD)
function formatDateForArso(date) {
  return date.toISOString().split('T')[0];
}

// Pridobi zadnjih 7 datumov (brez danes)
function getLast7Days() {
  const days = [];
  for (let i = 7; i >= 1; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(formatDateForArso(d));
  }
  return days;
}
