import type { EchoChannel, EchoNode } from "./models";
import type { EchoEvent } from "./events";

export type SceneBootstrap = {
  nodes: EchoNode[];
  channels: EchoChannel[];
  recentEvents: EchoEvent[];
};

export type NetworkSimulation = {
  start: (onEvent: (event: EchoEvent) => void) => void;
  stop: () => void;
};

export type AudioEngine = {
  enable: () => void;
  disable: () => void;
  trigger: (event: EchoEvent) => void;
  dispose: () => void;
};

