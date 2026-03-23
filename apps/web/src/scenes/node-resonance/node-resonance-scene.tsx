import { useAppStore } from "../../state/app-store";
import "../../scenes/scenes.css";
import { NodeInfoCard } from "../../ui/node-info-card";

export function NodeResonanceScene() {
  const selectedNodeId = useAppStore((state) => state.selectedNodeId);
  const nodes = useAppStore((state) => state.nodes);
  const goToMap = useAppStore((state) => state.goToMap);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];

  return (
    <section className="scene scene--full">
      <div className="scene__overlay scene__overlay--top-right scene__overlay--node-card">
        <NodeInfoCard node={selectedNode ?? null} visible={Boolean(selectedNode)} />

        <div className="scene__action-controls">
          <button className="chrome-button" type="button" onClick={goToMap}>
            Return to map
          </button>
        </div>
      </div>
    </section>
  );
}
