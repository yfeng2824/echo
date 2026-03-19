import type { EchoEvent } from "@echo/contracts";

export const mockEvents: EchoEvent[] = [
  {
    id: "evt-1",
    type: "payment_routed",
    at: "2026-03-19T08:00:10.000Z",
    nodeId: "tokyo-1",
    intensity: 0.86
  },
  {
    id: "evt-2",
    type: "path_used",
    at: "2026-03-19T08:00:12.000Z",
    nodeId: "frankfurt-1",
    channelId: "tokyo-frankfurt",
    intensity: 0.7
  },
  {
    id: "evt-3",
    type: "node_active",
    at: "2026-03-19T08:00:15.000Z",
    nodeId: "new-york-1",
    intensity: 0.64
  }
];

