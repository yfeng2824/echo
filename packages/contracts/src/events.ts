export type EchoEventType =
  | "node_seen"
  | "channel_opened"
  | "channel_updated"
  | "payment_routed"
  | "path_used"
  | "node_active"
  | "region_activity_burst";

export type EchoEvent = {
  id: string;
  type: EchoEventType;
  at: string;
  nodeId: string;
  channelId?: string;
  intensity: number;
};

