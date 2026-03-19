import { useMemo } from "react";
import { useAppStore } from "../../state/app-store";
import "../../scenes/scenes.css";
import { NodeInfoCard } from "../../ui/node-info-card";
import { getDisplayNodeId } from "../../lib/node-id";

export function NodeResonanceScene() {
  const selectedNodeId = useAppStore((state) => state.selectedNodeId);
  const nodes = useAppStore((state) => state.nodes);
  const recentEvents = useAppStore((state) => state.recentEvents);
  const goToMap = useAppStore((state) => state.goToMap);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? nodes[0],
    [nodes, selectedNodeId]
  );

  return (
    <section className="scene scene--full">
      <div className="scene__overlay scene__overlay--top-right">
        <NodeInfoCard node={selectedNode ?? null} visible={Boolean(selectedNode)} />

        <div className="scene__action-controls">
          <button className="chrome-button" type="button" onClick={goToMap}>
            Return to map
          </button>
        </div>
      </div>

      <div className="scene__hint scene__hint--dim">
        {recentEvents.length === 0
          ? "Waiting for resonance events"
          : `Recent event: ${recentEvents[0].type} · ${getDisplayNodeId(recentEvents[0].nodeId)}`}
      </div>
    </section>
  );
}
