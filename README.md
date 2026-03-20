# Echo

Echo is a visual + sonic demo for the Fiber network. It has two scenes: a full-screen world map that shows distributed network activity, and a node-focused resonance view that narrows attention to one node and its connected peers.

## Current Stack

- React + TypeScript + Vite
- Zustand
- Shared contracts package in `packages/contracts`
- Pixi-based renderer with a `d3-geo` world-map foundation
- Custom Web Audio guqin-inspired system
- Fastify adapter service in `apps/api`

## Current Features

- Full-screen world map as the default view
- Hash-based scene routing with `#node` for the focused node view
- Clickable nodes on the map
- Search by node ID
- Empty state overlay for unmatched search
- Mainnet/testnet switching from the scene chrome
- Real-data bootstrap through the adapter service
- Polled recent-event feed layered on top of the bootstrap snapshot
- Atmospheric projected world map with a restrained black-and-white treatment
- Node-to-local-view transition carries the selected node into the focused scene
- Network transition overlay during source/network swaps
- No-live-data overlay with retry when dashboard activity is unavailable
- Minimal map overlay with a search field only
- Right-side node details only in the node view
- Minimal black-and-white controls for sound, density, and network selection
- Map ambient bed with distributed node-trigger pulses and ripples
- Selected-node local resonance behavior with a centered main node and scattered direct peers
- Thin connection lines between the selected node and direct peers
- Collision echoes in the node scene with secondary rings and capped recursion via `rippleLayer`
- Visible node IDs rendered as derived truncated hexadecimal values while internal graph IDs stay unchanged
- Copy-to-clipboard action for node IDs with overlay feedback

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

## Configuration

- `FIBER_DASHBOARD_MAINNET_API_URL` / `FIBER_DASHBOARD_TESTNET_API_URL` override dashboard API sources
- `FIBER_REFRESH_INTERVAL_MS` controls adapter refresh cadence
- `PORT` sets the API server port

## Demo Notes

- Rendering uses Pixi, with `d3-geo` providing the projection-based world map.
- The sonic system stays fixed to a guqin-inspired pentatonic design.
- Search is wired to direct node lookup and an empty-state overlay for unmatched IDs.
- The node scene reseeds peer layout on entry so repeated visits feel different.
- Collision-generated echo rings are capped to prevent noisy feedback loops.

## Next Steps

- Stabilize and refine the Pixi renderer
- Deepen Fiber-backed data coverage beyond the current adapter foundation
- Continue tuning sound density, resonance timing, and scene feel
