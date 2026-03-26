import { lazy, Suspense, useMemo } from "react";
import { useAppStore } from "../state/app-store";
import { WorldMapScene } from "./world-map/world-map-scene";

const NodeResonanceScene = lazy(async () => {
  const module = await import("./node-resonance/node-resonance-scene");
  return { default: module.NodeResonanceScene };
});

export function SceneRouter() {
  const activeScene = useAppStore((state) => state.activeScene);

  const scene = useMemo(() => {
    if (activeScene === "node") {
      return (
        <Suspense fallback={<section className="scene scene--full" />}>
          <NodeResonanceScene />
        </Suspense>
      );
    }

    return <WorldMapScene />;
  }, [activeScene]);

  return <main>{scene}</main>;
}
