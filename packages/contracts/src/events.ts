export type EchoEventType =
  | "node_seen"
  | "channel_opened"
  | "channel_updated"
  | "payment_routed"
  | "path_used"
  | "node_active"
  | "region_activity_burst";

export type RegisterBand = 1 | 2 | 3 | 4;

export type DegreeHint = "gong" | "shang" | "jue" | "zhi" | "yu";

export type BatchRole = "lead" | "support" | "tail";

export type EventSource = "ambient" | "network" | "resonance";

export type EchoEvent = {
  id: string;
  type: EchoEventType;
  at: string;
  nodeId: string;
  channelId?: string;
  intensity: number;
  voiceIndex?: number;
  voiceCount?: number;
  registerBand?: RegisterBand;
  degreeHint?: DegreeHint;
  batchId?: string;
  batchRole?: BatchRole;
  source?: EventSource;
};
