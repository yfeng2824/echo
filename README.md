# Echo

Echo is a visual and sonic demo for the Fiber network. It pairs a world-map overview with a focused node view, using live adapter-backed data and a pentatonic audio system to make network activity feel spatial, continuous, and legible.

## What It Includes

- React + TypeScript + Vite
- Zustand
- Pixi rendering with a `d3-geo` world-map foundation
- Custom Web Audio engine with pentatonic voicing
- Fastify adapter service in `apps/api`
- Shared contracts in `packages/contracts`
- A two-scene UI: map overview and node resonance view
- Search-driven node navigation, network switching, and sound controls

## Project Structure

```text
apps/
  api/        Fastify adapter service for bootstrap, health, event polling, and dashboard normalization
  web/        UI, scenes, state, Pixi renderer, audio engine, and scene overlays
    src/lib/  Shared helpers for node IDs, queries, map projection, API access, and reusable client logic
    src/ui/pixi/  Pixi scene and transition rendering
packages/
  contracts/  Shared types for nodes, channels, events, and audio metadata
```

## Local Development

```bash
npm install
npm run dev
npm run dev:api
npm run build
npm run format
```

`npm run dev` starts the web app. Run `npm run dev:api` alongside it so the frontend can talk to the local adapter at `/api`.

## Data Flow

- The web app loads its initial scene state from `GET /bootstrap?net=...`.
- It polls `GET /events?net=...&since=...` for incremental activity updates.
- The Fastify adapter exposes `GET /health`, `GET /bootstrap`, and `GET /events`.
- The frontend talks only to the local adapter, not directly to Fiber dashboard upstreams.

## Endpoint Usage

- Header counts:
  `Announced Nodes` comes from `nodes_hourly.total_count`.
  `Active Channels` comes from `channel_count_by_state`, aggregated as `open + closed_waiting_onchain_settlement` across all assets.
- Topology:
  Rendered nodes and channels come from `nodes_hourly` and `channels_hourly`, with channel state enrichment from `group_channel_by_state`.
- Node view:
  The node scene reuses the normalized topology already returned by `/bootstrap`; it does not call a separate per-node upstream endpoint.
- Events:
  `/events` is produced by the adapter from topology refresh deltas and then polled by the frontend.

## Configuration

- `FIBER_DASHBOARD_MAINNET_API_URL` / `FIBER_DASHBOARD_TESTNET_API_URL` override dashboard API sources
- `FIBER_REFRESH_INTERVAL_MS` controls adapter refresh cadence
- `PORT` sets the API server port

## Interaction Notes

- Rendering uses Pixi, with `d3-geo` providing the projection-based world map
- The sonic system uses a pentatonic design with selectable root
- Sound defaults on with a short startup mute gate; muting disables audio while keeping visual motion active
- Keyboard shortcuts are available for search focus and sound toggle
- Invalid direct node routes show explicit not-found UX instead of silently falling back
- The node scene reseeds peer layout on entry so repeated visits feel different
- Collision-generated echo rings are capped to prevent noisy feedback loops

## Next Steps

- Continue polishing the Pixi renderer and scene feel
