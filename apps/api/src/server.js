import Fastify from "fastify";
import {
  PORT,
  REFRESH_INTERVAL_MS,
  createDefaultHeadlineCounts,
  createAdapterStore,
  getSourceDefinitions,
  parseNetwork,
  refreshAdapterStore,
} from "./fiber-adapter.js";

const app = Fastify({ logger: true });
const stores = {
  mainnet: createAdapterStore(),
  testnet: createAdapterStore(),
};

async function refreshNetwork(network) {
  const store = stores[network];

  if (store.refreshInFlight) {
    return;
  }

  store.refreshInFlight = true;

  try {
    await refreshAdapterStore(store, getSourceDefinitions(network));
  } catch (error) {
    store.lastError = error instanceof Error ? error.message : "Unknown adapter error";
    app.log.error({ network, error }, "Fiber adapter refresh failed");
  } finally {
    store.refreshInFlight = false;
  }
}

app.get("/health", async (request) => {
  const network = parseNetwork(request.query?.net);
  const store = stores[network];

  return {
    ok: store.bootstrap !== null,
    network,
    sourceKind: store.sourceKind,
    sourceCount: getSourceDefinitions(network).length,
    lastRefreshAt: store.lastRefreshAt,
    lastError: store.lastError,
  };
});

app.get("/bootstrap", async (request, reply) => {
  const network = parseNetwork(request.query?.net);
  const store = stores[network];

  if (!store.bootstrap) {
    try {
      await refreshAdapterStore(store, getSourceDefinitions(network));
    } catch (error) {
      store.lastError = error instanceof Error ? error.message : "Unknown adapter error";
      reply.code(503);

      return {
        error: "bootstrap_unavailable",
        network,
        message: store.lastError,
      };
    }
  }

  return store.bootstrap;
});

app.get("/events", async (request) => {
  const network = parseNetwork(request.query?.net);
  const store = stores[network];
  const since = typeof request.query?.since === "string" ? request.query.since : null;
  const events = since
    ? store.recentEvents.filter(
        (event) => new Date(event.at).getTime() >= new Date(since).getTime()
      )
    : store.recentEvents;

  return {
    events: [...events].sort(
      (left, right) => new Date(left.at).getTime() - new Date(right.at).getTime()
    ),
    headlineCounts: store.bootstrap?.headlineCounts ?? createDefaultHeadlineCounts(),
  };
});

await Promise.all([refreshNetwork("testnet"), refreshNetwork("mainnet")]);
setInterval(() => {
  void refreshNetwork("testnet");
  void refreshNetwork("mainnet");
}, REFRESH_INTERVAL_MS);

app.listen({ host: "0.0.0.0", port: PORT }).then(() => {
  app.log.info(`Echo API listening on http://127.0.0.1:${PORT}`);
});
