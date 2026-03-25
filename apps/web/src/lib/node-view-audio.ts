import type {
  AudioDensity,
  AudioRoot,
  DegreeHint,
  EchoEvent,
  EchoNode,
  RegisterBand,
} from "@echo/contracts";
import { resolvePentatonicByInterval } from "./pentatonic";
import {
  getNodeViewLayoutSeed,
  getNodeViewPeerOrbits,
  sortNodeViewPeerOrbits,
} from "./node-view-layout";

const PEER_RESPONSE_START_RANGE_MS = { min: 82, max: 126 };
const PEER_RESPONSE_END_RANGE_MS = { min: 214, max: 286 };
const PEER_RESPONSE_CURVE_RANGE = { min: 0.88, max: 1.16 };
const PEER_RESPONSE_JITTER_MS = 12;
const PEER_RESPONSE_MIN_GAP_MS = 14;
const NODE_VIEW_INTERVALS = [0, 7, 12, 19, 24, 31] as const;

const NODE_VIEW_DELAY_BY_DENSITY: Record<AudioDensity, { min: number; max: number }> = {
  sparse: { min: 2800, max: 3600 },
  balanced: { min: 2200, max: 3000 },
  rich: { min: 1800, max: 2400 },
};

export type PlannedPhraseStep = {
  event: EchoEvent;
  delayMs: number;
};

type PlanNodeViewPhraseInput = {
  nodes: EchoNode[];
  selectedNodeId: string;
  root: AudioRoot;
  registerBandMap: Map<string, RegisterBand>;
  phraseId: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function interpolate(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function randomInRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function getBatchRole(index: number, voiceCount: number): EchoEvent["batchRole"] {
  if (index === 0) {
    return "lead";
  }

  if (index === voiceCount - 1) {
    return "tail";
  }

  return "support";
}

function resolveNodeViewDegree(root: AudioRoot, interval: number): DegreeHint {
  return resolvePentatonicByInterval(root, 3, interval);
}

function buildPeerDelays(peerCount: number) {
  if (peerCount <= 0) {
    return [];
  }

  const responseStart = randomInRange(
    PEER_RESPONSE_START_RANGE_MS.min,
    PEER_RESPONSE_START_RANGE_MS.max
  );
  const responseEnd = Math.max(
    responseStart + 76,
    randomInRange(PEER_RESPONSE_END_RANGE_MS.min, PEER_RESPONSE_END_RANGE_MS.max)
  );
  const responseCurve = randomInRange(PEER_RESPONSE_CURVE_RANGE.min, PEER_RESPONSE_CURVE_RANGE.max);
  let previousDelay = responseStart - PEER_RESPONSE_MIN_GAP_MS;

  return Array.from({ length: peerCount }, (_, peerIndex) => {
    const progress = peerCount <= 1 ? 0 : peerIndex / Math.max(1, peerCount - 1);
    const curvedProgress = Math.pow(progress, responseCurve);
    const baseDelay = interpolate(responseStart, responseEnd, curvedProgress);
    const jitter = randomInRange(-PEER_RESPONSE_JITTER_MS, PEER_RESPONSE_JITTER_MS);
    const delay = Math.round(
      Math.max(previousDelay + PEER_RESPONSE_MIN_GAP_MS, baseDelay + jitter)
    );
    previousDelay = Math.min(delay, Math.round(responseEnd));

    return previousDelay;
  });
}

function resolvePeerIntensity(
  node: EchoNode,
  orbitDistance: number,
  minDistance: number,
  maxDistance: number
) {
  const spread = Math.max(0.001, maxDistance - minDistance);
  const normalizedDistance = (orbitDistance - minDistance) / spread;
  const proximity = 1 - normalizedDistance;

  return clamp(0.28 + node.intensity * 0.24 + proximity * 0.12, 0.28, 0.62);
}

export function pickNodeViewPhraseDelay(density: AudioDensity) {
  const range = NODE_VIEW_DELAY_BY_DENSITY[density];
  return range.min + Math.random() * (range.max - range.min);
}

export function planNodeViewPhrase({
  nodes,
  selectedNodeId,
  root,
  registerBandMap,
  phraseId,
}: PlanNodeViewPhraseInput): PlannedPhraseStep[] {
  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  if (!selectedNode) {
    return [];
  }

  const peers = nodes.filter((node) => selectedNode.peers.includes(node.id));
  const layoutSeed = getNodeViewLayoutSeed(selectedNode.id);
  const sortedPeerOrbits = sortNodeViewPeerOrbits(
    getNodeViewPeerOrbits(selectedNode, peers, layoutSeed)
  );
  const peerDelays = buildPeerDelays(sortedPeerOrbits.length);
  const voiceCount = 1 + sortedPeerOrbits.length;
  const minDistance = Math.min(...sortedPeerOrbits.map((entry) => entry.orbitDistance), 0.82);
  const maxDistance = Math.max(
    ...sortedPeerOrbits.map((entry) => entry.orbitDistance),
    minDistance
  );
  const centerRegisterBand = registerBandMap.get(selectedNode.id) ?? 1;
  const steps: PlannedPhraseStep[] = [
    {
      delayMs: 0,
      event: {
        id: `${phraseId}-0-${selectedNode.id}`,
        type: "node_active",
        at: new Date().toISOString(),
        nodeId: selectedNode.id,
        intensity: clamp(0.74 + selectedNode.intensity * 0.28, 0.74, 1),
        voiceIndex: 0,
        voiceCount,
        registerBand: centerRegisterBand,
        degreeHint: resolveNodeViewDegree(root, NODE_VIEW_INTERVALS[0]),
        batchId: phraseId,
        batchRole: "lead",
        source: "resonance",
      },
    },
  ];

  sortedPeerOrbits.forEach((entry, index) => {
    const voiceIndex = index + 1;
    const node = entry.node;
    const registerBand = registerBandMap.get(node.id) ?? centerRegisterBand;

    steps.push({
      delayMs: peerDelays[index] ?? PEER_RESPONSE_START_RANGE_MS.min,
      event: {
        id: `${phraseId}-${voiceIndex}-${node.id}`,
        type: "node_active",
        at: new Date().toISOString(),
        nodeId: node.id,
        intensity: resolvePeerIntensity(node, entry.orbitDistance, minDistance, maxDistance),
        voiceIndex,
        voiceCount,
        registerBand,
        degreeHint: resolveNodeViewDegree(
          root,
          NODE_VIEW_INTERVALS[1 + (index % (NODE_VIEW_INTERVALS.length - 1))]
        ),
        batchId: phraseId,
        batchRole: getBatchRole(voiceIndex, voiceCount),
        source: "resonance",
      },
    });
  });

  return steps;
}
