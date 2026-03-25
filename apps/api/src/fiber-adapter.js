const DASHBOARD_API_URLS = {
  mainnet: process.env.FIBER_DASHBOARD_MAINNET_API_URL ?? "https://api-dashboard.fiber.channel",
  testnet: process.env.FIBER_DASHBOARD_TESTNET_API_URL ?? "https://api-dashboard.fiber.channel",
};

export const PORT = Number(process.env.PORT ?? 8787);
export const REFRESH_INTERVAL_MS = Number(process.env.FIBER_REFRESH_INTERVAL_MS ?? 8000);

const DEFAULT_PAGE_SIZE = 500;
const MAX_DASHBOARD_PAGES = 50;
export const MAX_PRESENTATION_EVENTS = 16;
const MAX_BOOTSTRAP_EVENT_WINDOW = 24;
const MAX_STORE_EVENTS = 400;

function hashString(value) {
  let hash = 0;

  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) % 2147483647;
  }

  return hash;
}

function seededRandom(seed) {
  const value = Math.sin(seed) * 10000;
  return value - Math.floor(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getEventTypePriority(type) {
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

function isFinalClosedState(state) {
  return state === "closed_uncooperative" || state === "closed_cooperative";
}

function isClosingState(state) {
  return state === "closed_waiting_onchain_settlement";
}

function isRenderableChannelState(state) {
  return state === "open" || isClosingState(state);
}

function scoreEvent(event, latestTimeMs) {
  const eventTimeMs = toTimeMs(event.at);
  const recencyWindowMs = 30 * 60 * 1000;
  const recencyScore =
    clamp(1 - Math.max(0, latestTimeMs - eventTimeMs) / recencyWindowMs, 0, 1) * 0.22;
  return event.intensity + getEventTypePriority(event.type) + recencyScore;
}

export function selectPresentationEvents(events, limit) {
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

  const selected = [];
  const seenChannels = new Set();

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

function normalizeLongitude(value) {
  let next = value;

  while (next > 180) next -= 360;
  while (next < -180) next += 360;

  return next;
}

export function parseNetwork(value) {
  return value === "mainnet" ? "mainnet" : "testnet";
}

function normalizePubkey(value) {
  if (!value) {
    return null;
  }

  return `0x${String(value).trim().toLowerCase().replace(/^0x/i, "")}`;
}

function parseHexNumber(value) {
  if (!value) {
    return 0;
  }

  return Number.parseInt(String(value).replace(/^0x/i, ""), 16) || 0;
}

function parseTimestamp(value) {
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

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function normalizeChannelState(value) {
  if (!value) {
    return "unknown";
  }

  return String(value).trim().toLowerCase();
}

function toTimeMs(value) {
  return new Date(value).getTime();
}

function extractPeerId(addresses = []) {
  const address = addresses.find((value) => value.includes("/p2p/"));
  return address ? address.split("/p2p/").pop() : null;
}

function getGraphNodeId(fiberPubkey, peerId) {
  return fiberPubkey ?? peerId ?? null;
}

function getFallbackPosition(id) {
  const seed = hashString(id);
  const lat = clamp(-48 + seededRandom(seed) * 96, -58, 72);
  const lng = normalizeLongitude(-180 + seededRandom(seed + 17) * 360);

  return { lat, lng };
}

function parseDashboardLocation(loc, fallbackId) {
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

function createPlaceholderNode(id, overrides = {}) {
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

async function fetchJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}: ${url}`);
  }

  return response.json();
}

async function fetchDashboardRows(baseUrl, endpoint, key, network) {
  const rows = [];
  let page = 0;
  let totalCount = 0;

  for (let pageCount = 0; pageCount < MAX_DASHBOARD_PAGES; pageCount += 1) {
    const url = new URL(endpoint, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("page_size", String(DEFAULT_PAGE_SIZE));
    url.searchParams.set("net", network);

    const payload = await fetchJson(url);
    const nextRows = Array.isArray(payload[key]) ? payload[key] : [];
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

async function fetchGroupedChannelStates(baseUrl, network) {
  const states = [
    "closed_cooperative",
    "closed_uncooperative",
    "closed_waiting_onchain_settlement",
    "open",
  ];
  return fetchGroupedChannelStatesByFilter(baseUrl, network, states);
}

async function fetchGroupedChannelStatesByFilter(baseUrl, network, states) {
  const rows = [];
  let page = 0;
  let totalCount = 0;

  for (let pageCount = 0; pageCount < MAX_DASHBOARD_PAGES; pageCount += 1) {
    const url = new URL("/group_channel_by_state", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("page_size", String(DEFAULT_PAGE_SIZE));
    url.searchParams.set("sort_by", "last_commit_time");
    url.searchParams.set("order", "desc");
    url.searchParams.set("net", network);
    states.forEach((state) => {
      url.searchParams.append("state", state);
    });

    const payload = await fetchJson(url);
    const nextRows = Array.isArray(payload.list) ? payload.list : [];
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

async function fetchChannelCountsByState(baseUrl, network) {
  const url = new URL("/channel_count_by_state", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  url.searchParams.set("net", network);

  const payload = await fetchJson(url);
  const activeChannelCount = Object.values(payload ?? {}).reduce((sum, assetCounts) => {
    if (!assetCounts || typeof assetCounts !== "object") {
      return sum;
    }

    return (
      sum +
      Number(assetCounts.open ?? 0) +
      Number(assetCounts.closed_waiting_onchain_settlement ?? 0)
    );
  }, 0);

  return {
    activeChannelCount,
  };
}

function createRawChannelRecord(record) {
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

function createDefaultHeadlineCounts() {
  return {
    announcedNodeCount: 0,
    channelCount: 0,
  };
}

function buildChannelStrength(channel) {
  return clamp(
    0.28 +
      Math.log10(Math.max(1, channel.capacity)) / 12 +
      Math.min(channel.activityCount, 4) * 0.08 +
      (channel.enabled ? 0.08 : 0),
    0.24,
    1
  );
}

function buildNodeIntensity(peers, incidentChannels, maxDegree, maxActivity, maxCapacity) {
  const activityLoad = incidentChannels.reduce((sum, channel) => sum + channel.activityCount, 0);
  const capacityLoad = incidentChannels.reduce((sum, channel) => sum + channel.capacity, 0);
  const degreeScore = peers.length / maxDegree;
  const activityScore = activityLoad / maxActivity;
  const capacityScore = capacityLoad / maxCapacity;

  return clamp(0.24 + degreeScore * 0.42 + activityScore * 0.18 + capacityScore * 0.16, 0.22, 0.96);
}

function buildBootstrapEvent(channel, index) {
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

function buildBootstrapFromMaps(nodeMap, rawChannelMap, headlineCounts) {
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
  const peerSets = new Map(nodes.map((node) => [node.id, new Set()]));
  const incidentChannelsByNodeId = new Map(nodes.map((node) => [node.id, []]));

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
    const peers = [...(peerSets.get(node.id) ?? new Set())];
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
          headlineCounts?.announcedNodeCount ??
          nodes.filter((node) => node.peers.length > 0).length,
        channelCount: headlineCounts?.channelCount ?? visibleChannels.length,
      },
    },
    rawChannels: new Map(rawChannels.map((channel) => [channel.id, channel])),
  };
}

function normalizeDashboardSnapshot(
  nodesPayload,
  channelsPayload,
  channelStatePayload,
  headlineCounts
) {
  const nodeMap = new Map();
  const rawChannelMap = new Map();
  const channelStateByOutpoint = new Map(
    channelStatePayload.map((channel) => [channel.channel_outpoint, channel])
  );

  nodesPayload.forEach((node) => {
    const fiberPubkey = normalizePubkey(node.node_id ?? node.pubkey);
    const peerId = extractPeerId(node.addresses ?? []);
    const id = getGraphNodeId(fiberPubkey, peerId);

    if (!id) {
      return;
    }

    const position = parseDashboardLocation(node.loc, id);
    const existingNode = nodeMap.get(id) ?? createPlaceholderNode(id);

    nodeMap.set(id, {
      ...existingNode,
      id,
      fiberPubkey,
      peerId: peerId ?? existingNode.peerId,
      label: typeof node.node_name === "string" ? node.node_name.trim() : existingNode.label,
      lat: position.lat,
      lng: position.lng,
      region: node.region || node.country_or_region || existingNode.region,
    });
  });

  channelsPayload.forEach((channel) => {
    const sourceNodeId = getGraphNodeId(normalizePubkey(channel.node1), null);
    const targetNodeId = getGraphNodeId(normalizePubkey(channel.node2), null);
    const channelId = channel.channel_outpoint;
    const stateRecord = channelStateByOutpoint.get(channelId);

    if (!sourceNodeId || !targetNodeId || rawChannelMap.has(channelId)) {
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
          channel.update_info_of_node1?.enabled !== false &&
          channel.update_info_of_node2?.enabled !== false,
        state: normalizeChannelState(stateRecord?.state ?? channel.state ?? "unknown"),
        capacity: parseHexNumber(stateRecord?.capacity ?? channel.capacity),
        activityCount: Number(stateRecord?.tx_count ?? channel.tx_count ?? 0) || 0,
      })
    );
  });

  return buildBootstrapFromMaps(nodeMap, rawChannelMap, headlineCounts);
}

async function fetchDashboardBootstrap(source) {
  const [nodesResult, channelsResult, channelStateResult, channelCountResult] = await Promise.all([
    fetchDashboardRows(source.baseUrl, "/nodes_hourly", "nodes", source.network),
    fetchDashboardRows(source.baseUrl, "/channels_hourly", "channels", source.network),
    fetchGroupedChannelStates(source.baseUrl, source.network),
    fetchChannelCountsByState(source.baseUrl, source.network),
  ]);

  return normalizeDashboardSnapshot(
    nodesResult.rows,
    channelsResult.rows,
    channelStateResult.rows,
    {
      announcedNodeCount: nodesResult.totalCount,
      channelCount: channelCountResult.activeChannelCount,
    }
  );
}

function getDashboardSource(network) {
  const baseUrl = DASHBOARD_API_URLS[network];
  return baseUrl ? { kind: "dashboard-api", network, baseUrl } : null;
}

export function getSourceDefinitions(network) {
  const dashboardSource = getDashboardSource(network);
  return dashboardSource ? [dashboardSource] : [];
}

function buildDeltaEvents(previousChannels, nextChannels) {
  const events = [];
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
      return;
    }
  });

  return events;
}

export function createAdapterStore() {
  return {
    bootstrap: null,
    rawChannels: new Map(),
    recentEvents: [],
    lastRefreshAt: null,
    lastError: null,
    sourceKind: null,
    refreshInFlight: false,
    refreshToken: 0,
  };
}

export async function refreshAdapterStore(store, sources) {
  if (sources.length === 0) {
    throw new Error("No dashboard source configured for this network");
  }

  const source = sources[0];
  const refreshToken = store.refreshToken + 1;
  store.refreshToken = refreshToken;
  const nextSnapshot = await fetchDashboardBootstrap(source);

  if (refreshToken !== store.refreshToken) {
    return;
  }

  const deltaEvents =
    store.rawChannels.size > 0 ? buildDeltaEvents(store.rawChannels, nextSnapshot.rawChannels) : [];
  const mergedBootstrapEvents = [...deltaEvents, ...nextSnapshot.bootstrap.recentEvents];

  store.bootstrap = {
    ...nextSnapshot.bootstrap,
    recentEvents: selectPresentationEvents(mergedBootstrapEvents, MAX_BOOTSTRAP_EVENT_WINDOW),
  };
  store.rawChannels = nextSnapshot.rawChannels;
  store.recentEvents = [...deltaEvents, ...store.recentEvents].slice(0, MAX_STORE_EVENTS);
  store.lastRefreshAt = new Date().toISOString();
  store.lastError = null;
  store.sourceKind = source.kind;
}

export { createDefaultHeadlineCounts };
