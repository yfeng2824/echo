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
  SecretCueState,
  SecretCueWord,
} from "@echo/contracts";
import {
  SECRET_CUE_DURATION_MS,
  SECRET_PROMPT_COLLAPSE_AT_MS,
  SECRET_PROMPT_HIDE_AT_MS,
  SECRET_PROMPT_RELEASE_AT_MS,
} from "../lib/secret-cue";

type InitializeInput = {
  simulation: NetworkSimulation;
  audio: AudioEngine;
  nodes: EchoNode[];
  channels: EchoChannel[];
  recentEvents: EchoEvent[];
  headlineCounts: HeadlineCounts;
};

type TopologySyncInput = {
  nodes: EchoNode[];
  channels: EchoChannel[];
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
  secretCue: SecretCueState;
  nodes: EchoNode[];
  channels: EchoChannel[];
  recentEvents: EchoEvent[];
  headlineCounts: HeadlineCounts;
  simulation: NetworkSimulation | null;
  audio: AudioEngine | null;
  initialize: (input: InitializeInput) => void;
  syncTopology: (input: TopologySyncInput) => void;
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
  beginSecretWord: (word: SecretCueWord, initialChar: string) => void;
  advanceSecretWord: (nextMatchedText: string) => void;
  triggerSecretCue: () => void;
  cancelSecretWord: () => void;
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

const defaultSecretCue: SecretCueState = {
  phase: "idle",
  word: null,
  matchedText: "",
  startedAt: null,
  expiresAt: null,
  promptCollapseAt: null,
  promptReleaseAt: null,
  promptHideAt: null,
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
  secretCue: defaultSecretCue,
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
      secretCue: defaultSecretCue,
    });
  },
  syncTopology: ({ nodes, channels, headlineCounts }) => {
    set((state) => {
      const nextNodes = derivePeersFromChannels(nodes, channels);
      const hasSelectedNode = nextNodes.some((node) => node.id === state.selectedNodeId);
      const hasMapSearchNode =
        state.mapSearchTransition !== null &&
        nextNodes.some((node) => node.id === state.mapSearchTransition?.nodeId);

      return {
        nodes: nextNodes,
        channels,
        headlineCounts,
        selectedNodeId: hasSelectedNode ? state.selectedNodeId : (nextNodes[0]?.id ?? null),
        activeScene: hasSelectedNode ? state.activeScene : "map",
        nodeSceneEnteredAt: hasSelectedNode ? state.nodeSceneEnteredAt : null,
        mapSearchTransition: hasMapSearchNode ? state.mapSearchTransition : null,
        invalidNodeRouteId: state.invalidNodeRouteId,
      };
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
      secretCue: defaultSecretCue,
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
    set({
      activeScene: scene,
      secretCue: scene === "map" ? get().secretCue : defaultSecretCue,
    });
  },
  selectNode: (nodeId) => {
    set((state) => ({
      selectedNodeId: nodeId,
      activeScene: "node",
      nodeSceneEnteredAt: state.activeScene === "node" ? state.nodeSceneEnteredAt : Date.now(),
      mapSearchTransition: null,
      invalidNodeRouteId: null,
      secretCue: defaultSecretCue,
    }));
  },
  startMapSearchTransition: (nodeId) => {
    set({
      selectedNodeId: nodeId,
      mapSearchTransition: {
        nodeId,
        startedAt: Date.now(),
      },
      secretCue: defaultSecretCue,
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
      secretCue: defaultSecretCue,
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
  beginSecretWord: (word, initialChar) => {
    set({
      secretCue: {
        phase: "typing",
        word,
        matchedText: initialChar,
        startedAt: Date.now(),
        expiresAt: null,
        promptCollapseAt: null,
        promptReleaseAt: null,
        promptHideAt: null,
      },
    });
  },
  advanceSecretWord: (nextMatchedText) => {
    set((state) => ({
      secretCue:
        state.secretCue.phase === "typing" && state.secretCue.word
          ? {
              ...state.secretCue,
              matchedText: nextMatchedText,
              startedAt: state.secretCue.startedAt ?? Date.now(),
            }
          : state.secretCue,
    }));
  },
  triggerSecretCue: () => {
    set((state) => {
      if (!state.secretCue.word) {
        return { secretCue: defaultSecretCue };
      }

      const startedAt = Date.now();
      return {
        secretCue: {
          phase: "playing",
          word: state.secretCue.word,
          matchedText: state.secretCue.word,
          startedAt,
          expiresAt: startedAt + SECRET_CUE_DURATION_MS,
          promptCollapseAt: startedAt + SECRET_PROMPT_COLLAPSE_AT_MS,
          promptReleaseAt: startedAt + SECRET_PROMPT_RELEASE_AT_MS,
          promptHideAt: startedAt + SECRET_PROMPT_HIDE_AT_MS,
        },
      };
    });
  },
  cancelSecretWord: () => {
    set({ secretCue: defaultSecretCue });
  },
}));
