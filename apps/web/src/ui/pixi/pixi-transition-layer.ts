export function easeOutCubic(progress: number) {
  return 1 - Math.pow(1 - progress, 3);
}

export const MAP_RETURN_TRANSITION_MS = 1150;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getMapSearchFocusState(startedAt: number | null, now: number) {
  const progress = startedAt ? clamp((now - startedAt) / 950, 0, 1) : 0;
  const easedFocus = easeOutCubic(progress);

  return {
    progress,
    easedFocus,
  };
}

export function getNodeEntryState(enteredAt: number | null, now: number) {
  const entryProgress = enteredAt ? clamp((now - enteredAt) / 1100, 0, 1) : 1;
  const entryEase = easeOutCubic(entryProgress);
  const peerEntryProgress = clamp((entryProgress - 0.16) / 0.84, 0, 1);
  const peerEntryEase = easeOutCubic(peerEntryProgress);
  const lineEntryProgress = clamp((entryProgress - 0.32) / 0.68, 0, 1);
  const lineEntryEase = easeOutCubic(lineEntryProgress);

  return {
    entryProgress,
    entryEase,
    peerEntryProgress,
    peerEntryEase,
    lineEntryProgress,
    lineEntryEase,
    mapFade: 1 - entryEase,
  };
}

export function getMapReturnState(startedAt: number | null, now: number) {
  const progress = startedAt ? clamp((now - startedAt) / MAP_RETURN_TRANSITION_MS, 0, 1) : 1;
  const easedReturn = easeOutCubic(progress);
  const remaining = 1 - easedReturn;

  return {
    progress,
    easedReturn,
    remaining,
    isActive: remaining > 0.001,
  };
}
