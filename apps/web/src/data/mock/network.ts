import type { EchoChannel, EchoNode } from "@echo/contracts";

export const mockNodes: EchoNode[] = [
  {
    id: "berlin-1",
    label: "Berlin",
    lat: 52.52,
    lng: 13.405,
    region: "Europe",
    status: "live",
    intensity: 0.78,
    peers: ["london-1", "frankfurt-1", "stockholm-1"]
  },
  {
    id: "london-1",
    label: "London",
    lat: 51.5072,
    lng: -0.1276,
    region: "Europe",
    status: "live",
    intensity: 0.74,
    peers: ["berlin-1", "new-york-1", "paris-1"]
  },
  {
    id: "frankfurt-1",
    label: "Frankfurt",
    lat: 50.1109,
    lng: 8.6821,
    region: "Europe",
    status: "live",
    intensity: 0.71,
    peers: ["berlin-1", "paris-1", "stockholm-1", "dubai-1", "new-york-1"]
  },
  {
    id: "paris-1",
    label: "Paris",
    lat: 48.8566,
    lng: 2.3522,
    region: "Europe",
    status: "live",
    intensity: 0.58,
    peers: ["london-1", "frankfurt-1", "berlin-1"]
  },
  {
    id: "stockholm-1",
    label: "Stockholm",
    lat: 59.3293,
    lng: 18.0686,
    region: "Europe",
    status: "live",
    intensity: 0.49,
    peers: ["berlin-1", "frankfurt-1"]
  },
  {
    id: "new-york-1",
    label: "New York",
    lat: 40.7128,
    lng: -74.006,
    region: "North America",
    status: "live",
    intensity: 0.75,
    peers: ["london-1", "frankfurt-1", "toronto-1", "chicago-1"]
  },
  {
    id: "toronto-1",
    label: "Toronto",
    lat: 43.6532,
    lng: -79.3832,
    region: "North America",
    status: "live",
    intensity: 0.53,
    peers: ["new-york-1", "chicago-1"]
  },
  {
    id: "chicago-1",
    label: "Chicago",
    lat: 41.8781,
    lng: -87.6298,
    region: "North America",
    status: "live",
    intensity: 0.46,
    peers: ["new-york-1", "toronto-1", "san-francisco-1", "austin-1"]
  },
  {
    id: "san-francisco-1",
    label: "San Francisco",
    lat: 37.7749,
    lng: -122.4194,
    region: "North America",
    status: "live",
    intensity: 0.7,
    peers: ["chicago-1", "seattle-1", "tokyo-1"]
  },
  {
    id: "seattle-1",
    label: "Seattle",
    lat: 47.6062,
    lng: -122.3321,
    region: "North America",
    status: "live",
    intensity: 0.4,
    peers: ["san-francisco-1", "tokyo-1"]
  },
  {
    id: "austin-1",
    label: "Austin",
    lat: 30.2672,
    lng: -97.7431,
    region: "North America",
    status: "live",
    intensity: 0.37,
    peers: ["chicago-1", "mexico-city-1"]
  },
  {
    id: "mexico-city-1",
    label: "Mexico City",
    lat: 19.4326,
    lng: -99.1332,
    region: "North America",
    status: "live",
    intensity: 0.34,
    peers: ["austin-1", "sao-paulo-1"]
  },
  {
    id: "sao-paulo-1",
    label: "Sao Paulo",
    lat: -23.5505,
    lng: -46.6333,
    region: "South America",
    status: "live",
    intensity: 0.39,
    peers: ["mexico-city-1", "cape-town-1"]
  },
  {
    id: "cape-town-1",
    label: "Cape Town",
    lat: -33.9249,
    lng: 18.4241,
    region: "Africa",
    status: "live",
    intensity: 0.33,
    peers: ["sao-paulo-1", "dubai-1"]
  },
  {
    id: "dubai-1",
    label: "Dubai",
    lat: 25.2048,
    lng: 55.2708,
    region: "Middle East",
    status: "live",
    intensity: 0.51,
    peers: ["frankfurt-1", "cape-town-1", "mumbai-1", "singapore-1"]
  },
  {
    id: "mumbai-1",
    label: "Mumbai",
    lat: 19.076,
    lng: 72.8777,
    region: "Asia",
    status: "live",
    intensity: 0.47,
    peers: ["dubai-1", "singapore-1"]
  },
  {
    id: "singapore-1",
    label: "Singapore",
    lat: 1.3521,
    lng: 103.8198,
    region: "Asia Pacific",
    status: "live",
    intensity: 0.57,
    peers: ["dubai-1", "mumbai-1", "hong-kong-1", "sydney-1"]
  },
  {
    id: "hong-kong-1",
    label: "Hong Kong",
    lat: 22.3193,
    lng: 114.1694,
    region: "Asia",
    status: "live",
    intensity: 0.61,
    peers: ["singapore-1", "tokyo-1"]
  },
  {
    id: "tokyo-1",
    label: "Tokyo",
    lat: 35.6762,
    lng: 139.6503,
    region: "Asia Pacific",
    status: "live",
    intensity: 0.8,
    peers: ["san-francisco-1", "seattle-1", "hong-kong-1", "sydney-1"]
  },
  {
    id: "sydney-1",
    label: "Sydney",
    lat: -33.8688,
    lng: 151.2093,
    region: "Oceania",
    status: "live",
    intensity: 0.43,
    peers: ["singapore-1", "tokyo-1"]
  }
];

export const mockChannels: EchoChannel[] = [
  {
    id: "berlin-london",
    sourceNodeId: "berlin-1",
    targetNodeId: "london-1",
    strength: 0.82,
    lastActiveAt: "2026-03-19T08:00:00.000Z"
  },
  {
    id: "berlin-frankfurt",
    sourceNodeId: "berlin-1",
    targetNodeId: "frankfurt-1",
    strength: 0.88,
    lastActiveAt: "2026-03-19T08:01:00.000Z"
  },
  {
    id: "berlin-stockholm",
    sourceNodeId: "berlin-1",
    targetNodeId: "stockholm-1",
    strength: 0.59,
    lastActiveAt: "2026-03-19T08:02:00.000Z"
  },
  {
    id: "paris-london",
    sourceNodeId: "paris-1",
    targetNodeId: "london-1",
    strength: 0.54,
    lastActiveAt: "2026-03-19T08:03:00.000Z"
  },
  {
    id: "paris-frankfurt",
    sourceNodeId: "paris-1",
    targetNodeId: "frankfurt-1",
    strength: 0.52,
    lastActiveAt: "2026-03-19T08:04:00.000Z"
  },
  {
    id: "paris-berlin",
    sourceNodeId: "paris-1",
    targetNodeId: "berlin-1",
    strength: 0.57,
    lastActiveAt: "2026-03-19T08:05:00.000Z"
  },
  {
    id: "stockholm-frankfurt",
    sourceNodeId: "stockholm-1",
    targetNodeId: "frankfurt-1",
    strength: 0.49,
    lastActiveAt: "2026-03-19T08:06:00.000Z"
  },
  {
    id: "london-new-york",
    sourceNodeId: "london-1",
    targetNodeId: "new-york-1",
    strength: 0.87,
    lastActiveAt: "2026-03-19T08:07:00.000Z"
  },
  {
    id: "frankfurt-dubai",
    sourceNodeId: "frankfurt-1",
    targetNodeId: "dubai-1",
    strength: 0.68,
    lastActiveAt: "2026-03-19T08:10:00.000Z"
  },
  {
    id: "frankfurt-new-york",
    sourceNodeId: "frankfurt-1",
    targetNodeId: "new-york-1",
    strength: 0.78,
    lastActiveAt: "2026-03-19T08:11:00.000Z"
  },
  {
    id: "new-york-toronto",
    sourceNodeId: "new-york-1",
    targetNodeId: "toronto-1",
    strength: 0.64,
    lastActiveAt: "2026-03-19T08:12:00.000Z"
  },
  {
    id: "new-york-chicago",
    sourceNodeId: "new-york-1",
    targetNodeId: "chicago-1",
    strength: 0.72,
    lastActiveAt: "2026-03-19T08:13:00.000Z"
  },
  {
    id: "toronto-chicago",
    sourceNodeId: "toronto-1",
    targetNodeId: "chicago-1",
    strength: 0.47,
    lastActiveAt: "2026-03-19T08:14:00.000Z"
  },
  {
    id: "chicago-san-francisco",
    sourceNodeId: "chicago-1",
    targetNodeId: "san-francisco-1",
    strength: 0.74,
    lastActiveAt: "2026-03-19T08:15:00.000Z"
  },
  {
    id: "chicago-austin",
    sourceNodeId: "chicago-1",
    targetNodeId: "austin-1",
    strength: 0.48,
    lastActiveAt: "2026-03-19T08:16:00.000Z"
  },
  {
    id: "san-francisco-seattle",
    sourceNodeId: "san-francisco-1",
    targetNodeId: "seattle-1",
    strength: 0.63,
    lastActiveAt: "2026-03-19T08:17:00.000Z"
  },
  {
    id: "san-francisco-tokyo",
    sourceNodeId: "san-francisco-1",
    targetNodeId: "tokyo-1",
    strength: 0.84,
    lastActiveAt: "2026-03-19T08:18:00.000Z"
  },
  {
    id: "seattle-tokyo",
    sourceNodeId: "seattle-1",
    targetNodeId: "tokyo-1",
    strength: 0.66,
    lastActiveAt: "2026-03-19T08:20:00.000Z"
  },
  {
    id: "austin-mexico-city",
    sourceNodeId: "austin-1",
    targetNodeId: "mexico-city-1",
    strength: 0.43,
    lastActiveAt: "2026-03-19T08:21:00.000Z"
  },
  {
    id: "mexico-city-sao-paulo",
    sourceNodeId: "mexico-city-1",
    targetNodeId: "sao-paulo-1",
    strength: 0.55,
    lastActiveAt: "2026-03-19T08:22:00.000Z"
  },
  {
    id: "sao-paulo-cape-town",
    sourceNodeId: "sao-paulo-1",
    targetNodeId: "cape-town-1",
    strength: 0.46,
    lastActiveAt: "2026-03-19T08:23:00.000Z"
  },
  {
    id: "cape-town-dubai",
    sourceNodeId: "cape-town-1",
    targetNodeId: "dubai-1",
    strength: 0.44,
    lastActiveAt: "2026-03-19T08:24:00.000Z"
  },
  {
    id: "dubai-mumbai",
    sourceNodeId: "dubai-1",
    targetNodeId: "mumbai-1",
    strength: 0.61,
    lastActiveAt: "2026-03-19T08:25:00.000Z"
  },
  {
    id: "dubai-singapore",
    sourceNodeId: "dubai-1",
    targetNodeId: "singapore-1",
    strength: 0.67,
    lastActiveAt: "2026-03-19T08:26:00.000Z"
  },
  {
    id: "mumbai-singapore",
    sourceNodeId: "mumbai-1",
    targetNodeId: "singapore-1",
    strength: 0.59,
    lastActiveAt: "2026-03-19T08:27:00.000Z"
  },
  {
    id: "singapore-hong-kong",
    sourceNodeId: "singapore-1",
    targetNodeId: "hong-kong-1",
    strength: 0.71,
    lastActiveAt: "2026-03-19T08:28:00.000Z"
  },
  {
    id: "singapore-sydney",
    sourceNodeId: "singapore-1",
    targetNodeId: "sydney-1",
    strength: 0.62,
    lastActiveAt: "2026-03-19T08:29:00.000Z"
  },
  {
    id: "hong-kong-tokyo",
    sourceNodeId: "hong-kong-1",
    targetNodeId: "tokyo-1",
    strength: 0.73,
    lastActiveAt: "2026-03-19T08:30:00.000Z"
  },
  {
    id: "tokyo-sydney",
    sourceNodeId: "tokyo-1",
    targetNodeId: "sydney-1",
    strength: 0.57,
    lastActiveAt: "2026-03-19T08:31:00.000Z"
  }
];
