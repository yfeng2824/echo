import { create } from "zustand";
import type {
  AudioEngine,
  AudioSettings,
  EchoChannel,
  EchoEvent,
  EventFeed,
  EchoNetwork,
  EchoNode,
  HeadlineCounts,
  NetworkSimulation,
  SceneId,
} from "@echo/contracts";

type InitializeInput = {
  simulation: NetworkSimulation;
  audio: AudioEngine;
  nodes: EchoNode[];
  channels: EchoChannel[];
  recentEvents: EchoEvent[];
  headlineCounts: HeadlineCounts;
};

export type NetworkStatus = "loading" | "ready" | "unavailable";

type MapSearchTransition = {
  nodeId: string;
  startedAt: number;
};

type AppState = {
  activeScene: SceneId;
  currentNetwork: EchoNetwork;
  networkStatus: NetworkStatus;
  networkError: string | null;
  networkTransitionVisible: boolean;
  invalidNodeRouteId: string | null;
  selectedNodeId: string | null;
  nodeSceneEnteredAt: number | null;
  mapSearchTransition: MapSearchTransition | null;
  audioEnabled: boolean;
  audioSettings: AudioSettings;
  nodes: EchoNode[];
  channels: EchoChannel[];
  recentEvents: EchoEvent[];
  headlineCounts: HeadlineCounts;
  simulation: NetworkSimulation | null;
  audio: AudioEngine | null;
  initialize: (input: InitializeInput) => void;
  appendEvent: (event: EchoEvent) => void;
  applyEventFeed: (feed: EventFeed) => void;
  setNetwork: (network: EchoNetwork) => void;
  setNetworkState: (status: AppState["networkStatus"], error?: string | null) => void;
  setNetworkTransitionVisible: (visible: boolean) => void;
  setInvalidNodeRouteId: (nodeId: string | null) => void;
  setScene: (scene: SceneId) => void;
  selectNode: (nodeId: string) => void;
  startMapSearchTransition: (nodeId: string) => void;
  clearMapSearchTransition: () => void;
  goToMap: () => void;
  setAudioSettings: (nextSettings: Partial<AudioSettings>) => void;
  toggleAudio: () => void;
};

const defaultAudioSettings: AudioSettings = {
  density: "balanced",
  timbrePreset: "standard",
  root: "C",
};

const defaultHeadlineCounts: HeadlineCounts = {
  announcedNodeCount: 0,
  channelCount: 0,
};

function derivePeersFromChannels(nodes: EchoNode[], channels: EchoChannel[]) {
  const peerSets = new Map(nodes.map((node) => [node.id, new Set<string>()]));

  channels.forEach((channel) => {
    peerSets.get(channel.sourceNodeId)?.add(channel.targetNodeId);
    peerSets.get(channel.targetNodeId)?.add(channel.sourceNodeId);
  });

  return nodes.map((node) => {
    const peers = [...(peerSets.get(node.id) ?? new Set<string>())].sort();
    return {
      ...node,
      peers,
    };
  });
}

function applyChannelLifecycleEvent(nodes: EchoNode[], channels: EchoChannel[], event: EchoEvent) {
  if (!event.channelId) {
    return { nodes, channels };
  }

  const relatedNodeId = event.relatedNodeId ?? null;
  const hasPrimaryNode = nodes.some((node) => node.id === event.nodeId);
  const hasRelatedNode = relatedNodeId ? nodes.some((node) => node.id === relatedNodeId) : false;
  let nextChannels = channels;

  if (event.type === "channel_closed") {
    if (!channels.some((channel) => channel.id === event.channelId)) {
      return { nodes, channels };
    }

    nextChannels = channels.filter((channel) => channel.id !== event.channelId);
    return {
      nodes: derivePeersFromChannels(nodes, nextChannels),
      channels: nextChannels,
    };
  }

  if (event.type === "channel_opened") {
    if (!relatedNodeId || !hasPrimaryNode || !hasRelatedNode) {
      return { nodes, channels };
    }

    const existingChannel = channels.find((channel) => channel.id === event.channelId);
    nextChannels = existingChannel
      ? channels.map((channel) =>
          channel.id === event.channelId
            ? {
                ...channel,
                sourceNodeId: event.nodeId,
                targetNodeId: relatedNodeId,
                lastActiveAt: event.at,
              }
            : channel
        )
      : [
          {
            id: event.channelId,
            sourceNodeId: event.nodeId,
            targetNodeId: relatedNodeId,
            strength: Math.max(0.42, Math.min(1, 0.46 + event.intensity * 0.4)),
            lastActiveAt: event.at,
          },
          ...channels,
        ];

    return {
      nodes: derivePeersFromChannels(nodes, nextChannels),
      channels: nextChannels,
    };
  }

  if (event.type === "channel_updated") {
    if (!channels.some((channel) => channel.id === event.channelId)) {
      return { nodes, channels };
    }

    nextChannels = channels.map((channel) =>
      channel.id === event.channelId
        ? {
            ...channel,
            lastActiveAt: event.at,
          }
        : channel
    );

    return {
      nodes,
      channels: nextChannels,
    };
  }

  return { nodes, channels };
}

function getInitialNetwork(): EchoNetwork {
  if (typeof window === "undefined") {
    return "testnet";
  }

  const saved = window.localStorage.getItem("echo-network");
  return saved === "mainnet" || saved === "testnet" ? saved : "testnet";
}

function getInitialAudioSettings(): AudioSettings {
  if (typeof window === "undefined") {
    return defaultAudioSettings;
  }

  const savedDensity = window.localStorage.getItem("echo-audio-density");
  const savedRoot = window.localStorage.getItem("echo-audio-root");

  const density =
    savedDensity === "sparse" || savedDensity === "balanced" || savedDensity === "rich"
      ? savedDensity
      : defaultAudioSettings.density;
  const root =
    savedRoot === "C" ||
    savedRoot === "C#" ||
    savedRoot === "D" ||
    savedRoot === "D#" ||
    savedRoot === "E" ||
    savedRoot === "F" ||
    savedRoot === "F#" ||
    savedRoot === "G" ||
    savedRoot === "G#" ||
    savedRoot === "A" ||
    savedRoot === "A#" ||
    savedRoot === "B"
      ? savedRoot
      : defaultAudioSettings.root;

  return {
    ...defaultAudioSettings,
    density,
    root,
  };
}

function persistNetwork(network: EchoNetwork) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("echo-network", network);
  }
}

function persistAudioSettings(audioSettings: AudioSettings) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem("echo-audio-density", audioSettings.density);
  window.localStorage.setItem("echo-audio-root", audioSettings.root);
}

export const useAppStore = create<AppState>((set, get) => ({
  activeScene: "map",
  currentNetwork: getInitialNetwork(),
  networkStatus: "loading",
  networkError: null,
  networkTransitionVisible: false,
  invalidNodeRouteId: null,
  selectedNodeId: null,
  nodeSceneEnteredAt: null,
  mapSearchTransition: null,
  audioEnabled: true,
  audioSettings: getInitialAudioSettings(),
  nodes: [],
  channels: [],
  recentEvents: [],
  headlineCounts: defaultHeadlineCounts,
  simulation: null,
  audio: null,
  initialize: ({ simulation, audio, nodes, channels, recentEvents, headlineCounts }) => {
    const nextNodes = derivePeersFromChannels(nodes, channels);
    set({
      simulation,
      audio,
      nodes: nextNodes,
      channels,
      recentEvents,
      headlineCounts,
      selectedNodeId: nextNodes[0]?.id ?? null,
      invalidNodeRouteId: null,
    });
  },
  appendEvent: (event) => {
    set((state) => {
      const topology = applyChannelLifecycleEvent(state.nodes, state.channels, event);

      return {
        nodes: topology.nodes,
        channels: topology.channels,
        headlineCounts: state.headlineCounts,
        recentEvents: [event, ...state.recentEvents].slice(0, 24),
      };
    });
  },
  applyEventFeed: (feed) => {
    set((state) => {
      let nextNodes = state.nodes;
      let nextChannels = state.channels;

      for (const event of feed.events) {
        const topology = applyChannelLifecycleEvent(nextNodes, nextChannels, event);
        nextNodes = topology.nodes;
        nextChannels = topology.channels;
      }

      return {
        nodes: nextNodes,
        channels: nextChannels,
        headlineCounts: feed.headlineCounts,
        recentEvents: [...feed.events].reverse().concat(state.recentEvents).slice(0, 24),
      };
    });
  },
  setNetwork: (network) => {
    if (network === get().currentNetwork) {
      return;
    }

    persistNetwork(network);
    set({
      currentNetwork: network,
      activeScene: "map",
      selectedNodeId: null,
      nodeSceneEnteredAt: null,
      mapSearchTransition: null,
      invalidNodeRouteId: null,
      networkStatus: "loading",
      networkError: null,
    });
  },
  setNetworkState: (status, error = null) => {
    set({
      networkStatus: status,
      networkError: error,
    });
  },
  setNetworkTransitionVisible: (visible) => {
    set({ networkTransitionVisible: visible });
  },
  setInvalidNodeRouteId: (nodeId) => {
    set({ invalidNodeRouteId: nodeId });
  },
  setScene: (scene) => {
    set({ activeScene: scene });
  },
  selectNode: (nodeId) => {
    set((state) => ({
      selectedNodeId: nodeId,
      activeScene: "node",
      nodeSceneEnteredAt: state.activeScene === "node" ? state.nodeSceneEnteredAt : Date.now(),
      mapSearchTransition: null,
      invalidNodeRouteId: null,
    }));
  },
  startMapSearchTransition: (nodeId) => {
    set({
      selectedNodeId: nodeId,
      mapSearchTransition: {
        nodeId,
        startedAt: Date.now(),
      },
    });
  },
  clearMapSearchTransition: () => {
    set({ mapSearchTransition: null });
  },
  goToMap: () => {
    set({
      activeScene: "map",
      nodeSceneEnteredAt: null,
      mapSearchTransition: null,
      invalidNodeRouteId: null,
    });
  },
  setAudioSettings: (nextSettings) => {
    set((state) => {
      const audioSettings = {
        ...state.audioSettings,
        ...nextSettings,
      };
      persistAudioSettings(audioSettings);
      return { audioSettings };
    });
  },
  toggleAudio: () => {
    const nextEnabled = !get().audioEnabled;
    const audio = get().audio;
    const audioSettings = get().audioSettings;

    if (nextEnabled) {
      audio?.configure(audioSettings);
      audio?.enable();
    } else {
      audio?.disable();
    }

    set({ audioEnabled: nextEnabled });
  },
}));
