export type SceneId = "map" | "node";

export type EchoNetwork = "mainnet" | "testnet";

export type EchoNodeStatus = "live" | "quiet";

export type AudioDensity = "sparse" | "balanced" | "rich";

export type AudioTimbrePreset = "standard";

export type AudioRoot = "C" | "C#" | "D" | "D#" | "E" | "F" | "F#" | "G" | "G#" | "A" | "A#" | "B";

export type AudioSettings = {
  density: AudioDensity;
  timbrePreset: AudioTimbrePreset;
  root: AudioRoot;
};

export type EchoNode = {
  id: string;
  fiberPubkey?: string;
  peerId?: string;
  label: string;
  lat: number;
  lng: number;
  region: string;
  status: EchoNodeStatus;
  intensity: number;
  peers: string[];
};

export type EchoChannel = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  strength: number;
  lastActiveAt: string;
};
