# Routing Intelligence Platform

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
