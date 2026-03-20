import type { EchoNetwork, EventFeed, NetworkSimulation, SceneBootstrap } from "@echo/contracts";

const DEFAULT_API_BASE_URL = "/api";
const DEFAULT_POLL_INTERVAL_MS = 8000;

function getApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL;
}

async function fetchJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, init);
  if (!response.ok) {
    let message = `API request failed: ${response.status}`;

    try {
      const payload = await response.json();
      message = payload.message ?? payload.error ?? message;
    } catch {
      // Fall back to the status-only message if the API returns no JSON body.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

function getLatestEventTimestamp(events: SceneBootstrap["recentEvents"]) {
  return events.reduce<string | null>((latest, event) => {
    if (!latest) {
      return event.at;
    }

    return new Date(event.at).getTime() > new Date(latest).getTime() ? event.at : latest;
  }, null);
}

function getLatestTimestamp(left: string | null, right: string) {
  if (!left) {
    return right;
  }

  return new Date(right).getTime() > new Date(left).getTime() ? right : left;
}

export function fetchSceneBootstrap(network: EchoNetwork) {
  return fetchJson<SceneBootstrap>(`/bootstrap?net=${network}`);
}

export function createApiNetworkSimulation(
  network: EchoNetwork,
  initialEvents: SceneBootstrap["recentEvents"] = [],
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS
): NetworkSimulation {
  let timer: number | null = null;
  let stopped = false;
  let activeController: AbortController | null = null;
  let lastSeenAt = getLatestEventTimestamp(initialEvents);
  const seenEventIds = new Set(initialEvents.map((event) => event.id));

  return {
    start(onEvent) {
      if (timer !== null) {
        return;
      }

      stopped = false;

      const poll = async () => {
        const controller = new AbortController();
        activeController = controller;

        try {
          const params = new URLSearchParams({ net: network });
          if (lastSeenAt) {
            params.set("since", lastSeenAt);
          }

          const payload = await fetchJson<EventFeed>(`/events?${params.toString()}`, {
            signal: controller.signal
          });

          if (stopped || activeController !== controller) {
            return;
          }

          for (const event of payload.events) {
            if (seenEventIds.has(event.id)) {
              continue;
            }

            seenEventIds.add(event.id);
            lastSeenAt = getLatestTimestamp(lastSeenAt, event.at);
            onEvent(event);
          }
        } catch {
          // Keep the current scene alive if the adapter becomes briefly unavailable.
        } finally {
          if (activeController === controller) {
            activeController = null;
          }
        }
      };

      void poll();
      timer = window.setInterval(() => {
        void poll();
      }, pollIntervalMs);
    },
    stop() {
      stopped = true;
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }

      activeController?.abort();
      activeController = null;
    }
  };
}
