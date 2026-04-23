// SeaSense-Widget.js — Scriptable home screen widget
//
// Setup:
//   1. Install Scriptable from the App Store (free)
//   2. Copy this file into Scriptable (tap + → paste, or use iCloud Drive)
//   3. Add a Scriptable widget to your home screen
//   4. Long-press the widget → Edit Widget → Script: SeaSense-Widget
//   5. Set "Parameter" to a location key (see list below)
//
// Location keys: amigo · michmoret · netanya · herzliya · tel_aviv
//                caesarea · haifa · acre · nahariya · ashdod · ashkelon · eilat
// Default: michmoret

const M2KT = 1.94384;

const LOCATIONS = {
  amigo:     { name: 'Amigo Surfski',   lat: 32.4116, lon: 34.8697 },
  michmoret: { name: 'Michmoret',       lat: 32.40,   lon: 34.87   },
  netanya:   { name: 'Netanya',         lat: 32.33,   lon: 34.86   },
  herzliya:  { name: 'Herzliya Marina', lat: 32.16,   lon: 34.79   },
  tel_aviv:  { name: 'Tel Aviv',        lat: 32.08,   lon: 34.76   },
  caesarea:  { name: 'Caesarea',        lat: 32.50,   lon: 34.90   },
  haifa:     { name: 'Haifa',           lat: 32.82,   lon: 34.99   },
  acre:      { name: 'Acre (Akko)',     lat: 32.93,   lon: 35.07   },
  nahariya:  { name: 'Nahariya',        lat: 33.01,   lon: 35.10   },
  ashdod:    { name: 'Ashdod',          lat: 31.80,   lon: 34.64   },
  ashkelon:  { name: 'Ashkelon',        lat: 31.67,   lon: 34.57   },
  eilat:     { name: 'Eilat',           lat: 29.56,   lon: 34.95   },
};

const C = {
  bg:      new Color('#0a1628'),
  go:      new Color('#34d399'),
  caution: new Color('#fbbf24'),
  danger:  new Color('#f87171'),
  text:    new Color('#e2e8f0'),
  dim:     new Color('#8899aa'),
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function getLocation() {
  const key = ((args.widgetParameter || 'michmoret') + '').trim().toLowerCase();
  return LOCATIONS[key] || LOCATIONS.michmoret;
}

async function fetchData(lat, lon) {
  const windReq = new Request(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=windspeed_10m,windgusts_10m,winddirection_10m` +
    `&wind_speed_unit=ms&timezone=UTC&forecast_days=3&models=icon_eu`
  );
  const waveReq = new Request(
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
    `&hourly=wave_height,wave_direction&models=ecmwf_wam&timezone=UTC&forecast_days=3`
  );
  const [wind, wave] = await Promise.all([windReq.loadJSON(), waveReq.loadJSON()]);
  return { wind, wave };
}

function buildWaveLookup(wave) {
  const lookup = {};
  wave.hourly.time.forEach((t, i) => {
    lookup[new Date(t + 'Z').getTime()] = {
      wh:  wave.hourly.wave_height[i],
      whd: wave.hourly.wave_direction[i],
    };
  });
  return lookup;
}

const _nearestCache = new WeakMap();
function findNearest(lookup, ts) {
  if (!_nearestCache.has(lookup)) {
    _nearestCache.set(lookup, Object.keys(lookup).map(Number).sort((a, b) => a - b));
  }
  const keys = _nearestCache.get(lookup);
  if (!keys.length) return null;
  let lo = 0, hi = keys.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid] < ts) lo = mid + 1; else hi = mid;
  }
  const candidates = [keys[lo - 1], keys[lo]].filter(k => k != null);
  if (!candidates.length) return null;
  const closest = candidates.reduce((a, b) => Math.abs(b - ts) < Math.abs(a - ts) ? b : a);
  return Math.abs(closest - ts) < 2 * 3600000 ? lookup[closest] : null;
}

function computeStatus(windKt, waveM) {
  if (windKt >= 18 || (waveM != null && waveM >= 1.0)) return 'danger';
  if (windKt >= 12 || (waveM != null && waveM >= 0.6)) return 'caution';
  return 'go';
}

function statusColor(st)  { return C[st] || C.go; }
function statusLabel(st)  { return { go: 'GO ✓', caution: '! CAUTION', danger: '✕ DANGER' }[st]; }

function dirArrow(deg) {
  if (deg == null) return '—';
  return ['↓','↙','←','↖','↑','↗','→','↘'][Math.round(((deg + 180) % 360) / 45) % 8];
}

function fmtTime(d) {
  return d.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function fmtDate(d) {
  return d.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Jerusalem', weekday: 'short', day: 'numeric', month: 'short',
  });
}

function processSlots(wind, waveLookup) {
  const now = Date.now();
  const slots = [];
  wind.hourly.time.forEach((t, i) => {
    const d = new Date(t + 'Z');
    if (d.getUTCHours() % 3 !== 0) return;
    const h = d.getUTCHours();
    if (h === 0 || h === 3 || h === 21) return;       // skip night
    if (d.getTime() < now - 30 * 60000) return;        // skip past
    const windKt = wind.hourly.windspeed_10m[i] * M2KT;
    const gustKt = wind.hourly.windgusts_10m[i] * M2KT;
    const deg    = wind.hourly.winddirection_10m[i];
    const wv     = findNearest(waveLookup, d.getTime());
    const wh     = wv ? wv.wh  : null;
    const whd    = wv ? wv.whd : null;
    slots.push({ d, windKt, gustKt, deg, wh, whd, status: computeStatus(windKt, wh) });
  });
  return slots;
}

// ── Widget builders ──────────────────────────────────────────────────────────

function buildSmall(widget, slot, locName) {
  widget.setPadding(14, 16, 14, 16);

  const nameText = widget.addText(locName);
  nameText.textColor = C.text;
  nameText.font = Font.boldSystemFont(13);
  nameText.lineLimit = 1;
  nameText.minimumScaleFactor = 0.7;

  widget.addSpacer(4);

  const timeText = widget.addText(fmtTime(slot.d));
  timeText.textColor = C.dim;
  timeText.font = Font.monospacedSystemFont(11);

  widget.addSpacer(6);

  const stText = widget.addText(statusLabel(slot.status));
  stText.textColor = statusColor(slot.status);
  stText.font = Font.boldSystemFont(15);

  widget.addSpacer(8);

  const windTxt = widget.addText(`💨  ${slot.windKt.toFixed(0)} kn ${dirArrow(slot.deg)}`);
  windTxt.textColor = C.text;
  windTxt.font = Font.systemFont(12);

  widget.addSpacer(4);

  const waveTxt = widget.addText(
    slot.wh != null ? `🌊  ${slot.wh.toFixed(1)} m ${dirArrow(slot.whd)}` : `🌊  — m`
  );
  waveTxt.textColor = C.text;
  waveTxt.font = Font.systemFont(12);
}

function addSlotColumn(parent, slot, isLast) {
  const col = parent.addStack();
  col.layoutVertically();
  col.spacing = 3;

  const t = col.addText(fmtTime(slot.d));
  t.textColor = C.dim;
  t.font = Font.monospacedSystemFont(10);

  const s = col.addText(statusLabel(slot.status));
  s.textColor = statusColor(slot.status);
  s.font = Font.boldSystemFont(11);
  s.lineLimit = 1;
  s.minimumScaleFactor = 0.8;

  const w = col.addText(`${slot.windKt.toFixed(0)} kn ${dirArrow(slot.deg)}`);
  w.textColor = C.text;
  w.font = Font.systemFont(11);

  const wv = col.addText(slot.wh != null ? `${slot.wh.toFixed(1)} m ${dirArrow(slot.whd)}` : '— m');
  wv.textColor = C.text;
  wv.font = Font.systemFont(11);

  if (!isLast) parent.addSpacer();
}

function buildMedium(widget, slots, locName) {
  widget.setPadding(12, 16, 12, 16);

  // Header row: location name + date
  const header = widget.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();

  const nameText = header.addText(locName);
  nameText.textColor = C.text;
  nameText.font = Font.boldSystemFont(12);
  nameText.lineLimit = 1;

  header.addSpacer();

  if (slots.length) {
    const dateText = header.addText(fmtDate(slots[0].d));
    dateText.textColor = C.dim;
    dateText.font = Font.systemFont(10);
  }

  widget.addSpacer(8);

  // Up to 3 time-slot columns
  const row = widget.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();

  const display = slots.slice(0, 3);
  display.forEach((slot, i) => addSlotColumn(row, slot, i === display.length - 1));
}

// ── Main ─────────────────────────────────────────────────────────────────────

const loc    = getLocation();
const widget = new ListWidget();
widget.backgroundColor = C.bg;
widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000); // refresh every 15 min

try {
  const { wind, wave } = await fetchData(loc.lat, loc.lon);
  const waveLookup = buildWaveLookup(wave);
  const slots = processSlots(wind, waveLookup);

  if (!slots.length) {
    widget.setPadding(14, 16, 14, 16);
    const t = widget.addText('No upcoming slots');
    t.textColor = C.dim;
    t.font = Font.systemFont(12);
  } else if (config.widgetFamily === 'small') {
    buildSmall(widget, slots[0], loc.name);
  } else {
    buildMedium(widget, slots, loc.name);
  }
} catch (e) {
  widget.setPadding(14, 16, 14, 16);
  const errText = widget.addText('Error: ' + e.message);
  errText.textColor = C.danger;
  errText.font = Font.systemFont(11);
  errText.lineLimit = 3;
}

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium(); // preview when run inside Scriptable
}
Script.complete();
