import type {
  AudioEngine,
  AudioRoot,
  AudioSettings,
  DegreeHint,
  EchoEvent,
  EchoNode,
  RegisterBand,
  SceneId
} from "@echo/contracts";
import { getBandBaseOctave, resolvePentatonicByInterval } from "../../lib/pentatonic";

type ActiveTransientVoice = {
  gain: GainNode;
  source: EchoEvent["source"];
  batchRole: EchoEvent["batchRole"];
  strength: number;
  releaseAt: number;
  stop: () => void;
};

const WEIGHTED_INTERVALS: Record<RegisterBand, Array<{ interval: number; weight: number }>> = {
  1: [
    { interval: 0, weight: 5 },
    { interval: 2, weight: 3 },
    { interval: 7, weight: 4 }
  ],
  2: [
    { interval: 0, weight: 4 },
    { interval: 2, weight: 3 },
    { interval: 4, weight: 2 },
    { interval: 7, weight: 4 }
  ],
  3: [
    { interval: 2, weight: 3 },
    { interval: 4, weight: 4 },
    { interval: 7, weight: 4 },
    { interval: 9, weight: 3 }
  ],
  4: [
    { interval: 4, weight: 4 },
    { interval: 7, weight: 5 },
    { interval: 9, weight: 4 }
  ]
};

const CHORD_PRIORITY_INTERVALS_BY_BAND: Record<RegisterBand, Record<number, number[]>> = {
  1: {
    1: [0],
    2: [0, 7],
    3: [0, 7, 9],
    4: [0, 2, 7, 9]
  },
  2: {
    1: [0],
    2: [0, 7],
    3: [0, 7, 9],
    4: [0, 2, 7, 9]
  },
  3: {
    1: [0],
    2: [0, 7],
    3: [0, 7, 9],
    4: [0, 2, 7, 9]
  },
  4: {
    1: [0],
    2: [0, 7],
    3: [0, 7, 9],
    4: [0, 2, 7, 9]
  }
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
  B: 11
};

export function createAudioEngine(): AudioEngine {
  let enabled = false;
  let audioContext: AudioContext | null = null;
  let ambientMaster: GainNode | null = null;
  let ambientBedVoices: Array<{ oscillator: OscillatorNode; gain: GainNode; filter: BiquadFilterNode }> =
    [];
  let topologyBands = new Map<string, RegisterBand>();
  let lastDegreeByNode = new Map<string, DegreeHint>();
  let activeTransientVoices: ActiveTransientVoice[] = [];
  let settings: AudioSettings = {
    density: "balanced",
    timbrePreset: "standard",
    root: "C"
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

  const getWeightedPitchesForBand = (band: RegisterBand) =>
    WEIGHTED_INTERVALS[band].map(({ interval, weight }) => ({
      degree: resolvePentatonicByInterval(settings.root, getBandBaseOctave(band), interval),
      weight
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

  const chooseWeightedDegree = (band: RegisterBand, nodeId: string, excludedDegrees: DegreeHint[]) => {
    const weightedPitches = getWeightedPitchesForBand(band);
    const candidates = weightedPitches.filter(
      ({ degree }) => !excludedDegrees.includes(degree)
    );
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
    const [, note, accidental, octaveText] = degree.match(/^([A-G])(#{0,1})(\d)$/) ?? [];
    const octave = Number(octaveText);
    const semitoneByNote: Record<string, number> = {
      C: 0,
      D: 2,
      E: 4,
      F: 5,
      G: 7,
      A: 9,
      B: 11
    };
    const semitone = semitoneByNote[note] + (accidental === "#" ? 1 : 0);
    const midi = (octave + 1) * 12 + semitone;

    return 440 * Math.pow(2, (midi - 69) / 12);
  };

  const cleanupVoices = () => {
    if (!audioContext) {
      activeTransientVoices = [];
      return;
    }

    const now = audioContext.currentTime;
    activeTransientVoices = activeTransientVoices.filter((voice) => voice.releaseAt > now);
  };

  const getVoiceLimit = (source: EchoEvent["source"]) => {
    if (source === "resonance") {
      return 8;
    }

    return 3;
  };

  const allocateTransientSlot = (source: EchoEvent["source"], batchRole: EchoEvent["batchRole"], strength: number) => {
    cleanupVoices();
    const limit = getVoiceLimit(source);
    const sourceVoices = activeTransientVoices.filter((voice) => voice.source === source);

    if (sourceVoices.length < limit) {
      return true;
    }

    const candidate = sourceVoices
      .filter((voice) => voice.batchRole !== "lead")
      .sort((left, right) => left.strength - right.strength)[0];

    if (!candidate) {
      return false;
    }

    if (candidate.strength > strength && batchRole !== "lead") {
      return false;
    }

    candidate.stop();
    activeTransientVoices = activeTransientVoices.filter((voice) => voice !== candidate);
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
    const bedFrequencies = [
      rootFrequency,
      rootFrequency * Math.pow(2, supportSemitone / 12)
    ];

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

      gain.gain.setValueAtTime(baseGain * densityBoost, context.currentTime);

      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(ambientMaster!);
      oscillator.start();

      return { oscillator, gain, filter };
    });

    const targetMasterGain = Math.min(
      0.045,
      0.014 + (liveNodes.length / 24) * 0.012 + averageIntensity * 0.01
    );
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
    const strength = event.intensity + (batchRole === "lead" ? 0.2 : 0);

    if (!allocateTransientSlot(source, batchRole, strength)) {
      return;
    }

    const masterGain = context.createGain();
    const pluckOscillator = context.createOscillator();
    const bodyOscillator = context.createOscillator();
    const airBuffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.35), context.sampleRate);
    const airSource = context.createBufferSource();
    const pluckFilter = context.createBiquadFilter();
    const bodyFilter = context.createBiquadFilter();
    const airFilter = context.createBiquadFilter();
    const pluckGain = context.createGain();
    const bodyGain = context.createGain();
    const airGain = context.createGain();
    const attack = 0.008;
    const bodyDuration = source === "resonance" ? 0.48 : 0.32;
    const tailDuration = source === "resonance" ? 2.6 : source === "ambient" ? 1.7 : 2.1;
    const maxGain =
      (source === "resonance" ? 0.06 : 0.045) *
      (batchRole === "lead" ? 1.15 : 1) *
      Math.min(1.1, 0.75 + event.intensity * 0.5);

    // Blend a short pluck, a resonant body, and a faint airy tail for the default voice.
    const data = airBuffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * 0.16;
    }

    pluckOscillator.type = "triangle";
    pluckOscillator.frequency.setValueAtTime(frequency * 2, now);

    bodyOscillator.type = "sine";
    bodyOscillator.frequency.setValueAtTime(frequency, now);
    bodyOscillator.detune.setValueAtTime(batchRole === "tail" ? -2 : 2, now);

    pluckFilter.type = "bandpass";
    pluckFilter.frequency.setValueAtTime(Math.min(2600, frequency * 3.5), now);
    pluckFilter.Q.setValueAtTime(1.2, now);

    bodyFilter.type = "lowpass";
    bodyFilter.frequency.setValueAtTime(700 + event.intensity * 550, now);
    bodyFilter.Q.setValueAtTime(0.9, now);

    airFilter.type = "highpass";
    airFilter.frequency.setValueAtTime(1800, now);
    airFilter.Q.setValueAtTime(0.7, now);

    pluckGain.gain.setValueAtTime(0.0001, now);
    pluckGain.gain.linearRampToValueAtTime(maxGain * 0.62, now + attack);
    pluckGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.linearRampToValueAtTime(maxGain, now + 0.03);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + bodyDuration + tailDuration);

    airGain.gain.setValueAtTime(0.0001, now);
    airGain.gain.linearRampToValueAtTime(maxGain * 0.08, now + 0.06);
    airGain.gain.exponentialRampToValueAtTime(0.0001, now + tailDuration);

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

    masterGain.connect(context.destination);

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
    };

    activeTransientVoices.push({
      gain: masterGain,
      source,
      batchRole,
      strength,
      releaseAt: now + bodyDuration + tailDuration + 0.1,
      stop
    });

    bodyOscillator.onended = () => {
      masterGain.disconnect();
      pluckOscillator.disconnect();
      bodyOscillator.disconnect();
      airSource.disconnect();
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
    enable() {
      enabled = true;
      void ensureAudioContext();
    },
    disable() {
      enabled = false;
      stopAmbient(0.5);
      cleanupVoices();
      if (audioContext) {
        const now = audioContext.currentTime;
        activeTransientVoices.forEach((voice) => {
          voice.gain.gain.cancelScheduledValues(now);
          voice.gain.gain.setTargetAtTime(0.0001, now, 0.08);
          voice.stop();
        });
      }
      activeTransientVoices = [];
    },
    syncAmbient(scene: SceneId, nodes: EchoNode[]) {
      refreshTopologyBands(nodes);
      if (!enabled) {
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

      void playTransientVoice(event);
    },
    dispose() {
      enabled = false;
      stopAmbient(0.1);
      activeTransientVoices.forEach((voice) => voice.stop());
      activeTransientVoices = [];

      if (audioContext) {
        audioContext.close().catch(() => undefined);
        audioContext = null;
      }
    }
  };
}
