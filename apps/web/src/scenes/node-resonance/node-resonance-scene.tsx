import { useMemo } from "react";
import { useAppStore } from "../../state/app-store";
import "../../scenes/scenes.css";
import { NodeInfoCard } from "../../ui/node-info-card";

export function NodeResonanceScene() {
  const selectedNodeId = useAppStore((state) => state.selectedNodeId);
  const nodes = useAppStore((state) => state.nodes);
  const channels = useAppStore((state) => state.channels);
  const recentEvents = useAppStore((state) => state.recentEvents);
  const goToMap = useAppStore((state) => state.goToMap);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? nodes[0],
    [nodes, selectedNodeId]
  );

  const connectedChannels = useMemo(() => {
    if (!selectedNode) {
      return [];
    }

    return channels.filter(
      (channel) =>
        channel.sourceNodeId === selectedNode.id || channel.targetNodeId === selectedNode.id
    );
  }, [channels, selectedNode]);

  const statusLabel = selectedNode?.status === "live" ? "Live" : "Quiet";

  return (
    <section className="scene scene--full">
      <div className="scene__overlay scene__overlay--top-right">
        <NodeInfoCard node={selectedNode ?? null} visible={Boolean(selectedNode)} />

        <div className="scene__card">
          <div className="scene__card-row">
            <span className="scene__card-label">Peers</span>
            <span className="scene__card-value">{connectedChannels.length}</span>
          </div>
          <div className="scene__card-row">
            <span className="scene__card-label">State</span>
            <span className="scene__card-value">● {statusLabel}</span>
          </div>
          <div className="scene__card-note">
            TODO: replace with live local resonance metrics and connected activity.
          </div>
        </div>

        <div className="scene__action-controls">
          <button className="chrome-button" type="button" onClick={goToMap}>
            Return to map
          </button>
        </div>
      </div>

      <div className="scene__hint scene__hint--dim">
        {recentEvents.length === 0
          ? "Waiting for resonance events"
          : `Recent event: ${recentEvents[0].type} · ${recentEvents[0].nodeId}`}
      </div>
    </section>
  );
}
