import type { EchoNode } from "@echo/contracts";

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

type NodeIdSource = Pick<EchoNode, "id" | "fiberPubkey" | "peerId"> | string;

function fnv1a(input: string) {
  let hash = FNV_OFFSET;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }

  return hash >>> 0;
}

function getDerivedHexNodeId(nodeId: string) {
  // Keep a hex fallback for peer-only nodes without changing internal graph keys.
  const segments = Array.from({ length: 4 }, (_, salt) => fnv1a(`${nodeId}:${salt}`).toString(16).padStart(8, "0"));

  return `0x${segments.join("")}`;
}

function isHexLike(value: string) {
  return /^[0-9a-f]+$/i.test(value.replace(/^0x/i, ""));
}

export function normalizePublicNodeId(value: string) {
  return value.trim().toLowerCase().replace(/^0x/, "");
}

function formatPublicNodeId(value: string) {
  return `0x${normalizePublicNodeId(value)}`;
}

function resolveFullNodeId(source: NodeIdSource) {
  if (typeof source === "string") {
    return isHexLike(source) ? formatPublicNodeId(source) : getDerivedHexNodeId(source);
  }

  const publicId = source.fiberPubkey ?? source.id;
  return source.fiberPubkey ? formatPublicNodeId(publicId) : getDerivedHexNodeId(publicId);
}

export function getFullHexNodeId(nodeId: string) {
  return getDerivedHexNodeId(nodeId);
}

export function getFullNodeId(source: NodeIdSource) {
  return resolveFullNodeId(source);
}

export function getDisplayNodeId(source: NodeIdSource) {
  const fullHex = resolveFullNodeId(source);
  return `${fullHex.slice(0, 8)}...${fullHex.slice(-6)}`;
}
