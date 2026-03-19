import type { EchoNode } from "@echo/contracts";

type NodeInfoCardProps = {
  node: EchoNode | null;
  visible: boolean;
};

export function NodeInfoCard({ node, visible }: NodeInfoCardProps) {
  if (!visible || !node) {
    return null;
  }

  const statusLabel = node.status === "live" ? "Live" : "Quiet";

  return (
    <div className="scene__card">
      <div className="scene__card-row">
        <span className="scene__card-label">ID</span>
        <span className="scene__card-value">{node.id}</span>
      </div>
      <div className="scene__card-row">
        <span className="scene__card-label">Node</span>
        <span className="scene__card-value">{node.label}</span>
      </div>
      <div className="scene__card-row">
        <span className="scene__card-label">Region</span>
        <span className="scene__card-value">{node.region}</span>
      </div>
      <div className="scene__card-row">
        <span className="scene__card-label">Peers</span>
        <span className="scene__card-value">{node.peers.length}</span>
      </div>
      <div className="scene__card-row" style={{ marginTop: "12px" }}>
        <span className="scene__card-label">State</span>
        <span className="scene__card-value">● {statusLabel}</span>
      </div>
    </div>
  );
}
