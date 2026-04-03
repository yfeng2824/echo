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
  OnboardingStatus,
  OnboardingStepId,
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
import { findMostConnectedNode } from "../lib/network";

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

type MapReturnTransition = {
  nodeId: string;
  startedAt: number;
};

const ONBOARDING_STORAGE_KEY = "echo-onboarding-v1";
const ONBOARDING_STEP_ORDER: OnboardingStepId[] = [
  "map-pulse",
  "connected-node",
  "event-melodies",
  "node-view",
  "controls",
];

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
  mapReturnTransition: MapReturnTransition | null;
  audioEnabled: boolean;
  audioSettings: AudioSettings;
  secretCue: SecretCueState;
  onboardingStatus: OnboardingStatus;
  onboardingStepId: OnboardingStepId | null;
  onboardingSpotlightNodeId: string | null;
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
  startOnboarding: () => void;
  previousOnboardingStep: () => void;
  nextOnboardingStep: () => void;
  skipOnboarding: () => void;
  completeOnboarding: () => void;
  replayOnboarding: () => void;
  setOnboardingSpotlightNode: (nodeId: string | null) => void;
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

function getInitialOnboardingStatus(): OnboardingStatus {
  if (typeof window === "undefined") {
    return "inactive";
  }

  const saved = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
  return saved === "completed" || saved === "dismissed" ? saved : "inactive";
}

function persistOnboardingStatus(status: OnboardingStatus) {
  if (typeof window === "undefined") {
    return;
  }

  if (status === "completed" || status === "dismissed") {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, status);
    return;
  }

  window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
}

function getNextOnboardingStep(step: OnboardingStepId | null): OnboardingStepId | null {
  if (!step) {
    return ONBOARDING_STEP_ORDER[0] ?? null;
  }

  const currentIndex = ONBOARDING_STEP_ORDER.indexOf(step);
  if (currentIndex === -1 || currentIndex === ONBOARDING_STEP_ORDER.length - 1) {
    return null;
  }

  return ONBOARDING_STEP_ORDER[currentIndex + 1] ?? null;
}

function getPreviousOnboardingStep(step: OnboardingStepId | null): OnboardingStepId | null {
  if (!step) {
    return null;
  }

  const currentIndex = ONBOARDING_STEP_ORDER.indexOf(step);
  if (currentIndex <= 0) {
    return null;
  }

  return ONBOARDING_STEP_ORDER[currentIndex - 1] ?? null;
}

function resolveOnboardingSpotlightNodeId(
  nodes: EchoNode[],
  currentSpotlightNodeId: string | null = null
) {
  if (currentSpotlightNodeId && nodes.some((node) => node.id === currentSpotlightNodeId)) {
    return currentSpotlightNodeId;
  }

  return findMostConnectedNode(nodes)?.id ?? null;
}

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
    return "mainnet";
  }

  const saved = window.localStorage.getItem("echo-network");
  return saved === "mainnet" || saved === "testnet" ? saved : "mainnet";
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
  mapReturnTransition: null,
  audioEnabled: true,
  audioSettings: getInitialAudioSettings(),
  secretCue: defaultSecretCue,
  onboardingStatus: getInitialOnboardingStatus(),
  onboardingStepId: null,
  onboardingSpotlightNodeId: null,
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
      onboardingSpotlightNodeId: resolveOnboardingSpotlightNodeId(nextNodes),
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
      const hasMapReturnNode =
        state.mapReturnTransition !== null &&
        nextNodes.some((node) => node.id === state.mapReturnTransition?.nodeId);
      const nextOnboardingSpotlightNodeId = resolveOnboardingSpotlightNodeId(
        nextNodes,
        state.onboardingSpotlightNodeId
      );

      return {
        nodes: nextNodes,
        channels,
        headlineCounts,
        selectedNodeId: hasSelectedNode ? state.selectedNodeId : (nextNodes[0]?.id ?? null),
        onboardingSpotlightNodeId: nextOnboardingSpotlightNodeId,
        activeScene: hasSelectedNode ? state.activeScene : "map",
        nodeSceneEnteredAt: hasSelectedNode ? state.nodeSceneEnteredAt : null,
        mapSearchTransition: hasMapSearchNode ? state.mapSearchTransition : null,
        mapReturnTransition: hasMapReturnNode ? state.mapReturnTransition : null,
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
      mapReturnTransition: null,
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
      mapReturnTransition: null,
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
      mapReturnTransition: null,
      secretCue: defaultSecretCue,
    });
  },
  clearMapSearchTransition: () => {
    set({ mapSearchTransition: null });
  },
  goToMap: () => {
    set((state) => ({
      activeScene: "map",
      nodeSceneEnteredAt: null,
      mapSearchTransition: null,
      mapReturnTransition:
        state.activeScene === "node" && state.selectedNodeId
          ? {
              nodeId: state.selectedNodeId,
              startedAt: Date.now(),
            }
          : null,
      invalidNodeRouteId: null,
      secretCue: defaultSecretCue,
    }));
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
  startOnboarding: () => {
    set((state) => ({
      activeScene: "map",
      nodeSceneEnteredAt: null,
      mapSearchTransition: null,
      mapReturnTransition: null,
      invalidNodeRouteId: null,
      secretCue: defaultSecretCue,
      onboardingStatus: "active",
      onboardingStepId: ONBOARDING_STEP_ORDER[0] ?? null,
      onboardingSpotlightNodeId: resolveOnboardingSpotlightNodeId(
        state.nodes,
        state.onboardingSpotlightNodeId
      ),
    }));
  },
  previousOnboardingStep: () => {
    const currentStep = get().onboardingStepId;
    const previousStep = getPreviousOnboardingStep(currentStep);

    if (!previousStep) {
      return;
    }

    set({
      onboardingStatus: "active",
      onboardingStepId: previousStep,
    });
  },
  nextOnboardingStep: () => {
    const currentStep = get().onboardingStepId;
    const nextStep = getNextOnboardingStep(currentStep);

    if (!nextStep) {
      get().completeOnboarding();
      return;
    }

    set({
      onboardingStatus: "active",
      onboardingStepId: nextStep,
    });
  },
  skipOnboarding: () => {
    persistOnboardingStatus("dismissed");
    set({
      onboardingStatus: "dismissed",
      onboardingStepId: null,
    });
  },
  completeOnboarding: () => {
    persistOnboardingStatus("completed");
    set({
      onboardingStatus: "completed",
      onboardingStepId: null,
    });
  },
  replayOnboarding: () => {
    set((state) => ({
      activeScene: "map",
      nodeSceneEnteredAt: null,
      mapSearchTransition: null,
      mapReturnTransition: null,
      invalidNodeRouteId: null,
      secretCue: defaultSecretCue,
      onboardingStatus: "active",
      onboardingStepId: ONBOARDING_STEP_ORDER[0] ?? null,
      onboardingSpotlightNodeId: resolveOnboardingSpotlightNodeId(
        state.nodes,
        state.onboardingSpotlightNodeId
      ),
    }));
  },
  setOnboardingSpotlightNode: (nodeId) => {
    set((state) => ({
      onboardingSpotlightNodeId: resolveOnboardingSpotlightNodeId(state.nodes, nodeId),
    }));
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
