import { useEffect, useRef } from "react";
import { useAppStore } from "../state/app-store";
import type { SceneId } from "@echo/contracts";

type SceneRouteState = {
  scene: SceneId;
  nodeId: string | null;
};

function parseLocationPath(): SceneRouteState {
  const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";

  if (normalizedPath === "/") {
    return {
      scene: "map",
      nodeId: null,
    };
  }

  const nodeMatch = normalizedPath.match(/^\/node\/([^/]+)$/);
  if (nodeMatch) {
    const nodeId = decodeURIComponent(nodeMatch[1] || "").trim();

    return {
      scene: "node",
      nodeId: nodeId || null,
    };
  }

  return {
    scene: "map",
    nodeId: null,
  };
}

function replacePath(path: string) {
  if (window.location.pathname !== path || window.location.search || window.location.hash) {
    history.replaceState(null, "", path);
  }
}

export function useSceneRouting() {
  const activeScene = useAppStore((state) => state.activeScene);
  const invalidNodeRouteId = useAppStore((state) => state.invalidNodeRouteId);
  const selectedNodeId = useAppStore((state) => state.selectedNodeId);
  const nodes = useAppStore((state) => state.nodes);
  const setScene = useAppStore((state) => state.setScene);
  const setInvalidNodeRouteId = useAppStore((state) => state.setInvalidNodeRouteId);
  const selectNode = useAppStore((state) => state.selectNode);
  const pendingRouteNodeIdRef = useRef<string | null>(null);
  const hasHydratedFromLocationRef = useRef(false);

  useEffect(() => {
    const clearRoutePendingState = () => {
      pendingRouteNodeIdRef.current = null;
      setInvalidNodeRouteId(null);
    };

    const applyLocationState = () => {
      const locationState = parseLocationPath();
      setScene(locationState.scene);
      hasHydratedFromLocationRef.current = true;

      if (locationState.scene !== "node") {
        clearRoutePendingState();
        return;
      }

      if (!locationState.nodeId) {
        clearRoutePendingState();
        return;
      }

      const matchedNode = nodes.find((node) => node.id === locationState.nodeId);
      if (matchedNode) {
        clearRoutePendingState();
        selectNode(matchedNode.id);
        return;
      }

      if (nodes.length > 0) {
        pendingRouteNodeIdRef.current = null;
        setInvalidNodeRouteId(locationState.nodeId);
        setScene("map");
        return;
      }

      pendingRouteNodeIdRef.current = locationState.nodeId;
    };

    applyLocationState();

    const onPopState = () => applyLocationState();
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [nodes, selectNode, setInvalidNodeRouteId, setScene]);

  useEffect(() => {
    if (!pendingRouteNodeIdRef.current || nodes.length === 0) {
      return;
    }

    const matchedNode = nodes.find((node) => node.id === pendingRouteNodeIdRef.current);
    if (!matchedNode) {
      return;
    }

    pendingRouteNodeIdRef.current = null;
    setInvalidNodeRouteId(null);
    selectNode(matchedNode.id);
  }, [nodes, selectNode, setInvalidNodeRouteId]);

  useEffect(() => {
    if (!hasHydratedFromLocationRef.current) {
      return;
    }

    if (pendingRouteNodeIdRef.current) {
      return;
    }

    if (invalidNodeRouteId) {
      replacePath(`/node/${encodeURIComponent(invalidNodeRouteId)}`);
      return;
    }

    if (activeScene === "node") {
      if (!selectedNodeId) {
        return;
      }

      const nextPath = `/node/${encodeURIComponent(selectedNodeId)}`;
      replacePath(nextPath);
      return;
    }

    replacePath("/");
  }, [activeScene, invalidNodeRouteId, selectedNodeId]);
}
