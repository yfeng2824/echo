import type { AudioSettings, EchoChannel, EchoNode, SceneId, SecretCueWord } from "./models";
import type { EchoEvent, EchoEventType } from "./events";

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
  playSecretProgress: (word: SecretCueWord, index: number) => void;
  playSecretCue: (word: SecretCueWord) => void;
  stopSecretCue: () => void;
  playOnboardingEventMelody: (
    eventType: Extract<EchoEventType, "channel_opened" | "channel_updated" | "channel_closed">,
    nodeId?: string | null
  ) => void;
  syncAmbient: (scene: SceneId, nodes: EchoNode[]) => void;
  trigger: (event: EchoEvent) => void;
  dispose: () => void;
};
