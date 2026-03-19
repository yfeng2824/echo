# Echo

Echo is a visual + motion demo for the Fiber network.

## Stack

- Frontend: React + TypeScript + Vite
- State: Zustand
- Planned rendering engine: PixiJS
- Planned motion layer: Motion
- Planned audio layer: Tone.js
- Shared contracts: workspace package
- Planned backend: Fastify adapter over Fiber/dashboard or explorer APIs

## Project structure

```text
apps/
  api/        Backend placeholder for ingest and live streaming
  web/        React app shell and scene placeholders
packages/
  contracts/  Shared types for nodes, channels, bootstrap data, and events
```

## Setup

```bash
npm install
npm run dev
```

The default `dev` script starts the web app workspace.

## Current scaffold

- Base app shell
- Scene routing with URL hash sync
- World map placeholder
- Node resonance placeholder
- Mock nodes, channels, and events
- Simulation placeholder
- Audio engine placeholder
- Shared contracts package

## Architecture notes

- Keep simulation, rendering, interaction, and audio separate.
- The current world map and node resonance scenes are placeholders only.
- The visual layer is intentionally DOM-based for now.
- TODO: replace placeholder scene content with Pixi-powered rendering.
- TODO: replace mock activity loop with real backend bootstrap + live stream data.
- TODO: connect audio triggers to actual simulation events.

