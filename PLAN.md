# Kajak Meter — Načrt aplikacije

## Opis projekta

Spletna aplikacija (HTML/CSS/JS, brez frameworkov) za slovenske kajakaše.
Prikazuje pretok vode (m³/s) pri konkretnih kajak lokacijah na rekah **Soča, Sava, Savinja**.

**Podatkovni vir**: ARSO — Agencija RS za okolje
**Vizualni stil**: temno modra + oranžna + bela
**Status**: Načrtovanje zaključeno — čaka implementacija

---

## Arhitektura datotek

```
Kajak project/
  index.html
  PLAN.md              ← ta dokument
  assets/
    css/
      style.css
    js/
      config.js        ← kajak lokacije, ARSO postaje, pragovi težavnosti
      arso.js          ← ARSO XML fetch & razčlenjevanje
      charts.js        ← Chart.js grafi
      app.js           ← glavna logika, renderiranje, eventi
```

---

## Kajak lokacije & ARSO postaje

### SOČA
| Lokacija | Kajak klubi | ARSO postaja | Šifra |
|----------|-------------|--------------|-------|
| Bovec | Soča Splash, Kayak Soča, Alpe Šport | Kobarid I - Soča | H8080 |
| Kobarid | Kobarid Kayak School, Kamp Koren | Kobarid I - Soča | H8080 |
| Solkan | KK Soške elektrarne (KKSE) | Log Čezsoški - Soča | (najbližja) |

### SAVA
| Lokacija | Kajak klubi | ARSO postaja | Šifra |
|----------|-------------|--------------|-------|
| Tacen (Ljubljana) | KK Tacen — olimpijski slalomski kanal | Ljubljana / Šentjakob | (poiskati v XML) |
| Radovljica / Bled | KK Bohinj, xsport.si | Radovljica I - Sava | H3420 |

### SAVINJA
| Lokacija | Kajak klubi | ARSO postaja | Šifra |
|----------|-------------|--------------|-------|
| Luče / Mozirje | Adventure Valley, Hotel Grof | Letuš I - Savinja | H6068 |
| Celje | Celje kajak sekcija | Celje II brv - Savinja | H6140 |

---

## Podatkovni viri (ARSO)

### Trenutni podatki (real-time)
- URL: `http://www.arso.gov.si/xml/vode/hidro_podatki_zadnji.xml`
- Format: XML, 171+ postaj
- Polja: `<reka>`, `<merilno_mesto>`, `<pretok>` (m³/s), `<vodostaj>` (cm), `<temp_vode>` (°C)
- CORS: blokiran → proxy: `https://api.allorigins.win/get?url=<encoded_url>`

### Zgodovinski podatki (zadnji 7 dni)
- Pristop A: Dnevni XML — `http://www.arso.gov.si/xml/vode/hidro_podatki_YYYY-MM-DD.xml`
- Pristop B (fallback): LocalStorage cache — gradi zgodovino skozi čas

### Napoved (naslednji teden)
- Trendna analiza iz 7-dnevnih podatkov (linearna ekstrapolacija)
- Prikazano kot prekinjena oranžna črta na grafu
- Opomba: "Napoved je trendna ocena, ne uradna ARSO napoved"

---

## Pragovi težavnosti po lokacijah

| Lokacija | Prenizko | Primerno | Visoko | Nevarno |
|----------|----------|----------|--------|---------|
| Soča — Bovec/Kobarid | < 5 m³/s | 5–40 | 40–80 | > 80 |
| Soča — Solkan | < 15 m³/s | 15–70 | 70–150 | > 150 |
| Sava — Tacen | < 20 m³/s | 20–80 | 80–200 | > 200 |
| Sava — Radovljica/Bled | < 10 m³/s | 10–60 | 60–150 | > 150 |
| Savinja — Luče | < 5 m³/s | 5–30 | 30–60 | > 60 |
| Savinja — Celje | < 10 m³/s | 10–80 | 80–200 | > 200 |

*(Pragovi so informativni — označeni z opombo v UI)*

---

## UI komponente

### Glava
- Naziv "Kajak Meter" + podnaslov
- Čas zadnje posodobitve + gumb "Osveži"

### Filter
- Gumbi: [Vse] [Soča] [Sava] [Savinja]

### Kartice lokacij
- Ime lokacije + reka + ARSO postaja
- Velik prikaz pretoka (m³/s)
- Barvni indikator: 🔵 Prenizko / 🟢 Primerno / 🟡 Visoko / 🔴 Nevarno
- Mini sparkline (pregled tedna)
- Temperatura in vodostaj
- Klik → detail pogled

### Detail pogled (modal)
- Chart.js graf: polna črta = história 7 dni, prekinjena = napoved 7 dni
- Vodoravne barvne črte = pragovi težavnosti
- Trenutni podatki + opomba o napovedih

### Noga
- "Podatki: ARSO — Agencija RS za okolje"

---

## Vizualni stil

| Element | Barva |
|---------|-------|
| Ozadje | `#0d1b2a` |
| Kartica | `#1a2f4a` |
| Akcent / napoved | `#FF6B35` |
| Besedilo | `#ffffff` / `#b0c4de` |
| Primerno | `#2ecc71` |
| Visoko | `#f39c12` |
| Nevarno | `#e74c3c` |
| Prenizko | `#5b9bd5` |

---

## Vrstni red implementacije

1. `assets/js/config.js` — kajak lokacije, ARSO postaje, pragovi
2. `assets/js/arso.js` — fetch + XML parse (real-time + historia)
3. `assets/css/style.css` — tema, kartice, responsivnost
4. `index.html` — HTML struktura
5. `assets/js/app.js` — renderiranje, filter, eventi
6. `assets/js/charts.js` — Chart.js grafi
