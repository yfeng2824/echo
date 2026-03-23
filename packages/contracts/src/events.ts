export type EchoEventType =
  | "node_seen"
  | "channel_opened"
  | "channel_updated"
  | "payment_routed"
  | "path_used"
  | "node_active"
  | "region_activity_burst";

export type RegisterBand = 1 | 2 | 3 | 4;

type NoteName = "C" | "C#" | "D" | "D#" | "E" | "F" | "F#" | "G" | "G#" | "A" | "A#" | "B";
type NoteOctave = 2 | 3 | 4 | 5 | 6;

export type DegreeHint = `${NoteName}${NoteOctave}`;

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
  // Collision echoes increment this so the node scene can cap recursive ripples.
  rippleLayer?: number;
};
