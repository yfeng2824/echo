import { useMemo } from "react";
import { WorldMapScene } from "./world-map/world-map-scene";
import { NodeResonanceScene } from "./node-resonance/node-resonance-scene";
import { useAppStore } from "../state/app-store";

export function SceneRouter() {
  const activeScene = useAppStore((state) => state.activeScene);

  const scene = useMemo(() => {
    if (activeScene === "node") {
      return <NodeResonanceScene />;
    }

    return <WorldMapScene />;
  }, [activeScene]);

  return <main>{scene}</main>;
}

