# Roadrage

This repo contains the backend API and the canonical API contract for an intent-aware routing platform:
- Modes: LOW_STRESS, TOW, FUEL_SAVER, FASTEST
- User-selected stress tolerance (1–100)
- Large trailer threshold: 16ft
- Destination exception radius: 1 mile
- Tow Mode prioritizes best towing experience
- Low-Stress mode targets minimum achievable stress
- Supports future: continuous monitoring, lane strategy, community learning

## Quick start (local)
Requirements: Node 20+ or Docker.

### Option A: Docker
```bash
docker compose up --build


## Web demo (drop-in HTML)
Place your static HTML pages in `web/`. A minimal demo `web/index.html` is included.
Open `web/index.html` in a browser, or serve it via a static server.
