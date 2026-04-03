import type {
  AudioRoot,
  DegreeHint,
  EchoEvent,
  EchoEventType,
  RegisterBand,
} from "@echo/contracts";
import { resolvePentatonicByInterval } from "./pentatonic";

export type MelodyStepSpec = {
  delayMs: number;
  interval: number;
};

export type NetworkMelodySpec = {
  baseOctave: number;
  steps: MelodyStepSpec[];
};

type NetworkMelodyEventType = Exclude<EchoEventType, "node_active">;

const NETWORK_MELODY_BASE_OCTAVE: Record<NetworkMelodyEventType, number> = {
  channel_opened: 4,
  channel_closed: 4,
  channel_updated: 4,
};

const NETWORK_MELODY_STEPS: Record<NetworkMelodyEventType, MelodyStepSpec[]> = {
  channel_opened: [
    { delayMs: 0, interval: 0 },
    { delayMs: 150, interval: 4 },
    { delayMs: 320, interval: 7 },
    { delayMs: 540, interval: 12 },
  ],
  channel_closed: [
    { delayMs: 0, interval: 12 },
    { delayMs: 150, interval: 7 },
    { delayMs: 320, interval: 4 },
    { delayMs: 540, interval: 0 },
  ],
  channel_updated: [
    { delayMs: 0, interval: 0 },
    { delayMs: 140, interval: 2 },
    { delayMs: 280, interval: 4 },
    { delayMs: 430, interval: 2 },
  ],
};

export function isNetworkMelodyEventType(
  eventType: EchoEventType
): eventType is NetworkMelodyEventType {
  return eventType !== "node_active";
}

export function getNetworkMelodySpec(
  event: EchoEvent,
  registerBand: RegisterBand = 2
): NetworkMelodySpec | null {
  if (!isNetworkMelodyEventType(event.type)) {
    return null;
  }

  return {
    baseOctave: NETWORK_MELODY_BASE_OCTAVE[event.type],
    steps: NETWORK_MELODY_STEPS[event.type],
  };
}

export function resolveNetworkMelodyDegree(
  root: AudioRoot,
  baseOctave: number,
  interval: number
): DegreeHint {
  return resolvePentatonicByInterval(root, baseOctave, interval);
}
