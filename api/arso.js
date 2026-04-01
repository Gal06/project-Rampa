export default async function handler(req, res) {
  try {
    const response = await fetch('http://www.arso.gov.si/xml/vode/hidro_podatki_zadnji.xml');
    if (!response.ok) throw new Error(`ARSO HTTP ${response.status}`);
    const text = await response.text();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'text/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
