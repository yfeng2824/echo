import type { EchoNode, RegisterBand } from "@echo/contracts";
import {
  getDisplayNodeId,
  getFullHexNodeId,
  getFullNodeId,
  normalizePublicNodeId,
} from "./node-id";

export function buildRegisterBandMap(nodes: EchoNode[]): Map<string, RegisterBand> {
  const liveNodes = [...nodes].sort((left, right) => {
    const degreeDelta = left.peers.length - right.peers.length;
    if (degreeDelta !== 0) {
      return degreeDelta;
    }

    return left.id.localeCompare(right.id);
  });

  const bandMap = new Map<string, RegisterBand>();

  liveNodes.forEach((node, index) => {
    const normalized = liveNodes.length > 1 ? index / (liveNodes.length - 1) : 0;
    const band = Math.min(4, Math.floor(normalized * 4) + 1) as RegisterBand;
    bandMap.set(node.id, band);
  });

  return bandMap;
}

function getNodeSearchTerms(node: EchoNode) {
  const rawId = node.id.toLowerCase();
  const peerId = node.peerId?.toLowerCase() ?? "";
  const fiberPubkey = node.fiberPubkey?.toLowerCase() ?? "";
  const fullNodeId = getFullNodeId(node).toLowerCase();
  const fallbackHexId = getFullHexNodeId(node.id).toLowerCase();
  const displayId = getDisplayNodeId(node).toLowerCase();
  const normalizedPublicIds = [
    fiberPubkey ? normalizePublicNodeId(fiberPubkey) : "",
    normalizePublicNodeId(fullNodeId),
  ];

  return new Set([
    rawId,
    peerId,
    fiberPubkey,
    fullNodeId,
    fallbackHexId,
    displayId,
    ...normalizedPublicIds,
  ]);
}

export function findNodeByQuery(nodes: EchoNode[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return null;
  }

  const normalizedPublicQuery = normalizePublicNodeId(normalizedQuery);
  return (
    nodes.find((node) => {
      const searchTerms = getNodeSearchTerms(node);
      return searchTerms.has(normalizedQuery) || searchTerms.has(normalizedPublicQuery);
    }) ?? null
  );
}
