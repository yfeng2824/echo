# Echo

Echo is a visual + sonic demo for the Fiber network. It has two scenes: a full-screen world map that shows distributed network activity, and a node-focused resonance view that narrows attention to one node and its connected peers.

## Current Stack

- React + TypeScript + Vite
- Zustand
- Shared contracts package in `packages/contracts`
- Current rendering: custom canvas renderer
- Planned rendering upgrade: PixiJS
- Current audio: custom Web Audio guqin-inspired system
- Planned backend: thin adapter over Fiber/dashboard or explorer APIs

## Current Features

- Full-screen world map as the default view
- Clean default URL for the map; `#node` for the focused node view
- Clickable nodes on the map
- Right-side node details only in the node view
- 20-node mock network with connected channels
- Map ambient bed with distributed node-trigger pulses and ripples
- Selected-node local resonance behavior
- Minimal black-and-white UI with sound toggle and density control

## Project Structure

```text
apps/
  api/        Backend placeholder for ingest and live streaming
  web/        UI, scenes, state, canvas renderer, and audio engine
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
- Rendering is still canvas-based, not Pixi yet
- Live Fiber ingestion is not implemented yet
- The sonic system is fixed to a D pentatonic, guqin-inspired design

## Next Steps

- Replace the canvas renderer with Pixi scenes
- Connect to real Fiber-backed data
- Continue tuning sound density, resonance timing, and scene feel

