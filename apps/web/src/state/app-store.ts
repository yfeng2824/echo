import { create } from "zustand";
import type {
  AudioEngine,
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
  audioEnabled: boolean;
  nodes: EchoNode[];
  channels: EchoChannel[];
  recentEvents: EchoEvent[];
  simulation: NetworkSimulation | null;
  audio: AudioEngine | null;
  initialize: (input: InitializeInput) => void;
  appendEvent: (event: EchoEvent) => void;
  setScene: (scene: SceneId) => void;
  selectNode: (nodeId: string) => void;
  goToMap: () => void;
  toggleAudio: () => void;
};

export const useAppStore = create<AppState>((set, get) => ({
  activeScene: "map",
  selectedNodeId: null,
  audioEnabled: false,
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
      recentEvents: [event, ...state.recentEvents].slice(0, 8)
    }));
  },
  setScene: (scene) => {
    set({ activeScene: scene });
  },
  selectNode: (nodeId) => {
    set({ selectedNodeId: nodeId, activeScene: "node" });
  },
  goToMap: () => {
    set({ activeScene: "map" });
  },
  toggleAudio: () => {
    const nextEnabled = !get().audioEnabled;
    const audio = get().audio;

    if (nextEnabled) {
      audio?.enable();
    } else {
      audio?.disable();
    }

    set({ audioEnabled: nextEnabled });
  }
}));
