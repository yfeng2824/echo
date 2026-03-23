import { create } from "zustand";
import type {
  AudioEngine,
  AudioSettings,
  EchoChannel,
  EchoEvent,
  EchoNetwork,
  EchoNode,
  HeadlineCounts,
  NetworkSimulation,
  SceneId
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
  setNetwork: (network: EchoNetwork) => void;
  setNetworkState: (status: AppState["networkStatus"], error?: string | null) => void;
  setNetworkTransitionVisible: (visible: boolean) => void;
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
  root: "C"
};

const defaultHeadlineCounts: HeadlineCounts = {
  activeNodeCount: 0,
  channelCount: 0
};

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
    root
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
    set({
      simulation,
      audio,
      nodes,
      channels,
      recentEvents,
      headlineCounts,
      selectedNodeId: nodes[0]?.id ?? null
    });
  },
  appendEvent: (event) => {
    set((state) => ({
      recentEvents: [event, ...state.recentEvents].slice(0, 24)
    }));
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
      networkStatus: "loading",
      networkError: null
    });
  },
  setNetworkState: (status, error = null) => {
    set({
      networkStatus: status,
      networkError: error
    });
  },
  setNetworkTransitionVisible: (visible) => {
    set({ networkTransitionVisible: visible });
  },
  setScene: (scene) => {
    set({ activeScene: scene });
  },
  selectNode: (nodeId) => {
    set({
      selectedNodeId: nodeId,
      activeScene: "node",
      nodeSceneEnteredAt: Date.now(),
      mapSearchTransition: null
    });
  },
  startMapSearchTransition: (nodeId) => {
    set({
      selectedNodeId: nodeId,
      mapSearchTransition: {
        nodeId,
        startedAt: Date.now()
      }
    });
  },
  clearMapSearchTransition: () => {
    set({ mapSearchTransition: null });
  },
  goToMap: () => {
    set({ activeScene: "map", nodeSceneEnteredAt: null, mapSearchTransition: null });
  },
  setAudioSettings: (nextSettings) => {
    set((state) => {
      const audioSettings = {
        ...state.audioSettings,
        ...nextSettings
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
  }
}));
