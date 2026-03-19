const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

function fnv1a(input: string) {
  let hash = FNV_OFFSET;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }

  return hash >>> 0;
}

export function getFullHexNodeId(nodeId: string) {
  // Derive a stable, wallet-like display ID without changing the internal graph keys.
  const segments = [0, 1, 2, 3].map((salt) =>
    fnv1a(`${nodeId}:${salt}`).toString(16).padStart(8, "0")
  );

  return `0x${segments.join("")}`;
}

export function getDisplayNodeId(nodeId: string) {
  const fullHex = getFullHexNodeId(nodeId);
  return `${fullHex.slice(0, 8)}...${fullHex.slice(-6)}`;
}
