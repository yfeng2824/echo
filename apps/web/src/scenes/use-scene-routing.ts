import { useEffect } from "react";
import { useAppStore } from "../state/app-store";
import type { SceneId } from "@echo/contracts";

function readSceneFromHash(): SceneId {
  if (window.location.hash === "#node") {
    return "node";
  }

  return "map";
}

export function useSceneRouting() {
  const activeScene = useAppStore((state) => state.activeScene);
  const setScene = useAppStore((state) => state.setScene);

  useEffect(() => {
    setScene(readSceneFromHash());

    const onHashChange = () => {
      setScene(readSceneFromHash());
    };

    window.addEventListener("hashchange", onHashChange);

    return () => {
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [setScene]);

  useEffect(() => {
    if (activeScene === "node") {
      if (window.location.hash !== "#node") {
        window.location.hash = "#node";
      }
      return;
    }

    if (window.location.hash !== "#map") {
      window.location.hash = "#map";
    }
  }, [activeScene]);
}
