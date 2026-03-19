# AGENTS.md

- Project: Echo
- Purpose: visual + sonic demo for the Fiber network liveness
- Goal: make network liveness perceptible through motion and sound
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
- Share types through a small contracts layer
- Add abstractions only when used by more than one scene or subsystem

## Product boundaries
- Build only the world map view and node resonance view for V1
- Do not add tables, admin tools, auth, or generic dashboard UI
- Do not add full map product features unless explicitly requested

## Implementation rules
- Preserve desktop-first demo quality
- Use real data through a thin adapter layer when needed
- Keep mock data paths available during development
- Make audio opt-in
- Keep visuals stylized and minimal
- Optimize changes for scene feel, timing, and responsiveness

