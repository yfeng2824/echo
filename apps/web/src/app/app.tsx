import { useEffect } from "react";
import { AppShell } from "./app-shell";
import { useSceneRouting } from "../scenes/use-scene-routing";
import { useAppStore } from "../state/app-store";
import { createAudioEngine } from "../engine/audio/audio-engine";
import { createNetworkSimulation } from "../engine/simulation/network-simulation";
import { mockChannels, mockNodes } from "../data/mock/network";
import { mockEvents } from "../data/mock/events";
import type { DegreeHint, EchoEvent, EchoNode, RegisterBand } from "@echo/contracts";

const AMBIENT_DEGREES: Record<number, DegreeHint[]> = {
  1: ["gong"],
  2: ["gong", "zhi"],
  3: ["gong", "zhi", "yu"],
  4: ["gong", "shang", "zhi", "yu"]
};

const RESONANCE_PEER_DEGREES: DegreeHint[] = ["shang", "jue", "yu"];

function buildRegisterBandMap(nodes: EchoNode[]): Map<string, RegisterBand> {
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

export function App() {
  useSceneRouting();

  const initialize = useAppStore((state) => state.initialize);
  const appendEvent = useAppStore((state) => state.appendEvent);
  const activeScene = useAppStore((state) => state.activeScene);
  const nodes = useAppStore((state) => state.nodes);
  const selectedNodeId = useAppStore((state) => state.selectedNodeId);
  const audio = useAppStore((state) => state.audio);
  const audioEnabled = useAppStore((state) => state.audioEnabled);
  const audioSettings = useAppStore((state) => state.audioSettings);

  useEffect(() => {
    const simulation = createNetworkSimulation({
      nodes: mockNodes,
      channels: mockChannels,
      events: mockEvents
    });
    const audio = createAudioEngine();

    initialize({
      simulation,
      audio,
      nodes: mockNodes,
      channels: mockChannels
    });

    simulation.start((event) => {
      const currentState = useAppStore.getState();
      const currentBandMap = buildRegisterBandMap(currentState.nodes);
      const selectedNode = currentState.nodes.find((node) => node.id === currentState.selectedNodeId);
      const canPlayInNodeScene =
        currentState.activeScene === "node" &&
        selectedNode &&
        (event.nodeId === selectedNode.id || selectedNode.peers.includes(event.nodeId));
      const enrichedEvent = {
        ...event,
        at: new Date().toISOString(),
        registerBand: currentBandMap.get(event.nodeId) ?? 1,
        source: "network" as const,
        batchRole: "support" as const
      };

      appendEvent(enrichedEvent);
      if (currentState.activeScene === "map" || canPlayInNodeScene) {
        audio.trigger(enrichedEvent);
      }
    });

    return () => {
      simulation.stop();
      audio.dispose();
    };
  }, [appendEvent, initialize]);

  useEffect(() => {
    audio?.configure(audioSettings);
  }, [audio, audioSettings]);

  useEffect(() => {
    if (!audioEnabled) {
      return;
    }

    audio?.syncAmbient(activeScene, nodes);
  }, [activeScene, audio, audioEnabled, audioSettings, nodes]);

  useEffect(() => {
    if (!audioEnabled || activeScene !== "map" || !audio) {
      return;
    }

    const liveNodes = nodes.filter((node) => node.status === "live");
    if (liveNodes.length === 0) {
      return;
    }

    let timeoutId = 0;
    let nodeQueue: typeof liveNodes = [];
    const registerBandMap = buildRegisterBandMap(nodes);

    const densityProfile =
      audioSettings.density === "rich"
        ? { minDelay: 450, maxDelay: 900 }
        : audioSettings.density === "balanced"
          ? { minDelay: 700, maxDelay: 1200 }
          : { minDelay: 900, maxDelay: 1500 };

    const chooseBatchSize = () => {
      const roll = Math.random();

      if (audioSettings.density === "rich") {
        return roll < 0.2 ? 1 : roll < 0.6 ? 2 : 3;
      }

      if (audioSettings.density === "balanced") {
        return roll < 0.35 ? 1 : roll < 0.8 ? 2 : 3;
      }

      return roll < 0.65 ? 1 : roll < 0.92 ? 2 : 3;
    };

    const refillQueue = () => {
      nodeQueue = [...liveNodes].sort(() => Math.random() - 0.5);
    };

    const scheduleBatch = () => {
      const delay =
        densityProfile.minDelay +
        Math.random() * (densityProfile.maxDelay - densityProfile.minDelay);
      timeoutId = window.setTimeout(() => {
        const timestamp = new Date().toISOString();
        const triggerCount = Math.min(liveNodes.length, chooseBatchSize());
        const batchNodes = [];

        while (batchNodes.length < triggerCount) {
          if (nodeQueue.length === 0) {
            refillQueue();
          }

          const nextNode = nodeQueue.shift();
          if (nextNode) {
            batchNodes.push(nextNode);
          }
        }

        const batchId = `ambient-${Date.now()}`;

        batchNodes.forEach((node, index) => {
          const event: EchoEvent = {
            id: `${batchId}-${index}-${node.id}`,
            type: "node_active",
            at: timestamp,
            nodeId: node.id,
            intensity: Math.min(1, 0.35 + node.intensity * 0.65),
            voiceIndex: index,
            voiceCount: batchNodes.length,
            registerBand: registerBandMap.get(node.id) ?? 1,
            degreeHint: AMBIENT_DEGREES[batchNodes.length]?.[index],
            batchId,
            batchRole: index === 0 ? "lead" : index === batchNodes.length - 1 ? "tail" : "support",
            source: "ambient"
          };

          appendEvent(event);
          audio.trigger(event);
        });

        scheduleBatch();
      }, delay);
    };

    scheduleBatch();

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeScene, appendEvent, audio, audioEnabled, audioSettings.density, nodes]);

  useEffect(() => {
    if (!audioEnabled || activeScene !== "node" || !audio || !selectedNodeId) {
      return;
    }

    const selectedNode = nodes.find((node) => node.id === selectedNodeId);
    if (!selectedNode) {
      return;
    }

    const peerNodes = nodes.filter((node) => selectedNode.peers.includes(node.id));
    const registerBandMap = buildRegisterBandMap(nodes);
    let timeoutIds: number[] = [];

    const schedulePhrase = () => {
      const phraseDelay =
        audioSettings.density === "rich"
          ? 1500 + Math.random() * 900
          : audioSettings.density === "balanced"
            ? 1900 + Math.random() * 1100
            : 2300 + Math.random() * 1400;

        const phraseTimer = window.setTimeout(() => {
          const timestamp = new Date().toISOString();
          const batchId = `resonance-${Date.now()}`;
        const anchorDegree: DegreeHint = Math.random() > 0.55 ? "gong" : "zhi";
        const anchorEvent: EchoEvent = {
          id: `${batchId}-anchor-${selectedNode.id}`,
          type: "node_active",
          at: timestamp,
          nodeId: selectedNode.id,
          intensity: Math.min(1, 0.55 + selectedNode.intensity * 0.6),
          voiceIndex: 0,
          voiceCount: 1,
          registerBand: registerBandMap.get(selectedNode.id) ?? 1,
          degreeHint: anchorDegree,
          batchId,
          batchRole: "lead",
          source: "resonance"
        };

        appendEvent(anchorEvent);
        audio.trigger(anchorEvent);

        const maxPeerVoices =
          audioSettings.density === "rich" ? 3 : audioSettings.density === "balanced" ? 2 : 1;
        const shuffledPeers = [...peerNodes].sort(() => Math.random() - 0.5).slice(0, maxPeerVoices);

        shuffledPeers.forEach((peerNode, index) => {
          const responseTimer = window.setTimeout(() => {
            const peerEvent: EchoEvent = {
              id: `${batchId}-peer-${index}-${peerNode.id}`,
              type: "node_active",
              at: new Date().toISOString(),
              nodeId: peerNode.id,
              intensity: Math.min(0.92, 0.3 + peerNode.intensity * 0.5),
              voiceIndex: index + 1,
              voiceCount: shuffledPeers.length + 1,
              registerBand: registerBandMap.get(peerNode.id) ?? 1,
              degreeHint: RESONANCE_PEER_DEGREES[index % RESONANCE_PEER_DEGREES.length],
              batchId,
              batchRole: index === shuffledPeers.length - 1 ? "tail" : "support",
              source: "resonance"
            };

            appendEvent(peerEvent);
            audio.trigger(peerEvent);
          }, 120 + index * 80 + Math.random() * 80);

          timeoutIds.push(responseTimer);
        });

        schedulePhrase();
      }, phraseDelay);

      timeoutIds.push(phraseTimer);
    };

    schedulePhrase();

    return () => {
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeoutIds = [];
    };
  }, [activeScene, appendEvent, audio, audioEnabled, audioSettings.density, nodes, selectedNodeId]);

  return <AppShell />;
}
