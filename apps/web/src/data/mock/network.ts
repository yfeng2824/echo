import type { EchoChannel, EchoNode } from "@echo/contracts";

export const mockNodes: EchoNode[] = [
  {
    id: "tokyo-1",
    label: "Tokyo",
    lat: 35.6762,
    lng: 139.6503,
    region: "APAC",
    status: "live",
    intensity: 0.78,
    peers: ["frankfurt-1", "singapore-1"]
  },
  {
    id: "frankfurt-1",
    label: "Frankfurt",
    lat: 50.1109,
    lng: 8.6821,
    region: "Europe",
    status: "live",
    intensity: 0.71,
    peers: ["tokyo-1", "new-york-1"]
  },
  {
    id: "new-york-1",
    label: "New York",
    lat: 40.7128,
    lng: -74.006,
    region: "North America",
    status: "live",
    intensity: 0.63,
    peers: ["frankfurt-1", "sao-paulo-1"]
  },
  {
    id: "singapore-1",
    label: "Singapore",
    lat: 1.3521,
    lng: 103.8198,
    region: "APAC",
    status: "quiet",
    intensity: 0.34,
    peers: ["tokyo-1"]
  }
];

export const mockChannels: EchoChannel[] = [
  {
    id: "tokyo-frankfurt",
    sourceNodeId: "tokyo-1",
    targetNodeId: "frankfurt-1",
    strength: 0.9,
    lastActiveAt: "2026-03-19T08:00:00.000Z"
  },
  {
    id: "frankfurt-new-york",
    sourceNodeId: "frankfurt-1",
    targetNodeId: "new-york-1",
    strength: 0.82,
    lastActiveAt: "2026-03-19T08:02:00.000Z"
  },
  {
    id: "tokyo-singapore",
    sourceNodeId: "tokyo-1",
    targetNodeId: "singapore-1",
    strength: 0.58,
    lastActiveAt: "2026-03-19T07:58:00.000Z"
  }
];

