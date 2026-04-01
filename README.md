# Echo

## What Echo Is

Echo is an audiovisual demo that makes the Fiber network more perceptible through motion and sound. Rather than functioning as a traditional dashboard, it presents network presence and activity as something you can both see and hear.

## How It Works

Echo uses live data from the Fiber Dashboard API (`https://api-dashboard.fiber.channel`) to visualize Fiber nodes and channels and to drive event-based audio.

The app polls data every 30 seconds and compares snapshots between refreshes to detect network changes. From those deltas, Echo derives channel-related events such as `channel_opened`, `channel_updated`, and `channel_closed`. These events shape both the visual system and the sound system.

### Visual + Audio Behavior

- Announced nodes are rendered on a world map, with small geo-location adjustments to reduce overlap
- Network changes are expressed through motion, transitions, and event-driven sound cues
- Even when no major event is detected, ambient motion and sound remain present to suggest ongoing network life
- Distinct musical motifs are used for channel opening, closing, and updating
- Layered transient voices respond to event intensity and node connectivity
- When focusing on a single node, Echo can generate node-specific phrases tied to its local network relationships
- Hidden easter egg sequences can be triggered by certain typed words

Echo’s sound system is built with the Web Audio API and combines an ambient bed with event-driven melodic responses. The result is not just a display of network activity, but a continuous audiovisual interpretation of network presence.

## Current Limitations

Echo is only as live as its data source. The demo currently listens to the Fiber Dashboard API, which refreshes every 30 seconds. Because of that, Echo reflects network activity through the same refresh cycle rather than through a fully real-time event stream.

This means Echo should be understood as an expressive interpretation of network liveness, not a literal second-by-second view of everything happening on Fiber.

## Project Structure

```text
apps/
  web/                Vite app for the Echo experience
    src/app/          App shell and top-level React wiring
    src/engine/       Audio engine and simulation-facing runtime logic
    src/lib/          API client, Fiber data shaping, map helpers, and shared utilities
    src/scenes/       Scene-specific behavior for the world map and node resonance views
    src/state/        Zustand store and app state transitions
    src/styles/       Global styles for the experience
    src/ui/           React UI and Pixi rendering surface
      pixi/           Map and node scene rendering, transitions, and interaction layers
packages/
  contracts/          Shared API, model, and event types used across the app
```

## Local Development

```bash
npm install
npm run dev
npm run build
npm run preview
npm run format
```
`npm run dev` starts the web app at `http://localhost:5173`.

## FAQ

### How often does Echo fetch live data?

Echo fetches data every 30 seconds, matching the same refresh frequency used by the Fiber Dashboard for its key metrics.

### Why is there a mismatch between the node and channel counts in Echo and the Fiber Dashboard?

The announced node count in Echo should match the Fiber Dashboard. The channel count can differ because Echo focuses on representing network liveness. Its active channel count excludes closed channels, while the Fiber Dashboard may include them in other views or aggregates.

You may also notice a difference between Echo’s active channel count and the channels shown on the map. This happens because the map drops a channel if either endpoint is not announced.

### Why make something like this?

Echo was not made to solve a direct utility problem.

It is an experiment in perceiving the Fiber network differently — not just through metrics and status, but through motion, sound, and presence. The goal is to explore a more emotional and expressive way of relating to the network, and to suggest that community tools can also be cultural, atmospheric, and art-driven.
