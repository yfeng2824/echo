import { useEffect, useRef, useState } from "react";
import type {
  AudioDensity,
  DegreeHint,
  EchoEvent,
  EchoNode,
  HeadlineCounts,
  NetworkSimulation,
  RegisterBand,
  SceneBootstrap
} from "@echo/contracts";
import { createAudioEngine } from "../engine/audio/audio-engine";
import { createApiNetworkSimulation, fetchSceneBootstrap } from "../lib/api-client";
import { buildRegisterBandMap } from "../lib/network";
import { pickNodeViewPhraseDelay, planNodeViewPhrase } from "../lib/node-view-audio";
import { resolvePentatonicDegree, type ScaleDegreeKey } from "../lib/pentatonic";
import { useSceneRouting } from "../scenes/use-scene-routing";
import { useAppStore } from "../state/app-store";
import type { NetworkStatus } from "../state/app-store";
import { AppShell } from "./app-shell";

type AppStoreState = ReturnType<typeof useAppStore.getState>;

type DelayRange = {
  min: number;
  max: number;
};

type BootstrapLoadResult = {
  bootstrap: SceneBootstrap;
  simulation: NetworkSimulation;
  status: {
    state: NetworkStatus;
    error?: string | null;
  };
};

const AMBIENT_DEGREES: Record<number, ScaleDegreeKey[]> = {
  1: ["root"],
  2: ["root", "fifth"],
  3: ["root", "fifth", "sixth"],
  4: ["root", "second", "fifth", "sixth"]
};

const NETWORK_TRANSIENT_SETTLE_MS = 1800;
const NODE_VIEW_PHRASE_SETTLE_MS = 2400;
const STARTUP_AUDIO_MUTE_MS = 1000;

const AMBIENT_DELAY_BY_DENSITY: Record<AudioDensity, DelayRange> = {
  sparse: { min: 900, max: 1500 },
  balanced: { min: 700, max: 1200 },
  rich: { min: 450, max: 900 }
};

const EMPTY_HEADLINE_COUNTS: HeadlineCounts = {
  activeNodeCount: 0,
  channelCount: 0
};

const EMPTY_BOOTSTRAP: SceneBootstrap = {
  nodes: [],
  channels: [],
  recentEvents: [],
  headlineCounts: EMPTY_HEADLINE_COUNTS
};

const SILENT_SIMULATION: NetworkSimulation = {
  start() {},
  stop() {}
};

function getBatchRole(index: number, voiceCount: number): EchoEvent["batchRole"] {
  if (index === 0) {
    return "lead";
  }

  if (index === voiceCount - 1) {
    return "tail";
  }

  return "support";
}

function resolvePitchForBand(
  registerBand: RegisterBand,
  root: AppStoreState["audioSettings"]["root"],
  degree: ScaleDegreeKey
): DegreeHint {
  return resolvePentatonicDegree(root, registerBand, degree);
}

function pickDelay(range: DelayRange) {
  return range.min + Math.random() * (range.max - range.min);
}

function shuffleNodes(nodes: EchoNode[]) {
  return [...nodes].sort(() => Math.random() - 0.5);
}

function chooseAmbientBatchSize(density: AudioDensity) {
  const roll = Math.random();

  if (density === "rich") {
    return roll < 0.2 ? 1 : roll < 0.6 ? 2 : 3;
  }

  if (density === "balanced") {
    return roll < 0.35 ? 1 : roll < 0.8 ? 2 : 3;
  }

  return roll < 0.65 ? 1 : roll < 0.92 ? 2 : 3;
}

async function loadBootstrap(currentNetwork: AppStoreState["currentNetwork"]): Promise<BootstrapLoadResult> {
  try {
    const bootstrap = await fetchSceneBootstrap(currentNetwork);

    return {
      bootstrap,
      simulation: createApiNetworkSimulation(currentNetwork, bootstrap.recentEvents),
      status: { state: "ready" }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network bootstrap failed";

    return {
      bootstrap: EMPTY_BOOTSTRAP,
      simulation: SILENT_SIMULATION,
      status: { state: "unavailable", error: message }
    };
  }
}

function getSelectedNode(state: Pick<AppStoreState, "nodes" | "selectedNodeId">) {
  return state.nodes.find((node) => node.id === state.selectedNodeId) ?? null;
}

function enrichIncomingEvent(
  event: EchoEvent,
  state: Pick<AppStoreState, "activeScene" | "mapSearchTransition" | "nodes" | "selectedNodeId">
): EchoEvent {
  const registerBandMap = buildRegisterBandMap(state.nodes);

  return {
    ...event,
    at: event.at ?? new Date().toISOString(),
    registerBand: event.registerBand ?? registerBandMap.get(event.nodeId) ?? 1,
    source: event.source ?? "network",
    batchRole: event.batchRole ?? "support"
  };
}

function shouldTriggerEventAudio(
  event: EchoEvent,
  state: Pick<AppStoreState, "activeScene" | "mapSearchTransition" | "nodes" | "selectedNodeId">
) {
  if (state.activeScene === "map") {
    return state.mapSearchTransition === null;
  }

  if (state.activeScene !== "node") {
    return false;
  }

  if (event.type === "path_used") {
    return true;
  }

  const selectedNode = getSelectedNode(state);
  return selectedNode ? event.nodeId === selectedNode.id || selectedNode.peers.includes(event.nodeId) : false;
}

function createAmbientEvent(
  node: EchoNode,
  index: number,
  batchSize: number,
  batchId: string,
  timestamp: string,
  registerBandMap: Map<string, RegisterBand>,
  root: AppStoreState["audioSettings"]["root"]
): EchoEvent {
  const registerBand = registerBandMap.get(node.id) ?? 1;

  return {
    id: `${batchId}-${index}-${node.id}`,
    type: "node_active",
    at: timestamp,
    nodeId: node.id,
    intensity: Math.min(1, 0.35 + node.intensity * 0.65),
    voiceIndex: index,
    voiceCount: batchSize,
    registerBand,
    degreeHint: resolvePitchForBand(registerBand, root, AMBIENT_DEGREES[batchSize]?.[index] ?? "root"),
    batchId,
    batchRole: getBatchRole(index, batchSize),
    source: "ambient"
  };
}

export function App() {
  useSceneRouting();
  const audioRef = useRef<ReturnType<typeof createAudioEngine> | null>(null);
  const previousNetworkRef = useRef<AppStoreState["currentNetwork"] | null>(null);
  const previousTransitionVisibleRef = useRef(false);
  const [ambientTransientHoldUntil, setAmbientTransientHoldUntil] = useState(0);
  const [startupAudioReady, setStartupAudioReady] = useState(false);

  const initialize = useAppStore((state) => state.initialize);
  const appendEvent = useAppStore((state) => state.appendEvent);
  const activeScene = useAppStore((state) => state.activeScene);
  const currentNetwork = useAppStore((state) => state.currentNetwork);
  const mapSearchTransition = useAppStore((state) => state.mapSearchTransition);
  const nodes = useAppStore((state) => state.nodes);
  const selectedNodeId = useAppStore((state) => state.selectedNodeId);
  const audio = useAppStore((state) => state.audio);
  const audioEnabled = useAppStore((state) => state.audioEnabled);
  const audioSettings = useAppStore((state) => state.audioSettings);
  const networkTransitionVisible = useAppStore((state) => state.networkTransitionVisible);
  const setNetworkState = useAppStore((state) => state.setNetworkState);
  const isSearchFocusPhase = activeScene === "map" && mapSearchTransition !== null;

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = createAudioEngine();
    }

    const audioEngine = audioRef.current;
    let cancelled = false;
    let simulation: NetworkSimulation | null = null;

    const handleEvent = (event: EchoEvent) => {
      const state = useAppStore.getState();
      const enrichedEvent = enrichIncomingEvent(event, state);

      appendEvent(enrichedEvent);
      if (shouldTriggerEventAudio(enrichedEvent, state)) {
        audioEngine.trigger(enrichedEvent);
      }
    };

    const bootstrap = async () => {
      setNetworkState("loading");
      const result = await loadBootstrap(currentNetwork);

      if (cancelled) {
        result.simulation.stop();
        return;
      }

      simulation = result.simulation;
      setNetworkState(result.status.state, result.status.error ?? null);
      initialize({
        simulation: result.simulation,
        audio: audioEngine,
        ...result.bootstrap
      });
      result.simulation.start(handleEvent);
    };

    void bootstrap();

    return () => {
      cancelled = true;
      simulation?.stop();
    };
  }, [appendEvent, currentNetwork, initialize, setNetworkState]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setStartupAudioReady(true);
    }, STARTUP_AUDIO_MUTE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!audio) {
      return;
    }

    audio.configure(audioSettings);
    if (!audioEnabled || networkTransitionVisible || !startupAudioReady) {
      audio.disable();
      return;
    }

    audio.enable();
    audio.syncAmbient(isSearchFocusPhase ? "node" : activeScene, nodes);
  }, [
    activeScene,
    audio,
    audioEnabled,
    audioSettings,
    isSearchFocusPhase,
    networkTransitionVisible,
    nodes,
    startupAudioReady
  ]);

  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const previousNetwork = previousNetworkRef.current;
    previousNetworkRef.current = currentNetwork;

    if (!previousNetwork || previousNetwork === currentNetwork || !audioEnabled || !audio) {
      return;
    }

    audio.disable();
  }, [audio, audioEnabled, currentNetwork]);

  useEffect(() => {
    const wasVisible = previousTransitionVisibleRef.current;
    previousTransitionVisibleRef.current = networkTransitionVisible;

    if (networkTransitionVisible || !wasVisible) {
      return;
    }

    setAmbientTransientHoldUntil(Date.now() + NETWORK_TRANSIENT_SETTLE_MS);
  }, [networkTransitionVisible]);

  useEffect(() => {
    if (!mapSearchTransition) {
      return;
    }

    const registerBandMap = buildRegisterBandMap(nodes);
    const foundEvent: EchoEvent = {
      id: `found-${mapSearchTransition.nodeId}-${mapSearchTransition.startedAt}`,
      type: "node_active",
      at: new Date(mapSearchTransition.startedAt).toISOString(),
      nodeId: mapSearchTransition.nodeId,
      intensity: 0.96,
      registerBand: registerBandMap.get(mapSearchTransition.nodeId) ?? 1,
      degreeHint: resolvePitchForBand(registerBandMap.get(mapSearchTransition.nodeId) ?? 1, audioSettings.root, "third"),
      batchRole: "lead",
      source: "network"
    };

    appendEvent(foundEvent);
    if (audioEnabled) {
      audio?.trigger(foundEvent);
    }
  }, [appendEvent, audio, audioEnabled, audioSettings.root, mapSearchTransition, nodes]);

  useEffect(() => {
    if (activeScene !== "map" || isSearchFocusPhase) {
      return;
    }

    const liveNodes = nodes;
    if (liveNodes.length === 0) {
      return;
    }

    const holdRemaining = ambientTransientHoldUntil - Date.now();
    if (holdRemaining > 0) {
      const holdTimeoutId = window.setTimeout(() => {
        setAmbientTransientHoldUntil(0);
      }, holdRemaining);

      return () => {
        window.clearTimeout(holdTimeoutId);
      };
    }

    let timeoutId = 0;
    let nodeQueue: EchoNode[] = [];
    const delayRange = AMBIENT_DELAY_BY_DENSITY[audioSettings.density];
    const registerBandMap = buildRegisterBandMap(nodes);

    const scheduleBatch = () => {
      timeoutId = window.setTimeout(() => {
        const timestamp = new Date().toISOString();
        const batchSize = Math.min(liveNodes.length, chooseAmbientBatchSize(audioSettings.density));
        const batchNodes: EchoNode[] = [];

        while (batchNodes.length < batchSize) {
          if (nodeQueue.length === 0) {
            nodeQueue = shuffleNodes(liveNodes);
          }

          const nextNode = nodeQueue.shift();
          if (nextNode) {
            batchNodes.push(nextNode);
          }
        }

        const batchId = `ambient-${Date.now()}`;

        // Keep the map field distributed by letting a small batch speak together.
        batchNodes.forEach((node, index) => {
          const event = createAmbientEvent(
            node,
            index,
            batchNodes.length,
            batchId,
            timestamp,
            registerBandMap,
            audioSettings.root
          );
          appendEvent(event);
          if (audioEnabled) {
            audio?.trigger(event);
          }
        });

        scheduleBatch();
      }, pickDelay(delayRange));
    };

    scheduleBatch();

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    activeScene,
    ambientTransientHoldUntil,
    appendEvent,
    audio,
    audioEnabled,
    audioSettings.density,
    audioSettings.root,
    isSearchFocusPhase,
    nodes
  ]);

  useEffect(() => {
    if (activeScene !== "node" || !selectedNodeId) {
      return;
    }

    const selectedNode = nodes.find((node) => node.id === selectedNodeId);
    if (!selectedNode) {
      return;
    }

    const registerBandMap = buildRegisterBandMap(nodes);
    let timeoutId = 0;
    let phraseHoldUntil = 0;
    const scheduledStepTimeouts = new Set<number>();

    const clearScheduledSteps = () => {
      scheduledStepTimeouts.forEach((scheduledTimeoutId) => {
        window.clearTimeout(scheduledTimeoutId);
      });
      scheduledStepTimeouts.clear();
    };

    const dispatchPhrase = () => {
      const steps = planNodeViewPhrase({
        nodes,
        selectedNodeId: selectedNode.id,
        root: audioSettings.root,
        registerBandMap,
        phraseId: `resonance-${Date.now()}`
      });

      if (steps.length === 0) {
        return;
      }

      phraseHoldUntil = Date.now() + NODE_VIEW_PHRASE_SETTLE_MS;
      clearScheduledSteps();

      steps.forEach((step) => {
        const scheduledTimeoutId = window.setTimeout(() => {
          scheduledStepTimeouts.delete(scheduledTimeoutId);

          const event = {
            ...step.event,
            at: new Date().toISOString()
          };
          appendEvent(event);
          if (audioEnabled) {
            audio?.trigger(event);
          }
        }, step.delayMs);

        scheduledStepTimeouts.add(scheduledTimeoutId);
      });
    };

    const schedulePhrase = (delayMs = pickNodeViewPhraseDelay(audioSettings.density)) => {
      timeoutId = window.setTimeout(() => {
        const now = Date.now();

        if (now < phraseHoldUntil) {
          schedulePhrase(Math.max(160, phraseHoldUntil - now));
          return;
        }

        dispatchPhrase();

        schedulePhrase();
      }, delayMs);
    };

    schedulePhrase();

    return () => {
      window.clearTimeout(timeoutId);
      clearScheduledSteps();
    };
  }, [activeScene, appendEvent, audio, audioEnabled, audioSettings.density, audioSettings.root, nodes, selectedNodeId]);

  return <AppShell />;
}
