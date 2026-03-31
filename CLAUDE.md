# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SeaSense is a single-file (`index.html`) marine weather forecast web app targeting Israeli coastal water sports enthusiasts. There is no build system, no package manager, no tests, and no server — open `index.html` directly in a browser.

## Architecture

Everything lives in `index.html`:

- **CSS** — inline `<style>` block; uses CSS custom properties (`--bg`, `--accent`, `--go`, `--caution`, `--nogo`, etc.) for the dark nautical theme
- **HTML** — two control bars (location selector + API settings), a status bar, and an `#output` div rendered dynamically
- **JavaScript** — inline `<script>` block, no frameworks, no modules

### Data flow

1. User enters a Windy API key and clicks **Get Forecast**
2. `fetchForecast()` fires two parallel requests:
   - **Wind/gust/rain** → `callWindy()` → `https://api.windy.com/api/point-forecast/v2` (POST, requires API key)
   - **Wave data** → either `fetchEcmwfWam()` → Open-Meteo free API, or `fetchGfsWave()` → Windy API again
3. `renderForecast(gfsData, waveLookup)` groups timestamps by day (Asia/Jerusalem timezone), computes per-slot status, and builds the cards HTML

### GO / CAUTION / NO-GO thresholds (`status()` function)

| Status | Wind | Gust | Waves |
|--------|------|------|-------|
| GO | < 12 kn | < 17 kn | < 0.6 m |
| CAUTION | < 18 kn | < 24 kn | < 1.0 m |
| NO-GO | anything worse | | |

### Key constants / helpers

- `M2KT = 1.94384` — m/s to knots conversion
- `windDeg(u, v)` — converts U/V wind components to meteorological bearing
- `findNearest(lookup, t)` — matches wave timestamps to wind timestamps within ±2 hours
- Preferences (API key, model, wave source, location) persisted via `localStorage`

## External APIs

- **Windy Point Forecast v2** — requires a free API key from windy.com; used for wind (`wind_u`, `wind_v`, `gust`, `past3hprecip`) and optionally GFS Wave
- **Open-Meteo Marine API** — no key required; used for ECMWF WAM wave/swell data
