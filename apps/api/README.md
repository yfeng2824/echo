# Echo API

Fastify adapter service for the Echo demo.

## Current Responsibilities

- Bootstrap topology and recent activity for the frontend
- Normalize upstream Fiber dashboard payloads into shared Echo contracts
- Keep a short rolling event history so the frontend can poll without losing continuity
- Expose health, bootstrap, and recent-event endpoints for the web app

## Current Endpoints

- `GET /health`
- `GET /bootstrap?net=mainnet|testnet`
- `GET /events?net=...&since=...`

## Source Selection

- The adapter uses dashboard API sources for both `mainnet` and `testnet`.
- Dashboard API URLs can be overridden with `FIBER_DASHBOARD_MAINNET_API_URL` and `FIBER_DASHBOARD_TESTNET_API_URL`.

## Future Work

- Add push-style delivery such as WebSocket streaming
- Add persistence or caching beyond the in-memory rolling window
- Expand source coverage and operational visibility as the demo matures
