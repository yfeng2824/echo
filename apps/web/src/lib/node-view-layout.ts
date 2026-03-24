import type { EchoNode } from "@echo/contracts";

const FULL_TURN = Math.PI * 2;

export type NodeViewPeerOrbit = {
  node: EchoNode;
  angle: number;
  orbitDistance: number;
};

const MIN_ORBIT_DISTANCE = 0.7;
const MAX_ORBIT_DISTANCE = 1.26;

function hashString(value: string) {
  let hash = 0;

  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) % 100000;
  }

  return hash;
}

function seededRandom(seed: number) {
  const value = Math.sin(seed) * 10000;
  return value - Math.floor(value);
}

function normalizeAngle(angle: number) {
  const wrapped = angle % FULL_TURN;
  return wrapped < 0 ? wrapped + FULL_TURN : wrapped;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function getGeoDistanceKm(left: EchoNode, right: EchoNode) {
  const latDelta = toRadians(right.lat - left.lat);
  const lngDelta = toRadians(right.lng - left.lng);
  const leftLat = toRadians(left.lat);
  const rightLat = toRadians(right.lat);
  const haversine =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(lngDelta / 2) * Math.sin(lngDelta / 2);
  const angularDistance = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return 6371 * angularDistance;
}

export function getNodeViewLayoutSeed(selectedNodeId: string) {
  return hashString(selectedNodeId) * 0.37 + 17;
}

export function getNodeViewPeerOrbits(selectedNode: EchoNode, peers: EchoNode[], layoutSeed: number): NodeViewPeerOrbit[] {
  const distances = peers.map((peer) => getGeoDistanceKm(selectedNode, peer));
  const minDistance = Math.min(...distances, 0);
  const maxDistance = Math.max(...distances, minDistance);
  const distanceSpread = Math.max(1, maxDistance - minDistance);

  return peers.map((peer, index) => {
    const hash = hashString(peer.id);
    const seedBase = layoutSeed + hash * 0.37 + index * 13.1;
    const angleJitter = (seededRandom(seedBase) - 0.5) * 0.7;
    const radialJitter = (seededRandom(seedBase + 11.3) - 0.5) * 0.08;
    const orbitBias = (seededRandom(seedBase + 23.7) - 0.5) * 26;
    const angle = normalizeAngle((index / Math.max(peers.length, 1)) * FULL_TURN + angleJitter + orbitBias * 0.01);
    const normalizedDistance = Math.sqrt((distances[index] - minDistance) / distanceSpread);
    const proportionalOrbitDistance =
      MIN_ORBIT_DISTANCE + normalizedDistance * (MAX_ORBIT_DISTANCE - MIN_ORBIT_DISTANCE);

    return {
      node: peer,
      angle,
      orbitDistance: clamp(proportionalOrbitDistance + radialJitter, MIN_ORBIT_DISTANCE, MAX_ORBIT_DISTANCE)
    };
  });
}

export function sortNodeViewPeerOrbits(orbits: NodeViewPeerOrbit[]) {
  return [...orbits].sort((left, right) => {
    const distanceDelta = left.orbitDistance - right.orbitDistance;
    if (Math.abs(distanceDelta) > 0.0001) {
      return distanceDelta;
    }

    const angleDelta = left.angle - right.angle;
    if (Math.abs(angleDelta) > 0.0001) {
      return angleDelta;
    }

    return left.node.id.localeCompare(right.node.id);
  });
}
