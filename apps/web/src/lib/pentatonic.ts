import type { AudioRoot, DegreeHint, RegisterBand } from "@echo/contracts";

export type ScaleDegreeKey = "root" | "second" | "third" | "fifth" | "sixth";

export const ROOT_OPTIONS: AudioRoot[] = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

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

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

const DEGREE_INTERVALS: Record<ScaleDegreeKey, number> = {
  root: 0,
  second: 2,
  third: 4,
  fifth: 7,
  sixth: 9,
};

export function getBandBaseOctave(registerBand: RegisterBand) {
  return registerBand + 1;
}

export function resolvePentatonicByInterval(
  root: AudioRoot,
  baseOctave: number,
  semitoneInterval: number
): DegreeHint {
  const rootSemitone = ROOT_SEMITONE[root];
  const semitone = rootSemitone + semitoneInterval;
  const octaveShift = Math.floor(semitone / 12);
  const noteIndex = ((semitone % 12) + 12) % 12;
  const noteName = NOTE_NAMES[noteIndex];
  const octave = baseOctave + octaveShift;

  return `${noteName}${octave}` as DegreeHint;
}

export function resolvePentatonicDegree(
  root: AudioRoot,
  registerBand: RegisterBand,
  degree: ScaleDegreeKey
): DegreeHint {
  return resolvePentatonicByInterval(
    root,
    getBandBaseOctave(registerBand),
    DEGREE_INTERVALS[degree]
  );
}
