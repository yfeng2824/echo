import { useEffect } from "react";
import { AppShell } from "./app-shell";
import { useSceneRouting } from "../scenes/use-scene-routing";
import { useAppStore } from "../state/app-store";
import { createAudioEngine } from "../engine/audio/audio-engine";
import { createNetworkSimulation } from "../engine/simulation/network-simulation";
import { mockChannels, mockNodes } from "../data/mock/network";
import { mockEvents } from "../data/mock/events";

export function App() {
  useSceneRouting();

  const initialize = useAppStore((state) => state.initialize);
  const appendEvent = useAppStore((state) => state.appendEvent);

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
      appendEvent(event);
      audio.trigger(event);
    });

    return () => {
      simulation.stop();
      audio.dispose();
    };
  }, [appendEvent, initialize]);

  return <AppShell />;
}
