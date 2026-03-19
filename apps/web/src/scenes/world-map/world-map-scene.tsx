import { useMemo } from "react";
import { useAppStore } from "../../state/app-store";
import "../../scenes/scenes.css";

export function WorldMapScene() {
  const nodes = useAppStore((state) => state.nodes);
  const recentEvents = useAppStore((state) => state.recentEvents);
  const selectNode = useAppStore((state) => state.selectNode);

  const summary = useMemo(() => {
    const liveCount = nodes.filter((node) => node.status === "live").length;

    return {
      total: nodes.length,
      live: liveCount
    };
  }, [nodes]);

  return (
    <section className="scene">
      <div className="scene__panel">
        <p className="scene__eyebrow">World map</p>
        <h1 className="scene__title">Global node presence</h1>
        <p className="scene__description">
          Placeholder scene for the V1 world map. This will become the Pixi-powered
          map with projected node positions, ambient motion, and live activity
          pulses.
        </p>

        <div className="scene__grid scene__grid--two">
          <div className="scene__card">
            <span className="scene__label">Network snapshot</span>
            <div>{summary.total} nodes loaded</div>
            <div>{summary.live} nodes marked live</div>
            <div className="scene__meta">TODO: replace with projected map canvas.</div>
          </div>
          <div className="scene__card">
            <span className="scene__label">Interaction</span>
            <div>Click a node to enter the resonance view.</div>
            <div className="scene__meta">
              TODO: add hover, camera focus, and animated scene transition.
            </div>
          </div>
        </div>

        <div className="scene__card" style={{ marginTop: "1rem" }}>
          <span className="scene__label">Recent mock activity</span>
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

        <div className="scene__node-list">
          {nodes.map((node) => (
            <button
              key={node.id}
              className="scene__node-button"
              type="button"
              onClick={() => selectNode(node.id)}
            >
              <span>
                <div>{node.label}</div>
                <div className="scene__meta">
                  {node.region} · {node.lat.toFixed(1)}, {node.lng.toFixed(1)}
                </div>
              </span>
              <span className="scene__dot" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
