# AGENTS.md

## Project

- Echo is a visual + sonic demo for Fiber network liveness.
- Do not turn it into a cold dashboard or analytics tool.
- Do not use mock, fake, or rewritten data.

## Data

- Keep one consistent data access strategy per data type.
- Prefer `apps/web/src/lib/fiber-dashboard-client.ts` for dashboard fetch, snapshot shaping, caching, and polling.
- Keep derived events and simulation state faithful to the live Fiber Dashboard data model.
- Use motion and sound to express liveness without changing underlying data.
- Expose invalid states clearly.
- Do not invent fallback behavior for ambiguous cases; discuss first.

## UX

- Follow a less-is-more approach.
- Choose the simplest solution that fully solves the problem.
- Every interactive element should provide immediate feedback.
- Prefer continuous micro-motion over abrupt state changes.
- Design desktop-first, with a fully responsive experience across all screen sizes.

## Engineering

- Fix root causes, not surface symptoms.
- Do not trade main-path quality for edge-case handling.
- Reuse helpers and components instead of duplicating code.
- Avoid hacks, fake fallbacks, and logic that is not faithful to the real system.

## Architecture

- Keep simulation, rendering, interaction, and audio separate.
- Keep behavior consistent across the product.

## Development

- Prefer the root workspace scripts for local work:
- `npm run dev` for the local app
- `npm run build` for production builds
- `npm run preview` to serve the production build locally
- `npm run format` before landing broad formatting changes

## Commits

- Run Prettier before every commit.
- Follow Conventional Commits and use `<type>: <description>`
- Keep messages lowercase, short, specific, and imperative.
