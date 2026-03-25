import type { AudioSettings, EchoChannel, EchoNode, SceneId } from "./models";
import type { EchoEvent } from "./events";

export type HeadlineCounts = {
  announcedNodeCount: number;
  channelCount: number;
};

export type SceneBootstrap = {
  nodes: EchoNode[];
  channels: EchoChannel[];
  recentEvents: EchoEvent[];
  headlineCounts: HeadlineCounts;
};

export type EventFeed = {
  events: EchoEvent[];
  headlineCounts: HeadlineCounts;
};

export type NetworkSimulation = {
  start: (onUpdate: (feed: EventFeed) => void) => void;
  stop: () => void;
};

export type AudioEngine = {
  enable: () => void;
  disable: () => void;
  configure: (settings: AudioSettings) => void;
  syncAmbient: (scene: SceneId, nodes: EchoNode[]) => void;
  trigger: (event: EchoEvent) => void;
  dispose: () => void;
};
