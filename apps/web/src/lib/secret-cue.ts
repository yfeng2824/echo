import type { SecretCueState } from "@echo/contracts";

export const SECRET_CUE_DURATION_MS = 3000;
export const SECRET_PROMPT_LOCK_MS = 220;
export const SECRET_PROMPT_COMPRESS_MS = 260;
export const SECRET_PROMPT_RELEASE_MS = 320;

export const SECRET_PROMPT_COLLAPSE_AT_MS = SECRET_PROMPT_LOCK_MS;
export const SECRET_PROMPT_RELEASE_AT_MS = SECRET_PROMPT_COLLAPSE_AT_MS + SECRET_PROMPT_COMPRESS_MS;
export const SECRET_PROMPT_HIDE_AT_MS = SECRET_PROMPT_RELEASE_AT_MS + SECRET_PROMPT_RELEASE_MS;

export const SECRET_PULSE_TIMINGS_MS = [820, 1760, 2700] as const;
const SECRET_PULSE_WIDTH_MS = 240;

export type SecretPromptPhase = "typing" | "locked" | "compressed" | "released" | "hidden";

export function resolveSecretPromptPhase(
  secretCue: SecretCueState,
  now: number
): SecretPromptPhase {
  if (!secretCue.word || secretCue.phase === "idle") {
    return "hidden";
  }

  if (secretCue.phase === "typing") {
    return "typing";
  }

  if (
    secretCue.promptCollapseAt === null ||
    secretCue.promptReleaseAt === null ||
    secretCue.promptHideAt === null
  ) {
    return "hidden";
  }

  if (now < secretCue.promptCollapseAt) {
    return "locked";
  }

  if (now < secretCue.promptReleaseAt) {
    return "compressed";
  }

  if (now < secretCue.promptHideAt) {
    return "released";
  }

  return "hidden";
}

export function getSecretPulseStrength(secretCue: SecretCueState, now: number) {
  if (
    secretCue.phase !== "playing" ||
    secretCue.startedAt === null ||
    secretCue.expiresAt === null
  ) {
    return 0;
  }

  const startedAt = secretCue.startedAt;
  const duration = Math.max(1, secretCue.expiresAt - startedAt);
  const progress = Math.max(0, Math.min(1, (now - startedAt) / duration));
  if (progress >= 1) {
    return 0;
  }

  const attack = Math.min(1, progress / 0.2);
  const decay = 1 - Math.max(0, (progress - 0.7) / 0.3);
  const envelope = attack * decay;

  const pulse = SECRET_PULSE_TIMINGS_MS.reduce((strongest, pulseOffset) => {
    const distance = Math.abs(now - (startedAt + pulseOffset));
    const strength = Math.max(0, 1 - distance / SECRET_PULSE_WIDTH_MS);
    return Math.max(strongest, strength * strength);
  }, 0);

  return pulse * envelope;
}
