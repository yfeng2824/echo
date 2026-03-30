import { useEffect, useRef } from "react";
import type { EchoEvent } from "@echo/contracts";
import { useAppStore } from "../state/app-store";
import { PixiSurface } from "./pixi/pixi-surface";

function getVisualProfile(event: EchoEvent, scene: "map" | "node") {
  const baseIntensity = Math.max(0.08, Math.min(1, event.intensity));
  const rippleLayer = event.rippleLayer ?? 0;

  if (scene === "map") {
    const duration = event.source === "ambient" ? 1700 : 2000;
    const radius = 34 + baseIntensity * 26;

    return {
      duration,
      radius,
      alpha: 0.14 + baseIntensity * 0.2,
      halo: 0.08 + baseIntensity * 0.12,
    };
  }

  const duration =
    rippleLayer > 0
      ? 900
      : event.source === "resonance"
        ? 2400
        : event.source === "ambient"
          ? 1600
          : 1900;
  const radius =
    rippleLayer > 0
      ? 42 + baseIntensity * 18
      : event.batchRole === "lead"
        ? 190 + baseIntensity * 36
        : 140 + baseIntensity * 28;
  const alpha =
    rippleLayer > 0
      ? 0.11 + baseIntensity * 0.1
      : event.batchRole === "lead"
        ? 0.2 + baseIntensity * 0.16
        : 0.13 + baseIntensity * 0.14;

  return {
    duration,
    radius,
    alpha,
    halo: rippleLayer > 0 ? 0.04 + baseIntensity * 0.06 : 0.06 + baseIntensity * 0.12,
  };
}

export function RenderSurface() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<PixiSurface | null>(null);

  const activeScene = useAppStore((state) => state.activeScene);
  const mapSearchTransition = useAppStore((state) => state.mapSearchTransition);
  const nodeSceneEnteredAt = useAppStore((state) => state.nodeSceneEnteredAt);
  const nodes = useAppStore((state) => state.nodes);
  const channels = useAppStore((state) => state.channels);
  const selectedNodeId = useAppStore((state) => state.selectedNodeId);
  const recentEvents = useAppStore((state) => state.recentEvents);
  const secretCue = useAppStore((state) => state.secretCue);
  const selectNode = useAppStore((state) => state.selectNode);
  const appendEvent = useAppStore((state) => state.appendEvent);
  const audio = useAppStore((state) => state.audio);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    let cancelled = false;
    const surface = new PixiSurface({
      root: mount,
      selectNode,
      appendEvent,
      triggerEvent: (event) => audio?.trigger(event),
      getVisualProfile,
    });
    surfaceRef.current = surface;

    void surface.init().then(() => {
      // Strict Mode mounts twice in dev, so guard the async Pixi setup.
      if (cancelled) {
        surface.destroy();
      }
    });

    return () => {
      cancelled = true;
      surface.destroy();
      if (surfaceRef.current === surface) {
        surfaceRef.current = null;
      }
    };
  }, [appendEvent, audio, selectNode]);

  useEffect(() => {
    surfaceRef.current?.setSnapshot({
      activeScene,
      mapSearchTransition,
      nodeSceneEnteredAt,
      nodes,
      channels,
      selectedNodeId,
      recentEvents,
      secretCue,
    });
  }, [
    activeScene,
    mapSearchTransition,
    nodeSceneEnteredAt,
    nodes,
    channels,
    selectedNodeId,
    recentEvents,
    secretCue,
  ]);

  return <div ref={mountRef} className="render-surface" aria-hidden="true" />;
}
