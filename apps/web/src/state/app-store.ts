import { create } from "zustand";
import type {
  AudioEngine,
  AudioSettings,
  EchoChannel,
  EchoEvent,
  EchoNode,
  NetworkSimulation,
  SceneId
} from "@echo/contracts";

type InitializeInput = {
  simulation: NetworkSimulation;
  audio: AudioEngine;
  nodes: EchoNode[];
  channels: EchoChannel[];
};

type AppState = {
  activeScene: SceneId;
  selectedNodeId: string | null;
  nodeSceneEnteredAt: number | null;
  mapSearchTransition:
    | {
        nodeId: string;
        startedAt: number;
      }
    | null;
  audioEnabled: boolean;
  audioSettings: AudioSettings;
  nodes: EchoNode[];
  channels: EchoChannel[];
  recentEvents: EchoEvent[];
  simulation: NetworkSimulation | null;
  audio: AudioEngine | null;
  initialize: (input: InitializeInput) => void;
  appendEvent: (event: EchoEvent) => void;
  setScene: (scene: SceneId) => void;
  selectNode: (nodeId: string) => void;
  startMapSearchTransition: (nodeId: string) => void;
  clearMapSearchTransition: () => void;
  goToMap: () => void;
  setAudioSettings: (nextSettings: Partial<AudioSettings>) => void;
  toggleAudio: () => void;
};

const defaultAudioSettings: AudioSettings = {
  density: "sparse",
  timbrePreset: "guqin"
};

export const useAppStore = create<AppState>((set, get) => ({
  activeScene: "map",
  selectedNodeId: null,
  nodeSceneEnteredAt: null,
  mapSearchTransition: null,
  audioEnabled: false,
  audioSettings: defaultAudioSettings,
  nodes: [],
  channels: [],
  recentEvents: [],
  simulation: null,
  audio: null,
  initialize: ({ simulation, audio, nodes, channels }) => {
    set({
      simulation,
      audio,
      nodes,
      channels,
      selectedNodeId: nodes[0]?.id ?? null
    });
  },
  appendEvent: (event) => {
    set((state) => ({
      recentEvents: [event, ...state.recentEvents].slice(0, 24)
    }));
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
    set((state) => ({
      audioSettings: {
        ...state.audioSettings,
        ...nextSettings
      }
    }));
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
