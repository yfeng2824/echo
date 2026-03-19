import { useMemo } from "react";
import { useAppStore } from "../../state/app-store";
import "../../scenes/scenes.css";

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

  return (
    <section className="scene">
      <div className="scene__panel">
        <p className="scene__eyebrow">Node resonance</p>
        <h1 className="scene__title">{selectedNode?.label ?? "No node selected"}</h1>
        <p className="scene__description">
          Placeholder scene for the resonance canvas. This will become the focused
          network view where connected nodes pulse and respond together with synced
          sonic cues.
        </p>

        <div className="scene__grid scene__grid--two">
          <div className="scene__card">
            <span className="scene__label">Selected node</span>
            <div>{selectedNode?.region ?? "Unknown region"}</div>
            <div className="scene__meta">
              TODO: add node halo, focus framing, and input-driven transitions.
            </div>
          </div>
          <div className="scene__card">
            <span className="scene__label">Connected channels</span>
            <div>{connectedChannels.length} channels linked</div>
            <div className="scene__meta">
              TODO: render animated paths and propagate resonance events.
            </div>
          </div>
        </div>

        <div className="scene__card" style={{ marginTop: "1rem" }}>
          <span className="scene__label">Canvas placeholder</span>
          <div>
            Selected node activity and neighboring response will render here once the
            Pixi scene graph is added.
          </div>
        </div>

        <div className="scene__card" style={{ marginTop: "1rem" }}>
          <span className="scene__label">Recent resonance events</span>
          {recentEvents.length === 0 ? (
            <div className="scene__meta">Waiting for simulation events.</div>
          ) : (
            recentEvents.map((event) => (
              <div key={event.id} className="scene__meta">
                {event.type} · {event.nodeId} · intensity {event.intensity.toFixed(2)}
              </div>
            ))
          )}
        </div>

        <div className="scene__actions">
          <button className="scene__button" type="button" onClick={goToMap}>
            Back to map
          </button>
        </div>
      </div>
    </section>
  );
}
