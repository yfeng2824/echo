export type EchoEventType = "channel_opened" | "channel_closed" | "channel_updated" | "node_active";

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
  relatedNodeId?: string;
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
