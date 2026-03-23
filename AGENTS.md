# AGENTS.md

- Project: Echo
- Purpose: visual + sonic demo for Fiber network liveness
- Treat this as a demo, not a production dashboard

## Build Rules
- Add Fastify adapters in `apps/api`.
- Keep shared types in `packages/contracts`.
- Put reusable frontend helpers in `apps/web/src/lib`.
- Route frontend data access through the app API layer, not upstream services directly.
- Keep simulation, rendering, interaction, and audio in separate modules.
- Keep Pixi as the rendering layer; keep controls and overlays outside Pixi.

## UX Rules
- Optimize for atmosphere and legibility, not dense analytics.
- Keep the visual language minimal and black/white.
- Keep the map treatment atmospheric; avoid dashboard or political-map styling.
- Keep transitions continuous; avoid cut-style scene changes.
- Keep interactions lightweight; prefer overlays over layout-shifting feedback.
- Invalid manual node URLs should trigger explicit "not found" UX, not silent fallback.
- Preserve desktop-first quality.

## Data And Audio Rules
- Use derived truncated hex IDs for visible node labels; do not change internal graph IDs.
- Keep collision echoes capped with the `rippleLayer` recursion limit.
- Keep audio default-on with a short startup mute gate; when sound is toggled off, mute audio only and preserve visual motion.
- Preserve the pentatonic system with user-selectable root (default `C`) unless the task explicitly changes it.

## Code Style
- Remove unnecessary complexity before adding new structure.
- Add comments only for non-obvious timing, sonic, or collision behavior.
