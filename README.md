# Echo

Echo is a visual + sonic demo for the Fiber network. It has two scenes: a full-screen world map that shows distributed network activity, and a node-focused resonance view that narrows attention to one node and its connected peers.

## Current Stack

- React + TypeScript + Vite
- Zustand
- Shared contracts package in `packages/contracts`
- Current rendering: Pixi-based renderer with a `d3-geo` world-map foundation
- Current audio: custom Web Audio guqin-inspired system
- Planned backend: thin adapter over Fiber/dashboard or explorer APIs

## Current Features

- Full-screen world map as the default view
- Hash-based scene routing with `#node` for the focused node view
- Clickable nodes on the map
- Search by node ID
- Empty state overlay for unmatched search
- Atmospheric projected world map with a restrained black-and-white treatment
- Node-to-local-view transition carries the selected node into the focused scene
- Minimal map overlay with a search field only
- Right-side node details only in the node view
- 20-node mock network with connected channels
- Map ambient bed with distributed node-trigger pulses and ripples
- Selected-node local resonance behavior with a centered main node and scattered direct peers
- Thin connection lines between the selected node and direct peers
- Collision echoes in the node scene with secondary rings and capped recursion via `rippleLayer`
- Visible node IDs rendered as derived truncated hexadecimal values while internal graph IDs stay unchanged
- Copy-to-clipboard action for node IDs with overlay feedback
- Minimal black-and-white UI with sound toggle and density control

## Project Structure

```text
apps/
  api/        Backend placeholder for ingest and live streaming
  web/        UI, scenes, state, Pixi renderer, and audio engine
    src/lib/  Shared helpers for node IDs, queries, map projection, and reusable client logic
    src/ui/pixi/  Pixi scene and transition rendering
packages/
  contracts/  Shared types for nodes, channels, events, and audio metadata
```

## Run Locally

```bash
npm install
npm run dev
npm run build
```

The default `dev` script starts the web app workspace.

## Architecture Notes

- Data is still mock-driven
- Rendering uses Pixi, with `d3-geo` providing the projection-based world map
- Live Fiber ingestion is not implemented yet
- The sonic system is fixed to a D pentatonic, guqin-inspired design
- Search is wired to direct node lookup and an empty-state overlay for unmatched IDs
- The node scene reseeds peer layout on entry so repeated visits feel different
- Collision-generated echo rings are capped to prevent noisy feedback loops

## Next Steps

- Stabilize and refine the Pixi renderer
- Connect to real Fiber-backed data
- Continue tuning sound density, resonance timing, and scene feel
