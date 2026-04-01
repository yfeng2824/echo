# Echo

Echo is a visual and sonic demo for the Fiber network. It pairs a world-map overview with a focused node view, using live FiberDashboard data and a pentatonic audio system to make network activity feel spatial, continuous, and legible.

## What It Includes

- React + TypeScript + Vite
- Zustand
- Pixi rendering with a `d3-geo` world-map foundation
- Custom Web Audio engine with pentatonic voicing
- Direct FiberDashboard fetching from the frontend
- Shared contracts in `packages/contracts`
- A two-scene UI: map overview and node resonance view
- Search-driven node navigation, network switching, and sound controls

## Project Structure

```text
apps/
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
npm run build
npm run format
```

`npm run dev` starts the web app. The frontend fetches FiberDashboard directly, so no local backend is required for development or deployment.

## Data Flow

- The web app fetches `nodes_hourly`, `channels_hourly`, `group_channel_by_state`, and `channel_count_by_state` directly from FiberDashboard.
- It normalizes those upstream payloads in the browser into Echo’s scene bootstrap, topology, and headline counts.
- It polls FiberDashboard snapshots and derives incremental echo events client-side from topology deltas.
- No Echo-specific `/bootstrap` or `/events` backend endpoints are required to deploy the frontend.

## Endpoint Usage

- Header counts:
  `Announced Nodes` comes from `nodes_hourly.total_count`.
  `Active Channels` comes from `channel_count_by_state`, aggregated as `open + closed_waiting_onchain_settlement` across all assets.
- Topology:
  Rendered nodes and channels come from `nodes_hourly` and `channels_hourly`, with channel state enrichment from `group_channel_by_state`.
- Node view:
  The node scene reuses the normalized topology already fetched from FiberDashboard; it does not call a separate per-node upstream endpoint.
- Events:
  The frontend derives presentation events from refresh deltas between successive FiberDashboard snapshots.

## Configuration

- `VITE_FIBER_DASHBOARD_API_URL` sets a shared dashboard base URL for both networks
- `VITE_FIBER_DASHBOARD_MAINNET_API_URL` / `VITE_FIBER_DASHBOARD_TESTNET_API_URL` override dashboard API sources per network

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
