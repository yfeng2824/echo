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
- Avoid cut-style transitions
- Shared logic should live in reusable helpers under `apps/web/src/lib`
- Visible node IDs use a derived truncated hexadecimal display format; internal graph IDs must stay unchanged
- Collision echoes in the node scene must remain capped with the `rippleLayer` recursion limit

## Implementation Rules
- Preserve desktop-first demo quality
- Keep a mock-data path during development
- Make audio opt-in
- Keep visuals minimal and black/white
- Feedback interactions should stay minimal and use overlays rather than layout-shifting text
- Comments should stay short and only explain non-obvious timing, sonic, or collision behavior
- Preserve the fixed guqin-inspired pentatonic sonic system unless explicitly changed
