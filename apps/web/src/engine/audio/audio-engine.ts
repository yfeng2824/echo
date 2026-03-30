import type {
  AudioEngine,
  AudioRoot,
  AudioSettings,
  DegreeHint,
  EchoEvent,
  EchoEventType,
  EchoNode,
  RegisterBand,
  SceneId,
  SecretCueWord,
} from "@echo/contracts";
import { getBandBaseOctave, resolvePentatonicByInterval } from "../../lib/pentatonic";
import {
  getNetworkMelodySpec,
  isNetworkMelodyEventType,
  resolveNetworkMelodyDegree,
} from "../../lib/network-event-melody";
import { SECRET_CUE_DURATION_MS, SECRET_PULSE_TIMINGS_MS } from "../../lib/secret-cue";

type ActiveTransientVoice = {
  gain: GainNode;
  source: EchoEvent["source"];
  batchRole: EchoEvent["batchRole"];
  strength: number;
  releaseAt: number;
  isSecretCue: boolean;
  stop: () => void;
};

const WEIGHTED_INTERVALS: Record<RegisterBand, Array<{ interval: number; weight: number }>> = {
  1: [
    { interval: 0, weight: 5 },
    { interval: 2, weight: 3 },
    { interval: 7, weight: 4 },
  ],
  2: [
    { interval: 0, weight: 4 },
    { interval: 2, weight: 3 },
    { interval: 4, weight: 2 },
    { interval: 7, weight: 4 },
  ],
  3: [
    { interval: 2, weight: 3 },
    { interval: 4, weight: 4 },
    { interval: 7, weight: 4 },
    { interval: 9, weight: 3 },
  ],
  4: [
    { interval: 4, weight: 4 },
    { interval: 7, weight: 5 },
    { interval: 9, weight: 4 },
  ],
};

const CHORD_PRIORITY_INTERVALS_BY_BAND: Record<RegisterBand, Record<number, number[]>> = {
  1: {
    1: [0],
    2: [0, 7],
    3: [0, 7, 9],
    4: [0, 4, 7, 9],
  },
  2: {
    1: [0],
    2: [0, 7],
    3: [0, 7, 9],
    4: [0, 4, 7, 9],
  },
  3: {
    1: [0],
    2: [0, 7],
    3: [0, 7, 9],
    4: [0, 4, 7, 9],
  },
  4: {
    1: [0],
    2: [0, 7],
    3: [0, 7, 9],
    4: [0, 4, 7, 9],
  },
};

const ROOT_SEMITONE: Record<AudioRoot, number> = {
  C: 0,
  "C#": 1,
  D: 2,
  "D#": 3,
  E: 4,
  F: 5,
  "F#": 6,
  G: 7,
  "G#": 8,
  A: 9,
  "A#": 10,
  B: 11,
};

const COLLISION_INTENSITY_THRESHOLD = 0.2;
const COLLISION_VOICING_INTERVALS = [12, 19, 24, 19] as const;
const NETWORK_MELODY_PRIORITY_CAP_MS = 1300;
const NETWORK_MELODY_PRIORITY_FLOOR_MS = 900;
const NETWORK_MELODY_TAIL_ALLOWANCE_MS = 520;
const AMBIENT_GAIN_MULTIPLIER = 1.45;
const TRANSIENT_GAIN_MULTIPLIER = 1.4;

const SECRET_PROGRESS_INTERVALS: Record<SecretCueWord, number[]> = {
  echo: [0, 2, 7, 9],
  ckb: [0, 7, 4],
  fiber: [0, 4, 7, 2, 9],
};

const [SECRET_PULSE_ONE_MS, SECRET_PULSE_TWO_MS, SECRET_PULSE_THREE_MS] = SECRET_PULSE_TIMINGS_MS;

const SECRET_CUE_SPECS: Record<
  SecretCueWord,
  {
    baseOctave: number;
    steps: Array<{
      interval: number;
      delayMs: number;
      intensity: number;
      batchRole: EchoEvent["batchRole"];
    }>;
  }
> = {
  echo: {
    baseOctave: 4,
    steps: [
      { interval: 0, delayMs: 0, intensity: 0.22, batchRole: "support" },
      { interval: 2, delayMs: 180, intensity: 0.24, batchRole: "support" },
      { interval: 7, delayMs: SECRET_PULSE_ONE_MS - 140, intensity: 0.34, batchRole: "support" },
      { interval: 12, delayMs: SECRET_PULSE_ONE_MS, intensity: 0.58, batchRole: "lead" },
      { interval: 9, delayMs: SECRET_PULSE_TWO_MS - 150, intensity: 0.3, batchRole: "support" },
      { interval: 16, delayMs: SECRET_PULSE_TWO_MS, intensity: 0.48, batchRole: "support" },
      { interval: 19, delayMs: SECRET_PULSE_THREE_MS - 120, intensity: 0.34, batchRole: "support" },
      { interval: 12, delayMs: SECRET_PULSE_THREE_MS, intensity: 0.62, batchRole: "tail" },
    ],
  },
  ckb: {
    baseOctave: 3,
    steps: [
      { interval: 7, delayMs: 0, intensity: 0.22, batchRole: "support" },
      { interval: 4, delayMs: 200, intensity: 0.24, batchRole: "support" },
      { interval: 0, delayMs: SECRET_PULSE_ONE_MS - 130, intensity: 0.32, batchRole: "support" },
      { interval: 7, delayMs: SECRET_PULSE_ONE_MS, intensity: 0.56, batchRole: "lead" },
      { interval: 4, delayMs: SECRET_PULSE_TWO_MS - 160, intensity: 0.28, batchRole: "support" },
      { interval: 9, delayMs: SECRET_PULSE_TWO_MS, intensity: 0.48, batchRole: "support" },
      { interval: 2, delayMs: SECRET_PULSE_THREE_MS - 120, intensity: 0.32, batchRole: "support" },
      { interval: 0, delayMs: SECRET_PULSE_THREE_MS, intensity: 0.6, batchRole: "tail" },
    ],
  },
  fiber: {
    baseOctave: 4,
    steps: [
      { interval: 0, delayMs: 0, intensity: 0.2, batchRole: "support" },
      { interval: 4, delayMs: 150, intensity: 0.22, batchRole: "support" },
      { interval: 7, delayMs: 340, intensity: 0.24, batchRole: "support" },
      { interval: 12, delayMs: SECRET_PULSE_ONE_MS, intensity: 0.52, batchRole: "lead" },
      { interval: 14, delayMs: SECRET_PULSE_TWO_MS - 220, intensity: 0.28, batchRole: "support" },
      { interval: 16, delayMs: SECRET_PULSE_TWO_MS - 80, intensity: 0.34, batchRole: "support" },
      { interval: 19, delayMs: SECRET_PULSE_TWO_MS, intensity: 0.46, batchRole: "support" },
      { interval: 21, delayMs: SECRET_PULSE_THREE_MS - 180, intensity: 0.32, batchRole: "support" },
      { interval: 19, delayMs: SECRET_PULSE_THREE_MS, intensity: 0.6, batchRole: "tail" },
    ],
  },
};

function hashString(value: string) {
  let hash = 0;

  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) % 100000;
  }

  return hash;
}

function isCollisionLikeResonanceEvent(event: EchoEvent) {
  const source = event.source ?? "network";
  const batchRole = event.batchRole ?? "support";

  return (
    source === "resonance" &&
    batchRole === "tail" &&
    (event.rippleLayer ?? 0) > 0 &&
    event.intensity <= COLLISION_INTENSITY_THRESHOLD
  );
}

function isSecretCueEvent(event: EchoEvent) {
  return event.nodeId.startsWith("secret-");
}

export function createAudioEngine(): AudioEngine {
  let enabled = false;
  let audioContext: AudioContext | null = null;
  let ambientMaster: GainNode | null = null;
  let ambientBedVoices: Array<{
    oscillator: OscillatorNode;
    gain: GainNode;
    filter: BiquadFilterNode;
  }> = [];
  let topologyBands = new Map<string, RegisterBand>();
  let lastDegreeByNode = new Map<string, DegreeHint>();
  let activeTransientVoices: ActiveTransientVoice[] = [];
  let networkMelodyActiveUntil = 0;
  let networkMelodyTimeoutIds = new Set<number>();
  let networkMelodyPendingEvent: EchoEvent | null = null;
  let networkMelodyDrainTimeoutId: number | null = null;
  let secretCueTimeoutIds = new Set<number>();
  let secretCueReleaseTimeoutId: number | null = null;
  let secretCueActiveUntil = 0;
  let lastAmbientScene: SceneId = "map";
  let lastAmbientNodes: EchoNode[] = [];
  let settings: AudioSettings = {
    density: "balanced",
    timbrePreset: "standard",
    root: "C",
  };

  const ensureAudioContext = async () => {
    if (!audioContext) {
      audioContext = new window.AudioContext();
    }

    if (audioContext.state === "suspended") {
      try {
        await audioContext.resume();
      } catch {
        // Autoplay policy can block resume until user interaction; keep running silently.
      }
    }

    return audioContext;
  };

  const getRootFrequency = () => {
    const rootMidi = 36 + ROOT_SEMITONE[settings.root];
    return 440 * Math.pow(2, (rootMidi - 69) / 12);
  };

  const clearNetworkMelodyTimers = () => {
    networkMelodyTimeoutIds.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    networkMelodyTimeoutIds.clear();

    if (networkMelodyDrainTimeoutId !== null) {
      window.clearTimeout(networkMelodyDrainTimeoutId);
      networkMelodyDrainTimeoutId = null;
    }
  };

  const resetNetworkMelodyState = () => {
    clearNetworkMelodyTimers();
    networkMelodyActiveUntil = 0;
    networkMelodyPendingEvent = null;
  };

  const clearSecretCueTimers = () => {
    secretCueTimeoutIds.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    secretCueTimeoutIds.clear();

    if (secretCueReleaseTimeoutId !== null) {
      window.clearTimeout(secretCueReleaseTimeoutId);
      secretCueReleaseTimeoutId = null;
    }
  };

  const isSecretCueActive = () => Date.now() < secretCueActiveUntil;

  const stopTransientVoices = (
    release = 0.08,
    shouldStop: (voice: ActiveTransientVoice) => boolean = () => true
  ) => {
    cleanupVoices();
    if (!audioContext) {
      activeTransientVoices = activeTransientVoices.filter((voice) => !shouldStop(voice));
      return;
    }

    const now = audioContext.currentTime;
    const voicesToStop = activeTransientVoices.filter(shouldStop);
    activeTransientVoices = activeTransientVoices.filter((voice) => !shouldStop(voice));

    voicesToStop.forEach((voice) => {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0.0001, now, release);
      voice.stop();
    });
  };

  const stopActiveSecretCue = () => {
    clearSecretCueTimers();
    secretCueActiveUntil = 0;
    stopTransientVoices(0.05, (voice) => voice.isSecretCue);
    resumeAmbientIfNeeded();
  };

  const resumeAmbientIfNeeded = () => {
    if (!enabled || isSecretCueActive()) {
      return;
    }

    if (lastAmbientScene === "map") {
      void startAmbient(lastAmbientNodes);
      return;
    }

    stopAmbient(0.25);
  };

  const getWeightedPitchesForBand = (band: RegisterBand) =>
    WEIGHTED_INTERVALS[band].map(({ interval, weight }) => ({
      degree: resolvePentatonicByInterval(settings.root, getBandBaseOctave(band), interval),
      weight,
    }));

  const getChordPriorityByBand = (band: RegisterBand, voiceCount: number) =>
    (CHORD_PRIORITY_INTERVALS_BY_BAND[band][Math.min(voiceCount, 4)] ?? []).map((interval) =>
      resolvePentatonicByInterval(settings.root, getBandBaseOctave(band), interval)
    );

  const refreshTopologyBands = (nodes: EchoNode[]) => {
    const liveNodes = [...nodes].sort((left, right) => {
      const degreeDelta = left.peers.length - right.peers.length;
      if (degreeDelta !== 0) {
        return degreeDelta;
      }

      return left.id.localeCompare(right.id);
    });

    topologyBands = new Map<string, RegisterBand>();

    liveNodes.forEach((node, index) => {
      const normalized = liveNodes.length > 1 ? index / (liveNodes.length - 1) : 0;
      const band = Math.min(4, Math.floor(normalized * 4) + 1) as RegisterBand;
      topologyBands.set(node.id, band);
    });
  };

  const chooseWeightedDegree = (
    band: RegisterBand,
    nodeId: string,
    excludedDegrees: DegreeHint[]
  ) => {
    const weightedPitches = getWeightedPitchesForBand(band);
    const candidates = weightedPitches.filter(({ degree }) => !excludedDegrees.includes(degree));
    const pool = candidates.length > 0 ? candidates : weightedPitches;
    const lastDegree = lastDegreeByNode.get(nodeId);
    const filteredPool =
      lastDegree && pool.some(({ degree }) => degree !== lastDegree)
        ? pool.filter(({ degree }) => degree !== lastDegree)
        : pool;
    const totalWeight = filteredPool.reduce((sum, entry) => sum + entry.weight, 0);
    let cursor = Math.random() * totalWeight;

    for (const entry of filteredPool) {
      cursor -= entry.weight;
      if (cursor <= 0) {
        return entry.degree;
      }
    }

    return filteredPool[0]?.degree ?? resolvePentatonicByInterval(settings.root, 3, 0);
  };

  const resolveDegree = (event: EchoEvent) => {
    const registerBand = event.registerBand ?? topologyBands.get(event.nodeId) ?? 1;
    const excludedDegrees: DegreeHint[] = [];

    if (isCollisionLikeResonanceEvent(event)) {
      const collisionInterval =
        COLLISION_VOICING_INTERVALS[
          Math.max(0, ((event.rippleLayer ?? 1) - 1) % COLLISION_VOICING_INTERVALS.length)
        ];
      const degree = resolvePentatonicByInterval(settings.root, 3, collisionInterval);
      lastDegreeByNode.set(event.nodeId, degree);
      return { degree, registerBand };
    }

    // Batch events prefer open pentatonic voicings before falling back to weighted choice.
    if (event.voiceCount && event.voiceCount > 1 && typeof event.voiceIndex === "number") {
      const batchDegrees = getChordPriorityByBand(registerBand, event.voiceCount);
      if (event.degreeHint) {
        lastDegreeByNode.set(event.nodeId, event.degreeHint);
        return { degree: event.degreeHint, registerBand };
      }

      const preferredDegree = batchDegrees?.[event.voiceIndex];
      if (preferredDegree) {
        lastDegreeByNode.set(event.nodeId, preferredDegree);
        return { degree: preferredDegree, registerBand };
      }
    }

    if (event.degreeHint) {
      lastDegreeByNode.set(event.nodeId, event.degreeHint);
      return { degree: event.degreeHint, registerBand };
    }

    const degree = chooseWeightedDegree(registerBand, event.nodeId, excludedDegrees);
    lastDegreeByNode.set(event.nodeId, degree);
    return { degree, registerBand };
  };

  const getFrequency = (event: EchoEvent) => {
    const { degree } = resolveDegree(event);
    return degreeToFrequency(degree);
  };

  const degreeToFrequency = (degree: DegreeHint) => {
    const [, note, accidental, octaveText] = degree.match(/^([A-G])(#{0,1})(\d)$/) ?? [];
    const octave = Number(octaveText);
    const semitoneByNote: Record<string, number> = {
      C: 0,
      D: 2,
      E: 4,
      F: 5,
      G: 7,
      A: 9,
      B: 11,
    };
    const semitone = semitoneByNote[note] + (accidental === "#" ? 1 : 0);
    const midi = (octave + 1) * 12 + semitone;

    return 440 * Math.pow(2, (midi - 69) / 12);
  };

  const createSecretAudioEvent = (
    word: SecretCueWord,
    degreeHint: DegreeHint,
    intensity: number,
    batchRole: EchoEvent["batchRole"],
    voiceIndex: number,
    voiceCount: number
  ): EchoEvent => ({
    id: `secret-${word}-${voiceIndex}-${Date.now()}`,
    type: "node_active",
    at: new Date().toISOString(),
    nodeId: `secret-${word}`,
    intensity,
    degreeHint,
    voiceIndex,
    voiceCount,
    registerBand: 3,
    batchId: `secret-${word}-${Math.floor(Date.now() / 120)}`,
    batchRole,
    source: "resonance",
  });

  const shouldSuppressNodeActive = (event: EchoEvent) => {
    if (event.type !== "node_active") {
      return false;
    }

    const now = Date.now();
    if (now >= networkMelodyActiveUntil) {
      return false;
    }

    const source = event.source ?? "network";
    return source === "ambient" || source === "resonance";
  };

  const playNetworkMelody = (event: EchoEvent) => {
    const melodySpec = getNetworkMelodySpec(
      event,
      event.registerBand ?? topologyBands.get(event.nodeId) ?? 2
    );
    if (!melodySpec || !enabled) {
      return;
    }

    clearNetworkMelodyTimers();
    networkMelodyPendingEvent = null;

    const lastDelay = melodySpec.steps[melodySpec.steps.length - 1]?.delayMs ?? 0;
    const priorityDuration = Math.max(
      NETWORK_MELODY_PRIORITY_FLOOR_MS,
      Math.min(NETWORK_MELODY_PRIORITY_CAP_MS, lastDelay + NETWORK_MELODY_TAIL_ALLOWANCE_MS)
    );
    networkMelodyActiveUntil = Date.now() + priorityDuration;

    melodySpec.steps.forEach((step, index) => {
      const timeoutId = window.setTimeout(() => {
        networkMelodyTimeoutIds.delete(timeoutId);

        void playTransientVoice({
          ...event,
          at: new Date().toISOString(),
          degreeHint: resolveNetworkMelodyDegree(
            settings.root,
            melodySpec.baseOctave,
            step.interval
          ),
          voiceIndex: index,
          voiceCount: melodySpec.steps.length,
          batchRole:
            index === 0 ? "lead" : index === melodySpec.steps.length - 1 ? "tail" : "support",
          intensity: Math.max(
            0.28,
            event.intensity * (index === 0 ? 1 : Math.max(0.48, 0.82 - index * 0.12))
          ),
        });
      }, step.delayMs);

      networkMelodyTimeoutIds.add(timeoutId);
    });

    networkMelodyDrainTimeoutId = window.setTimeout(() => {
      networkMelodyDrainTimeoutId = null;
      networkMelodyActiveUntil = 0;

      const pendingEvent = networkMelodyPendingEvent;
      networkMelodyPendingEvent = null;
      if (pendingEvent && enabled) {
        playNetworkMelody(pendingEvent);
      }
    }, priorityDuration);
  };

  const cleanupVoices = () => {
    if (!audioContext) {
      activeTransientVoices = [];
      return;
    }

    const now = audioContext.currentTime;
    activeTransientVoices = activeTransientVoices.filter((voice) => voice.releaseAt > now);
  };

  const allocateTransientSlot = (
    source: EchoEvent["source"],
    batchRole: EchoEvent["batchRole"],
    strength: number
  ) => {
    cleanupVoices();
    return true;
  };

  const stopAmbient = (release = 0.6) => {
    if (!audioContext) {
      ambientBedVoices = [];
      ambientMaster = null;
      return;
    }

    const now = audioContext.currentTime;

    if (ambientMaster) {
      ambientMaster.gain.cancelScheduledValues(now);
      ambientMaster.gain.setTargetAtTime(0.0001, now, Math.max(0.12, release * 0.22));
    }

    ambientBedVoices.forEach(({ oscillator, gain, filter }) => {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0.0001, now, Math.max(0.12, release * 0.22));
      oscillator.stop(now + release + 0.1);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        filter.disconnect();
      };
    });

    ambientBedVoices = [];
    ambientMaster = null;
  };

  const startAmbient = async (nodes: EchoNode[]) => {
    const liveNodes = nodes;
    const context = await ensureAudioContext();

    refreshTopologyBands(nodes);
    stopAmbient(0.25);

    if (!enabled || liveNodes.length === 0) {
      return;
    }

    const averageIntensity =
      liveNodes.reduce((sum, node) => sum + node.intensity, 0) / liveNodes.length;
    const densityBoost =
      settings.density === "rich" ? 1 : settings.density === "balanced" ? 0.8 : 0.6;
    const rootFrequency = getRootFrequency();
    const supportSemitone = averageIntensity > 0.58 ? 9 : 7;
    const bedFrequencies = [rootFrequency, rootFrequency * Math.pow(2, supportSemitone / 12)];

    // The map bed stays to two quiet voices so discrete node triggers remain audible.
    ambientMaster = context.createGain();
    ambientMaster.gain.setValueAtTime(0.0001, context.currentTime);
    ambientMaster.connect(context.destination);

    ambientBedVoices = bedFrequencies.map((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const filter = context.createBiquadFilter();
      const baseGain = index === 0 ? 0.015 : 0.01;

      oscillator.type = index === 0 ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(frequency, context.currentTime);
      oscillator.detune.setValueAtTime(index === 0 ? 0 : 3, context.currentTime);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(
        180 + averageIntensity * 220 + index * 70,
        context.currentTime
      );
      filter.Q.setValueAtTime(0.6, context.currentTime);

      gain.gain.setValueAtTime(
        baseGain * densityBoost * AMBIENT_GAIN_MULTIPLIER,
        context.currentTime
      );

      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(ambientMaster!);
      oscillator.start();

      return { oscillator, gain, filter };
    });

    const targetMasterGain =
      Math.min(0.045, 0.014 + (liveNodes.length / 24) * 0.012 + averageIntensity * 0.01) *
      AMBIENT_GAIN_MULTIPLIER;
    ambientMaster.gain.linearRampToValueAtTime(targetMasterGain, context.currentTime + 1.1);
  };

  const playTransientVoice = async (event: EchoEvent) => {
    if (!enabled) {
      return;
    }

    const context = await ensureAudioContext();
    const frequency = getFrequency(event);
    const now = context.currentTime;
    const source = event.source ?? "network";
    const batchRole = event.batchRole ?? "support";
    const isSecretCueVoice = isSecretCueEvent(event);
    const isCollisionLike = isCollisionLikeResonanceEvent(event);
    const strength = event.intensity + (batchRole === "lead" ? 0.2 : 0);

    if (!isCollisionLike && !allocateTransientSlot(source, batchRole, strength)) {
      return;
    }

    const masterGain = context.createGain();
    const pluckOscillator = context.createOscillator();
    const bodyOscillator = context.createOscillator();
    const airBuffer = context.createBuffer(
      1,
      Math.floor(context.sampleRate * 0.35),
      context.sampleRate
    );
    const airSource = context.createBufferSource();
    const pluckFilter = context.createBiquadFilter();
    const bodyFilter = context.createBiquadFilter();
    const airFilter = context.createBiquadFilter();
    const pluckGain = context.createGain();
    const bodyGain = context.createGain();
    const airGain = context.createGain();
    const spatialPanner = isCollisionLike ? context.createStereoPanner() : null;
    const panLfo = isCollisionLike ? context.createOscillator() : null;
    const panDepth = isCollisionLike ? context.createGain() : null;
    const attack = 0.008;
    const resonanceBodyDuration = batchRole === "lead" ? 0.42 : batchRole === "tail" ? 0.26 : 0.32;
    const resonanceTailDuration = batchRole === "lead" ? 2.2 : batchRole === "tail" ? 1.45 : 1.7;
    const bodyDuration = isCollisionLike
      ? 0.12
      : source === "resonance"
        ? resonanceBodyDuration
        : 0.32;
    const tailDuration = isCollisionLike
      ? 1.45
      : source === "resonance"
        ? resonanceTailDuration
        : source === "ambient"
          ? 1.7
          : 2.1;
    const resonanceGainMultiplier = batchRole === "lead" ? 1.12 : batchRole === "tail" ? 0.7 : 0.84;
    const baseGain =
      (source === "resonance" ? 0.06 : 0.045) *
      (source === "resonance" ? resonanceGainMultiplier : batchRole === "lead" ? 1.15 : 1) *
      Math.min(1.1, 0.75 + event.intensity * 0.5);
    const maxGain = baseGain * (isCollisionLike ? 0.6 : 1) * TRANSIENT_GAIN_MULTIPLIER;

    // Blend a short pluck, a resonant body, and a faint airy tail for the default voice.
    const data = airBuffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * 0.16;
    }

    pluckOscillator.type = isCollisionLike ? "sine" : "triangle";
    pluckOscillator.frequency.setValueAtTime(frequency * 2, now);

    bodyOscillator.type = "sine";
    bodyOscillator.frequency.setValueAtTime(frequency, now);
    bodyOscillator.detune.setValueAtTime(isCollisionLike ? -7 : batchRole === "tail" ? -2 : 2, now);

    pluckFilter.type = "bandpass";
    pluckFilter.frequency.setValueAtTime(
      Math.min(isCollisionLike ? 1900 : 2600, frequency * (isCollisionLike ? 2.5 : 3.5)),
      now
    );
    pluckFilter.Q.setValueAtTime(isCollisionLike ? 0.9 : 1.2, now);

    bodyFilter.type = "lowpass";
    bodyFilter.frequency.setValueAtTime(
      isCollisionLike ? 420 + event.intensity * 160 : 700 + event.intensity * 550,
      now
    );
    bodyFilter.Q.setValueAtTime(isCollisionLike ? 0.62 : 0.9, now);

    airFilter.type = isCollisionLike ? "bandpass" : "highpass";
    airFilter.frequency.setValueAtTime(isCollisionLike ? 3400 : 1800, now);
    airFilter.Q.setValueAtTime(isCollisionLike ? 1.1 : 0.7, now);

    pluckGain.gain.setValueAtTime(0.0001, now);
    pluckGain.gain.linearRampToValueAtTime(maxGain * (isCollisionLike ? 0.28 : 0.62), now + attack);
    pluckGain.gain.exponentialRampToValueAtTime(0.0001, now + (isCollisionLike ? 0.08 : 0.16));

    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.linearRampToValueAtTime(
      maxGain * (isCollisionLike ? 0.62 : 1),
      now + (isCollisionLike ? 0.015 : 0.03)
    );
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + bodyDuration + tailDuration);

    airGain.gain.setValueAtTime(0.0001, now);
    airGain.gain.linearRampToValueAtTime(maxGain * (isCollisionLike ? 0.13 : 0.08), now + 0.06);
    airGain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + (isCollisionLike ? tailDuration : tailDuration)
    );

    pluckOscillator.connect(pluckFilter);
    pluckFilter.connect(pluckGain);
    pluckGain.connect(masterGain);

    bodyOscillator.connect(bodyFilter);
    bodyFilter.connect(bodyGain);
    bodyGain.connect(masterGain);

    airSource.buffer = airBuffer;
    airSource.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(masterGain);

    if (spatialPanner && panLfo && panDepth) {
      const panSeed = hashString(event.id) + hashString(event.nodeId) * 0.5;
      const basePan = ((panSeed % 1000) / 1000) * 1.1 - 0.55;

      spatialPanner.pan.setValueAtTime(basePan, now);
      panDepth.gain.setValueAtTime(0.16, now);
      panLfo.type = "sine";
      panLfo.frequency.setValueAtTime(0.24, now);

      masterGain.connect(spatialPanner);
      panLfo.connect(panDepth);
      panDepth.connect(spatialPanner.pan);
      spatialPanner.connect(context.destination);
      panLfo.start(now);
      panLfo.stop(now + tailDuration + 0.08);
    } else {
      masterGain.connect(context.destination);
    }

    pluckOscillator.start(now);
    bodyOscillator.start(now);
    airSource.start(now);

    pluckOscillator.stop(now + 0.22);
    bodyOscillator.stop(now + bodyDuration + tailDuration + 0.05);
    airSource.stop(now + tailDuration + 0.05);

    const stop = () => {
      const releaseNow = context.currentTime;
      masterGain.gain.cancelScheduledValues(releaseNow);
      masterGain.gain.setTargetAtTime(0.0001, releaseNow, 0.08);
      pluckOscillator.stop(releaseNow + 0.1);
      bodyOscillator.stop(releaseNow + 0.1);
      airSource.stop(releaseNow + 0.1);
      panLfo?.stop(releaseNow + 0.1);
    };

    activeTransientVoices.push({
      gain: masterGain,
      source,
      batchRole,
      strength,
      releaseAt: now + bodyDuration + tailDuration + 0.1,
      isSecretCue: isSecretCueVoice,
      stop,
    });

    bodyOscillator.onended = () => {
      masterGain.disconnect();
      pluckOscillator.disconnect();
      bodyOscillator.disconnect();
      airSource.disconnect();
      panLfo?.disconnect();
      panDepth?.disconnect();
      spatialPanner?.disconnect();
      pluckFilter.disconnect();
      bodyFilter.disconnect();
      airFilter.disconnect();
      pluckGain.disconnect();
      bodyGain.disconnect();
      airGain.disconnect();
      activeTransientVoices = activeTransientVoices.filter((voice) => voice.gain !== masterGain);
    };
  };

  return {
    configure(nextSettings) {
      settings = nextSettings;
    },
    playSecretProgress(word, index) {
      if (!enabled) {
        return;
      }

      const interval =
        SECRET_PROGRESS_INTERVALS[word][
          Math.min(index, SECRET_PROGRESS_INTERVALS[word].length - 1)
        ];
      void playTransientVoice(
        createSecretAudioEvent(
          word,
          resolvePentatonicByInterval(settings.root, 4, interval),
          0.16 + index * 0.02,
          "support",
          index,
          SECRET_PROGRESS_INTERVALS[word].length
        )
      );
    },
    playSecretCue(word) {
      if (!enabled) {
        return;
      }

      clearSecretCueTimers();
      secretCueActiveUntil = Date.now() + SECRET_CUE_DURATION_MS;
      resetNetworkMelodyState();
      stopAmbient(0.14);
      stopTransientVoices(0.05);

      secretCueReleaseTimeoutId = window.setTimeout(() => {
        secretCueReleaseTimeoutId = null;
        secretCueActiveUntil = 0;
        resumeAmbientIfNeeded();
      }, SECRET_CUE_DURATION_MS);

      const spec = SECRET_CUE_SPECS[word];
      spec.steps.forEach((step, index) => {
        const timeoutId = window.setTimeout(() => {
          secretCueTimeoutIds.delete(timeoutId);
          void playTransientVoice(
            createSecretAudioEvent(
              word,
              resolvePentatonicByInterval(settings.root, spec.baseOctave, step.interval),
              step.intensity,
              step.batchRole,
              index,
              spec.steps.length
            )
          );
        }, step.delayMs);

        secretCueTimeoutIds.add(timeoutId);
      });
    },
    stopSecretCue() {
      stopActiveSecretCue();
    },
    enable() {
      enabled = true;
      void ensureAudioContext();
    },
    disable() {
      enabled = false;
      secretCueActiveUntil = 0;
      stopAmbient(0.5);
      resetNetworkMelodyState();
      clearSecretCueTimers();
      stopTransientVoices(0.08);
    },
    syncAmbient(scene: SceneId, nodes: EchoNode[]) {
      lastAmbientScene = scene;
      lastAmbientNodes = nodes;
      refreshTopologyBands(nodes);
      if (!enabled) {
        return;
      }

      if (isSecretCueActive()) {
        stopAmbient(0.14);
        return;
      }

      if (scene === "map") {
        void startAmbient(nodes);
        return;
      }

      stopAmbient(0.55);
    },
    trigger(event: EchoEvent) {
      if (!enabled) {
        return;
      }

      if (isSecretCueActive() && (event.source ?? "network") === "ambient") {
        return;
      }

      if (isNetworkMelodyEventType(event.type)) {
        if (Date.now() < networkMelodyActiveUntil) {
          networkMelodyPendingEvent = event;
          return;
        }

        playNetworkMelody(event);
        return;
      }

      if (shouldSuppressNodeActive(event)) {
        return;
      }

      void playTransientVoice(event);
    },
    dispose() {
      enabled = false;
      secretCueActiveUntil = 0;
      stopAmbient(0.1);
      resetNetworkMelodyState();
      clearSecretCueTimers();
      stopTransientVoices(0.05);

      if (audioContext) {
        audioContext.close().catch(() => undefined);
        audioContext = null;
      }
    },
  };
}
