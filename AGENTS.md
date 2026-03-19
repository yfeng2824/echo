# AGENTS.md

- Project: Echo
- Purpose: visual + sonic demo for Fiber network liveness
- Treat this as a demo, not a production dashboard

## Priorities
- Prefer clarity over feature count
- Prefer atmosphere over analytics detail
- Prefer fast iteration over infrastructure depth
- Avoid unnecessary complexity

## Architecture
- Keep simulation separate from rendering
- Keep interaction separate from rendering
- Keep audio separate from rendering
- Keep shared types in `packages/contracts`

## Implementation Rules
- Preserve desktop-first demo quality
- Keep a mock-data path during development
- Make audio opt-in
- Keep visuals minimal and black/white
- Preserve the fixed guqin-inspired pentatonic sonic system unless explicitly changed
