import { useEffect, useRef, useState } from "react";
import type { EchoNode } from "@echo/contracts";
import { getDisplayNodeId, getFullHexNodeId } from "../lib/node-id";

type NodeInfoCardProps = {
  node: EchoNode | null;
  visible: boolean;
};

export function NodeInfoCard({ node, visible }: NodeInfoCardProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const resetTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) {
        window.clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  if (!visible || !node) {
    return null;
  }

  const statusLabel = node.status === "live" ? "Live" : "Quiet";
  const fullNodeId = getFullHexNodeId(node.id);
  const displayNodeId = getDisplayNodeId(node.id);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullNodeId);
      // Keep the confirmation short so the card layout stays calm.
      setCopyState("copied");
      if (resetTimeoutRef.current) {
        window.clearTimeout(resetTimeoutRef.current);
      }
      resetTimeoutRef.current = window.setTimeout(() => {
        setCopyState("idle");
      }, 1200);
    } catch {
      // TODO: add non-blocking copy feedback if clipboard access fails.
    }
  };

  return (
    <div className="scene__card">
      <div className="scene__card-row">
        <span className="scene__card-label">ID</span>
        <span className="scene__card-value scene__card-value--inline">
          <span>{displayNodeId}</span>
          <span className="scene__copy-control">
            <span
              className={`scene__copy-feedback ${
                copyState === "copied" ? "scene__copy-feedback--visible" : ""
              }`}
              aria-live="polite"
            >
              Copied
            </span>
            <button
              className="scene__copy-button"
              type="button"
              onClick={handleCopy}
              aria-label={`Copy ${displayNodeId}`}
              title="Copy full node ID"
            >
              <span className="scene__copy-icon" aria-hidden="true" />
            </button>
          </span>
        </span>
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
        <span className="scene__card-label">State</span>
        <span className="scene__card-value">● {statusLabel}</span>
      </div>
    </div>
  );
}
