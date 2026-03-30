import type { EchoChannel, EchoEvent, EchoNode, SceneId, SecretCueState } from "@echo/contracts";
import type { WorldMapProjection } from "../../lib/map-projection";

export type MapSearchTransition = {
  nodeId: string;
  startedAt: number;
} | null;

export type RenderSnapshot = {
  activeScene: SceneId;
  mapSearchTransition: MapSearchTransition;
  nodeSceneEnteredAt: number | null;
  nodes: EchoNode[];
  channels: EchoChannel[];
  selectedNodeId: string | null;
  recentEvents: EchoEvent[];
  secretCue: SecretCueState;
};

export type HoverState = {
  hoveredNodeId: string | null;
};

export type CollisionBurst = {
  x: number;
  y: number;
  createdAt: number;
  radius: number;
  leftNodeId: string;
  rightNodeId: string;
};

export type NodeRipple = {
  nodeId: string;
  eventId: string;
  batchId?: string;
  x: number;
  y: number;
  radius: number;
  intensity: number;
  rippleLayer: number;
};

export type RenderContext = {
  now: number;
  time: number;
  width: number;
  height: number;
  dpr: number;
  projection: WorldMapProjection;
};

export type VisualProfile = {
  duration: number;
  radius: number;
  alpha: number;
  halo: number;
};

export type RenderCallbacks = {
  emitCollisionEcho: (
    leftRipple: NodeRipple,
    rightRipple: NodeRipple,
    collisionKey: string
  ) => void;
};
