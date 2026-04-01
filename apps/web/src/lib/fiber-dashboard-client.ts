import type {
  EchoEvent,
  EchoNetwork,
  EventFeed,
  NetworkSimulation,
  SceneBootstrap,
} from "@echo/contracts";

const DEFAULT_DASHBOARD_API_URL = "https://api-dashboard.fiber.channel";
const DEFAULT_POLL_INTERVAL_MS = 30000;
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 2;
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_PAGE_SIZE = 500;
const MAX_DASHBOARD_PAGES = 50;
const MAX_PRESENTATION_EVENTS = 16;
const SNAPSHOT_MEMORY_CACHE_TTL_MS = 5000;
const SNAPSHOT_PERSISTED_CACHE_TTL_MS = 45000;
const SNAPSHOT_PERSISTED_CACHE_PREFIX = "echo-dashboard-snapshot";

type SimulationLifecycleCallbacks = {
  pollIntervalMs?: number;
  maxConsecutiveFailures?: number;
  onUnavailable?: (error: Error) => void;
  onRecovered?: () => void;
};

type RawDashboardChannel = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  createdAt: string;
  lastActiveAt: string;
  enabled: boolean;
  state: string;
  capacity: number;
  activityCount: number;
};

export type DashboardSnapshot = {
  bootstrap: SceneBootstrap;
  rawChannels: Map<string, RawDashboardChannel>;
};

type DashboardSnapshotMemoryEntry = {
  snapshot: DashboardSnapshot;
  fetchedAt: number;
};

type PersistedDashboardSnapshot = {
  fetchedAt: number;
  bootstrap: SceneBootstrap;
  rawChannels: RawDashboardChannel[];
};

type DashboardSource = {
  baseUrl: string;
  network: EchoNetwork;
};

const snapshotMemoryCache = new Map<EchoNetwork, DashboardSnapshotMemoryEntry>();
const snapshotInFlightRequests = new Map<EchoNetwork, Promise<DashboardSnapshot>>();

function getDashboardApiUrl(network: EchoNetwork) {
  if (network === "mainnet") {
    return (
      import.meta.env.VITE_FIBER_DASHBOARD_MAINNET_API_URL ??
      import.meta.env.VITE_FIBER_DASHBOARD_API_URL ??
      DEFAULT_DASHBOARD_API_URL
    );
  }

  return (
    import.meta.env.VITE_FIBER_DASHBOARD_TESTNET_API_URL ??
    import.meta.env.VITE_FIBER_DASHBOARD_API_URL ??
    DEFAULT_DASHBOARD_API_URL
  );
}

function getDashboardSource(network: EchoNetwork): DashboardSource {
  return {
    baseUrl: getDashboardApiUrl(network),
    network,
  };
}

function getCachedSnapshot(network: EchoNetwork, maxAgeMs = SNAPSHOT_MEMORY_CACHE_TTL_MS) {
  const entry = snapshotMemoryCache.get(network);

  if (!entry) {
    return null;
  }

  if (Date.now() - entry.fetchedAt > maxAgeMs) {
    snapshotMemoryCache.delete(network);
    return null;
  }

  return entry.snapshot;
}

function writeSnapshotCache(network: EchoNetwork, snapshot: DashboardSnapshot) {
  snapshotMemoryCache.set(network, {
    snapshot,
    fetchedAt: Date.now(),
  });
}

function getPersistedSnapshotStorageKey(network: EchoNetwork) {
  return `${SNAPSHOT_PERSISTED_CACHE_PREFIX}:${network}`;
}

function hydrateSnapshotFromRawChannels(
  bootstrap: SceneBootstrap,
  rawChannels: RawDashboardChannel[]
): DashboardSnapshot {
  return {
    bootstrap,
    rawChannels: new Map(rawChannels.map((channel) => [channel.id, channel])),
  };
}

function readPersistedSnapshot(network: EchoNetwork, maxAgeMs = SNAPSHOT_PERSISTED_CACHE_TTL_MS) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(getPersistedSnapshotStorageKey(network));
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as PersistedDashboardSnapshot;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.fetchedAt !== "number" ||
      !parsed.bootstrap ||
      !Array.isArray(parsed.rawChannels)
    ) {
      window.localStorage.removeItem(getPersistedSnapshotStorageKey(network));
      return null;
    }

    if (Date.now() - parsed.fetchedAt > maxAgeMs) {
      window.localStorage.removeItem(getPersistedSnapshotStorageKey(network));
      return null;
    }

    return hydrateSnapshotFromRawChannels(parsed.bootstrap, parsed.rawChannels);
  } catch {
    window.localStorage.removeItem(getPersistedSnapshotStorageKey(network));
    return null;
  }
}

function writePersistedSnapshot(network: EchoNetwork, snapshot: DashboardSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const payload: PersistedDashboardSnapshot = {
      fetchedAt: Date.now(),
      bootstrap: snapshot.bootstrap,
      rawChannels: [...snapshot.rawChannels.values()],
    };

    window.localStorage.setItem(getPersistedSnapshotStorageKey(network), JSON.stringify(payload));
  } catch {
    // Ignore storage quota and serialization failures; memory cache still helps in-session.
  }
}

function hashString(value: string) {
  let hash = 0;

  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) % 2147483647;
  }

  return hash;
}

function seededRandom(seed: number) {
  const value = Math.sin(seed) * 10000;
  return value - Math.floor(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getEventTypePriority(type: string) {
  switch (type) {
    case "channel_opened":
      return 0.24;
    case "channel_closed":
      return 0.28;
    case "channel_updated":
      return 0.12;
    default:
      return 0;
  }
}

function isFinalClosedState(state: string) {
  return state === "closed_uncooperative" || state === "closed_cooperative";
}

function isClosingState(state: string) {
  return state === "closed_waiting_onchain_settlement";
}

function isRenderableChannelState(state: string) {
  return state === "open" || isClosingState(state);
}

function toTimeMs(value: string) {
  return new Date(value).getTime();
}

function scoreEvent(event: SceneBootstrap["recentEvents"][number], latestTimeMs: number) {
  const eventTimeMs = toTimeMs(event.at);
  const recencyWindowMs = 30 * 60 * 1000;
  const recencyScore =
    clamp(1 - Math.max(0, latestTimeMs - eventTimeMs) / recencyWindowMs, 0, 1) * 0.22;

  return event.intensity + getEventTypePriority(event.type) + recencyScore;
}

function selectPresentationEvents(events: SceneBootstrap["recentEvents"], limit: number) {
  if (events.length <= limit) {
    return [...events].sort((left, right) => toTimeMs(right.at) - toTimeMs(left.at));
  }

  const latestTimeMs = events.reduce((latest, event) => Math.max(latest, toTimeMs(event.at)), 0);
  const scoredEvents = events
    .map((event, index) => ({
      event,
      index,
      score: scoreEvent(event, latestTimeMs),
    }))
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;
      if (Math.abs(scoreDelta) > 0.0001) {
        return scoreDelta;
      }

      return toTimeMs(right.event.at) - toTimeMs(left.event.at);
    });

  const selected: SceneBootstrap["recentEvents"] = [];
  const seenChannels = new Set<string>();

  for (const entry of scoredEvents) {
    if (selected.length >= limit) {
      break;
    }

    if (entry.event.channelId && seenChannels.has(entry.event.channelId)) {
      continue;
    }

    selected.push(entry.event);
    if (entry.event.channelId) {
      seenChannels.add(entry.event.channelId);
    }
  }

  if (selected.length < limit) {
    for (const entry of scoredEvents) {
      if (selected.length >= limit) {
        break;
      }

      if (selected.includes(entry.event)) {
        continue;
      }

      selected.push(entry.event);
    }
  }

  return selected.sort((left, right) => toTimeMs(right.at) - toTimeMs(left.at));
}

function normalizeLongitude(value: number) {
  let next = value;

  while (next > 180) next -= 360;
  while (next < -180) next += 360;

  return next;
}

function normalizePubkey(value: unknown) {
  if (!value) {
    return null;
  }

  return `0x${String(value).trim().toLowerCase().replace(/^0x/i, "")}`;
}

function parseHexNumber(value: unknown) {
  if (!value) {
    return 0;
  }

  return Number.parseInt(String(value).replace(/^0x/i, ""), 16) || 0;
}

function parseTimestamp(value: unknown) {
  if (!value) {
    return new Date().toISOString();
  }

  if (typeof value === "number") {
    return new Date(value).toISOString();
  }

  if (typeof value === "string" && /^0x/i.test(value)) {
    const parsed = parseHexNumber(value);
    if (parsed > 0) {
      return new Date(parsed).toISOString();
    }
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function normalizeChannelState(value: unknown) {
  if (!value) {
    return "unknown";
  }

  return String(value).trim().toLowerCase();
}

function extractPeerId(addresses: unknown[] = []) {
  const address = addresses.find((value): value is string =>
    typeof value === "string" ? value.includes("/p2p/") : false
  );

  return address ? (address.split("/p2p/").pop() ?? null) : null;
}

function getGraphNodeId(fiberPubkey: string | null, peerId: string | null) {
  return fiberPubkey ?? peerId ?? null;
}

function getFallbackPosition(id: string) {
  const seed = hashString(id);
  const lat = clamp(-48 + seededRandom(seed) * 96, -58, 72);
  const lng = normalizeLongitude(-180 + seededRandom(seed + 17) * 360);

  return { lat, lng };
}

function parseDashboardLocation(loc: unknown, fallbackId: string) {
  if (!loc) {
    return getFallbackPosition(fallbackId);
  }

  const [latText, lngText] = String(loc).split(",");
  const lat = Number.parseFloat(latText);
  const lng = Number.parseFloat(lngText);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return {
      lat: clamp(lat, -58, 72),
      lng: normalizeLongitude(lng),
    };
  }

  return getFallbackPosition(fallbackId);
}

function createPlaceholderNode(
  id: string,
  overrides: Partial<SceneBootstrap["nodes"][number]> = {}
) {
  const { lat, lng } = getFallbackPosition(id);

  return {
    id,
    fiberPubkey: id.startsWith("0x") ? id : undefined,
    peerId: id.startsWith("0x") ? undefined : id,
    label: "",
    lat,
    lng,
    region: "Unknown",
    intensity: 0.28,
    peers: [],
    ...overrides,
  };
}

function createRequestSignal(signal?: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;

  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, DEFAULT_REQUEST_TIMEOUT_MS);

  const abortFromParent = () => controller.abort();

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", abortFromParent, { once: true });
    }
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abortFromParent);
    },
  };
}

async function fetchJson<T>(url: URL, init: RequestInit = {}) {
  const requestSignal = createRequestSignal(init.signal ?? undefined);

  try {
    const response = await fetch(url.toString(), {
      ...init,
      signal: requestSignal.signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}: ${url.toString()}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (requestSignal.didTimeout()) {
      throw new Error(`Request timed out: ${url.toString()}`);
    }

    throw error;
  } finally {
    requestSignal.cleanup();
  }
}

async function fetchDashboardRows<T>(
  source: DashboardSource,
  endpoint: string,
  key: string,
  signal?: AbortSignal
) {
  const rows: T[] = [];
  let page = 0;
  let totalCount = 0;

  for (let pageCount = 0; pageCount < MAX_DASHBOARD_PAGES; pageCount += 1) {
    const url = new URL(
      endpoint,
      source.baseUrl.endsWith("/") ? source.baseUrl : `${source.baseUrl}/`
    );
    url.searchParams.set("page", String(page));
    url.searchParams.set("page_size", String(DEFAULT_PAGE_SIZE));
    url.searchParams.set("net", source.network);

    const payload = await fetchJson<Record<string, unknown>>(url, { signal });
    const nextRows = Array.isArray(payload[key]) ? (payload[key] as T[]) : [];
    rows.push(...nextRows);

    totalCount = Number(payload.total_count ?? rows.length);
    if (rows.length >= totalCount || nextRows.length === 0) {
      break;
    }

    const nextPage = Number(payload.next_page ?? page + 1);
    if (!Number.isFinite(nextPage) || nextPage <= page) {
      break;
    }

    page = nextPage;
  }

  return { rows, totalCount };
}

async function fetchGroupedChannelStates(source: DashboardSource, signal?: AbortSignal) {
  const states = [
    "closed_cooperative",
    "closed_uncooperative",
    "closed_waiting_onchain_settlement",
    "open",
  ];
  const rows: Array<Record<string, unknown>> = [];
  let page = 0;
  let totalCount = 0;

  for (let pageCount = 0; pageCount < MAX_DASHBOARD_PAGES; pageCount += 1) {
    const url = new URL(
      "/group_channel_by_state",
      source.baseUrl.endsWith("/") ? source.baseUrl : `${source.baseUrl}/`
    );
    url.searchParams.set("page", String(page));
    url.searchParams.set("page_size", String(DEFAULT_PAGE_SIZE));
    url.searchParams.set("sort_by", "last_commit_time");
    url.searchParams.set("order", "desc");
    url.searchParams.set("net", source.network);

    states.forEach((state) => {
      url.searchParams.append("state", state);
    });

    const payload = await fetchJson<Record<string, unknown>>(url, { signal });
    const nextRows = Array.isArray(payload.list)
      ? (payload.list as Array<Record<string, unknown>>)
      : [];
    rows.push(...nextRows);

    totalCount = Number(payload.total_count ?? rows.length);
    if (rows.length >= totalCount || nextRows.length === 0) {
      break;
    }

    const nextPage = Number(payload.next_page ?? page + 1);
    if (!Number.isFinite(nextPage) || nextPage <= page) {
      break;
    }

    page = nextPage;
  }

  return { rows, totalCount };
}

async function fetchChannelCountsByState(source: DashboardSource, signal?: AbortSignal) {
  const url = new URL(
    "/channel_count_by_state",
    source.baseUrl.endsWith("/") ? source.baseUrl : `${source.baseUrl}/`
  );
  url.searchParams.set("net", source.network);

  const payload = await fetchJson<Record<string, unknown>>(url, { signal });
  const activeChannelCount = Object.values(payload ?? {}).reduce<number>((sum, assetCounts) => {
    if (!assetCounts || typeof assetCounts !== "object") {
      return sum;
    }

    const typedAssetCounts = assetCounts as Record<string, unknown>;

    return (
      sum +
      Number(typedAssetCounts.open ?? 0) +
      Number(typedAssetCounts.closed_waiting_onchain_settlement ?? 0)
    );
  }, 0);

  return {
    activeChannelCount,
  };
}

function createRawChannelRecord(record: RawDashboardChannel) {
  return {
    id: record.id,
    sourceNodeId: record.sourceNodeId,
    targetNodeId: record.targetNodeId,
    createdAt: record.createdAt,
    lastActiveAt: record.lastActiveAt,
    enabled: record.enabled,
    state: record.state,
    capacity: record.capacity,
    activityCount: record.activityCount,
  };
}

function buildChannelStrength(channel: RawDashboardChannel) {
  return clamp(
    0.28 +
      Math.log10(Math.max(1, channel.capacity)) / 12 +
      Math.min(channel.activityCount, 4) * 0.08 +
      (channel.enabled ? 0.08 : 0),
    0.24,
    1
  );
}

function buildNodeIntensity(
  peers: string[],
  incidentChannels: RawDashboardChannel[],
  maxDegree: number,
  maxActivity: number,
  maxCapacity: number
) {
  const activityLoad = incidentChannels.reduce((sum, channel) => sum + channel.activityCount, 0);
  const capacityLoad = incidentChannels.reduce((sum, channel) => sum + channel.capacity, 0);
  const degreeScore = peers.length / maxDegree;
  const activityScore = activityLoad / maxActivity;
  const capacityScore = capacityLoad / maxCapacity;

  return clamp(0.24 + degreeScore * 0.42 + activityScore * 0.18 + capacityScore * 0.16, 0.22, 0.96);
}

function buildBootstrapEvent(channel: RawDashboardChannel, index: number): EchoEvent {
  const type = isFinalClosedState(channel.state)
    ? "channel_closed"
    : toTimeMs(channel.createdAt) === toTimeMs(channel.lastActiveAt)
      ? "channel_opened"
      : "channel_updated";

  return {
    id: `bootstrap-${channel.id}-${index}`,
    type,
    at: channel.lastActiveAt,
    nodeId: channel.sourceNodeId,
    relatedNodeId: channel.targetNodeId,
    channelId: channel.id,
    intensity: clamp(
      0.38 +
        Math.log10(Math.max(1, channel.capacity)) / 12 +
        Math.min(channel.activityCount, 4) * 0.08,
      0.34,
      0.92
    ),
  };
}

function buildBootstrapFromMaps(
  nodeMap: Map<string, SceneBootstrap["nodes"][number]>,
  rawChannelMap: Map<string, RawDashboardChannel>,
  headlineCounts: SceneBootstrap["headlineCounts"]
): DashboardSnapshot {
  const rawChannels = [...rawChannelMap.values()];
  const visibleChannels = rawChannels.filter((channel) => isRenderableChannelState(channel.state));
  const channels = visibleChannels.map((channel) => ({
    id: channel.id,
    sourceNodeId: channel.sourceNodeId,
    targetNodeId: channel.targetNodeId,
    strength: buildChannelStrength(channel),
    lastActiveAt: channel.lastActiveAt,
  }));

  const nodes = [...nodeMap.values()];
  const peerSets = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  const incidentChannelsByNodeId = new Map(
    nodes.map((node) => [node.id, [] as RawDashboardChannel[]])
  );

  visibleChannels.forEach((channel) => {
    peerSets.get(channel.sourceNodeId)?.add(channel.targetNodeId);
    peerSets.get(channel.targetNodeId)?.add(channel.sourceNodeId);
    incidentChannelsByNodeId.get(channel.sourceNodeId)?.push(channel);
    incidentChannelsByNodeId.get(channel.targetNodeId)?.push(channel);
  });

  const maxDegree = Math.max(1, ...nodes.map((node) => peerSets.get(node.id)?.size ?? 0));
  const maxActivity = Math.max(1, ...visibleChannels.map((channel) => channel.activityCount), 1);
  const maxCapacity = Math.max(1, ...visibleChannels.map((channel) => channel.capacity), 1);

  nodes.forEach((node) => {
    const peers = [...(peerSets.get(node.id) ?? new Set<string>())];
    const incidentChannels = incidentChannelsByNodeId.get(node.id) ?? [];

    node.peers = peers;
    node.intensity = buildNodeIntensity(
      peers,
      incidentChannels,
      maxDegree,
      maxActivity,
      maxCapacity
    );
  });

  const recentEvents = [...rawChannels]
    .sort((left, right) => toTimeMs(right.lastActiveAt) - toTimeMs(left.lastActiveAt))
    .map(buildBootstrapEvent);

  return {
    bootstrap: {
      nodes,
      channels,
      recentEvents: selectPresentationEvents(recentEvents, MAX_PRESENTATION_EVENTS),
      headlineCounts: {
        announcedNodeCount:
          headlineCounts.announcedNodeCount ?? nodes.filter((node) => node.peers.length > 0).length,
        channelCount: headlineCounts.channelCount ?? visibleChannels.length,
      },
    },
    rawChannels: new Map(rawChannels.map((channel) => [channel.id, channel])),
  };
}

function normalizeDashboardSnapshot(
  nodesPayload: Array<Record<string, unknown>>,
  channelsPayload: Array<Record<string, unknown>>,
  channelStatePayload: Array<Record<string, unknown>>,
  headlineCounts: SceneBootstrap["headlineCounts"]
) {
  const nodeMap = new Map<string, SceneBootstrap["nodes"][number]>();
  const rawChannelMap = new Map<string, RawDashboardChannel>();
  const channelStateByOutpoint = new Map(
    channelStatePayload.map((channel) => [String(channel.channel_outpoint), channel])
  );

  nodesPayload.forEach((node) => {
    const fiberPubkey = normalizePubkey(node.node_id ?? node.pubkey);
    const peerId = extractPeerId(Array.isArray(node.addresses) ? node.addresses : []);
    const id = getGraphNodeId(fiberPubkey, peerId);

    if (!id) {
      return;
    }

    const position = parseDashboardLocation(node.loc, id);
    const existingNode = nodeMap.get(id) ?? createPlaceholderNode(id);

    nodeMap.set(id, {
      ...existingNode,
      id,
      fiberPubkey: fiberPubkey ?? undefined,
      peerId: peerId ?? existingNode.peerId,
      label: typeof node.node_name === "string" ? node.node_name.trim() : existingNode.label,
      lat: position.lat,
      lng: position.lng,
      region:
        typeof node.region === "string"
          ? node.region
          : typeof node.country_or_region === "string"
            ? node.country_or_region
            : existingNode.region,
    });
  });

  channelsPayload.forEach((channel) => {
    const sourceNodeId = getGraphNodeId(normalizePubkey(channel.node1), null);
    const targetNodeId = getGraphNodeId(normalizePubkey(channel.node2), null);
    const channelId =
      typeof channel.channel_outpoint === "string" ? channel.channel_outpoint : null;
    const stateRecord = channelId ? channelStateByOutpoint.get(channelId) : undefined;

    if (!sourceNodeId || !targetNodeId || !channelId || rawChannelMap.has(channelId)) {
      return;
    }

    if (!nodeMap.has(sourceNodeId) || !nodeMap.has(targetNodeId)) {
      return;
    }

    rawChannelMap.set(
      channelId,
      createRawChannelRecord({
        id: channelId,
        sourceNodeId,
        targetNodeId,
        createdAt: parseTimestamp(stateRecord?.create_time ?? channel.created_timestamp),
        lastActiveAt: parseTimestamp(
          stateRecord?.last_commit_time ??
            channel.commit_timestamp ??
            channel.last_commit_time ??
            channel.last_seen_hour
        ),
        enabled:
          (channel.update_info_of_node1 as { enabled?: boolean } | undefined)?.enabled !== false &&
          (channel.update_info_of_node2 as { enabled?: boolean } | undefined)?.enabled !== false,
        state: normalizeChannelState(stateRecord?.state ?? channel.state ?? "unknown"),
        capacity: parseHexNumber(stateRecord?.capacity ?? channel.capacity),
        activityCount: Number(stateRecord?.tx_count ?? channel.tx_count ?? 0) || 0,
      })
    );
  });

  return buildBootstrapFromMaps(nodeMap, rawChannelMap, headlineCounts);
}

function buildDeltaEvents(
  previousChannels: Map<string, RawDashboardChannel>,
  nextChannels: Map<string, RawDashboardChannel>
) {
  const events: EventFeed["events"] = [];
  const idSeed = Date.now();
  const now = new Date().toISOString();

  nextChannels.forEach((channel, channelId) => {
    const previous = previousChannels.get(channelId);

    if (!previous) {
      events.push({
        id: `open-${channelId}-${idSeed}`,
        type: "channel_opened",
        at: now,
        nodeId: channel.sourceNodeId,
        relatedNodeId: channel.targetNodeId,
        channelId,
        intensity: 0.74,
      });
      return;
    }

    const stateChanged = channel.state !== previous.state;
    const enabledChanged = channel.enabled !== previous.enabled;
    const activityDelta = channel.activityCount - previous.activityCount;
    const capacityDelta = Math.abs(channel.capacity - previous.capacity);
    const timestampChanged = toTimeMs(channel.lastActiveAt) > toTimeMs(previous.lastActiveAt);
    const movedIntoClosingState = isClosingState(channel.state) && !isClosingState(previous.state);
    const movedIntoFinalClosedState =
      isFinalClosedState(channel.state) && !isFinalClosedState(previous.state);

    if (movedIntoFinalClosedState) {
      events.push({
        id: `closed-${channelId}-${idSeed}`,
        type: "channel_closed",
        at: now,
        nodeId: channel.sourceNodeId,
        relatedNodeId: channel.targetNodeId,
        channelId,
        intensity: 0.82,
      });
      return;
    }

    if (
      stateChanged ||
      enabledChanged ||
      activityDelta > 0 ||
      capacityDelta > 0 ||
      timestampChanged ||
      movedIntoClosingState
    ) {
      const activityBoost = Math.min(Math.max(activityDelta, 0), 4) * 0.04;
      const capacityBoost =
        capacityDelta > 0 ? Math.log10(Math.max(1, capacityDelta || channel.capacity)) / 18 : 0;
      const baseIntensity = isClosingState(channel.state) ? 0.68 : 0.56;

      events.push({
        id: `update-${channelId}-${idSeed}`,
        type: "channel_updated",
        at: now,
        nodeId: channel.sourceNodeId,
        relatedNodeId: channel.targetNodeId,
        channelId,
        intensity: clamp(baseIntensity + activityBoost + capacityBoost, 0.52, 0.78),
      });
    }
  });

  return events;
}

async function fetchDashboardSnapshotFromNetwork(network: EchoNetwork, signal?: AbortSignal) {
  const source = getDashboardSource(network);
  const [nodesResult, channelsResult, channelStateResult, channelCountResult] = await Promise.all([
    fetchDashboardRows<Record<string, unknown>>(source, "/nodes_hourly", "nodes", signal),
    fetchDashboardRows<Record<string, unknown>>(source, "/channels_hourly", "channels", signal),
    fetchGroupedChannelStates(source, signal),
    fetchChannelCountsByState(source, signal),
  ]);

  const snapshot = normalizeDashboardSnapshot(
    nodesResult.rows,
    channelsResult.rows,
    channelStateResult.rows,
    {
      announcedNodeCount: nodesResult.totalCount,
      channelCount: channelCountResult.activeChannelCount,
    }
  );

  writeSnapshotCache(network, snapshot);
  writePersistedSnapshot(network, snapshot);
  return snapshot;
}

export async function fetchDashboardSnapshot(network: EchoNetwork, signal?: AbortSignal) {
  if (signal) {
    return fetchDashboardSnapshotFromNetwork(network, signal);
  }

  const cachedSnapshot = getCachedSnapshot(network);
  if (cachedSnapshot) {
    return cachedSnapshot;
  }

  const existingRequest = snapshotInFlightRequests.get(network);
  if (existingRequest) {
    return existingRequest;
  }

  const request = fetchDashboardSnapshotFromNetwork(network).finally(() => {
    snapshotInFlightRequests.delete(network);
  });

  snapshotInFlightRequests.set(network, request);
  return request;
}

export async function fetchSceneBootstrap(network: EchoNetwork, signal?: AbortSignal) {
  const snapshot = await fetchDashboardSnapshot(network, signal);
  return snapshot.bootstrap;
}

export function createDashboardNetworkSimulation(
  network: EchoNetwork,
  initialSnapshot: DashboardSnapshot,
  callbacks: SimulationLifecycleCallbacks = {}
): NetworkSimulation {
  const pollIntervalMs = callbacks.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxConsecutiveFailures =
    callbacks.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES;
  let timer: number | null = null;
  let stopped = false;
  let activeController: AbortController | null = null;
  let previousSnapshot = initialSnapshot;
  let consecutiveFailures = 0;
  let reportedUnavailable = false;

  return {
    start(onUpdate) {
      if (timer !== null) {
        return;
      }

      stopped = false;

      const scheduleNextPoll = (delayMs: number) => {
        if (stopped) {
          return;
        }

        timer = window.setTimeout(() => {
          void poll();
        }, delayMs);
      };

      const poll = async () => {
        if (activeController) {
          return;
        }

        const controller = new AbortController();
        activeController = controller;
        timer = null;

        try {
          const nextSnapshot = await fetchDashboardSnapshot(network, controller.signal);

          if (stopped || activeController !== controller) {
            return;
          }

          const recovered = reportedUnavailable;
          const events = buildDeltaEvents(previousSnapshot.rawChannels, nextSnapshot.rawChannels);

          previousSnapshot = nextSnapshot;
          consecutiveFailures = 0;
          reportedUnavailable = false;

          onUpdate({
            events,
            headlineCounts: nextSnapshot.bootstrap.headlineCounts,
          });

          if (recovered) {
            callbacks.onRecovered?.();
          }
        } catch (error) {
          if (stopped || controller.signal.aborted || activeController !== controller) {
            return;
          }

          consecutiveFailures += 1;
          if (!reportedUnavailable && consecutiveFailures >= maxConsecutiveFailures) {
            reportedUnavailable = true;
            callbacks.onUnavailable?.(
              error instanceof Error ? error : new Error("Live dashboard polling failed")
            );
          }
        } finally {
          if (activeController === controller) {
            activeController = null;
          }

          if (!stopped) {
            scheduleNextPoll(pollIntervalMs);
          }
        }
      };

      scheduleNextPoll(pollIntervalMs);
    },
    stop() {
      stopped = true;
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }

      activeController?.abort();
      activeController = null;
    },
  };
}
