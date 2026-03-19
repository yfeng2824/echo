import type { EchoNode, RegisterBand } from "@echo/contracts";
import { getDisplayNodeId, getFullHexNodeId } from "./node-id";

export function buildRegisterBandMap(nodes: EchoNode[]): Map<string, RegisterBand> {
  const liveNodes = nodes
    .filter((node) => node.status === "live")
    .sort((left, right) => {
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

export function findNodeByQuery(nodes: EchoNode[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return null;
  }

  return (
    nodes.find((node) => {
      const rawId = node.id.toLowerCase();
      const fullHexId = getFullHexNodeId(node.id).toLowerCase();
      const displayId = getDisplayNodeId(node.id).toLowerCase();

      return (
        rawId === normalizedQuery ||
        fullHexId === normalizedQuery ||
        displayId === normalizedQuery
      );
    }) ?? null
  );
}
