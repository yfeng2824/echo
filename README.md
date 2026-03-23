# Echo

Echo is a visual + sonic demo for the Fiber network. It has two scenes: a full-screen world map that shows distributed network activity, and a node-focused resonance view that narrows attention to one node and its connected peers.

## Current Stack

- React + TypeScript + Vite
- Zustand
- Shared contracts package in `packages/contracts`
- Pixi-based renderer with a `d3-geo` world-map foundation
- Custom Web Audio pentatonic system
- Fastify adapter service in `apps/api`

## Current Features

- Dual-scene experience: a world map overview and a focused node resonance scene.
- Searchable node navigation with direct transition into node context.
- Interactive control surface for network selection, sound muting, and tonal shaping.
- Responsive controls that adapt between desktop and compact mobile flows.
- Adapter-backed live bootstrap plus polled event updates from the API layer.
- Atmospheric black-and-white visual rendering paired with pentatonic audio feedback.

## Project Structure

```text
apps/
  api/        Fastify adapter service for bootstrap, health, event polling, and upstream normalization
  web/        UI, scenes, state, Pixi renderer, audio engine, and scene overlays
    src/lib/  Shared helpers for node IDs, queries, map projection, API access, and reusable client logic
    src/ui/pixi/  Pixi scene and transition rendering
packages/
  contracts/  Shared types for nodes, channels, events, and audio metadata
```

## Run Locally

```bash
npm install
npm run dev
npm run dev:api
npm run build
```

The default `dev` script starts the web workspace. Run `npm run dev:api` alongside it when you want live adapter-backed data instead of web-only development.

## Architecture Notes

- The frontend bootstraps from `GET /bootstrap?net=...` and polls `GET /events?net=...&since=...` through `apps/web/src/lib/api-client.ts`.
- The adapter exposes `GET /health`, `GET /bootstrap`, and `GET /events` from the Fastify service in `apps/api`.
- The adapter uses the dashboard API as the single live-data source for both networks.
- The web app talks to the local adapter instead of calling Fiber/dashboard upstreams directly.
- The web app persists network, density, and root selections in local storage.

## Configuration

- `FIBER_DASHBOARD_MAINNET_API_URL` / `FIBER_DASHBOARD_TESTNET_API_URL` override dashboard API sources
- `FIBER_REFRESH_INTERVAL_MS` controls adapter refresh cadence
- `PORT` sets the API server port

## Demo Notes

- Rendering uses Pixi, with `d3-geo` providing the projection-based world map.
- The sonic system uses a pentatonic design with selectable root (default `C`).
- Sound defaults on with a short startup mute gate; muting disables audio while keeping visual motion active.
- Search supports quick keyboard focus via `/`, and sound toggles via `M`.
- Search is wired to direct node lookup and an empty-state overlay for unmatched IDs.
- The node scene reseeds peer layout on entry so repeated visits feel different.
- Collision-generated echo rings are capped to prevent noisy feedback loops.

## Next Steps

- Stabilize and refine the Pixi renderer
- Deepen Fiber-backed data coverage beyond the current adapter foundation
- Continue tuning sound density, resonance timing, and scene feel
