import { useEffect, useRef, useState } from "react";
import type { EchoChannel, EchoNode } from "@echo/contracts";
import { getDisplayNodeId, getFullNodeId } from "../lib/node-id";
import { CopyIcon } from "./icons";

type NodeInfoCardProps = {
  node: EchoNode | null;
  channels: EchoChannel[];
  visible: boolean;
};

export function NodeInfoCard({ node, channels, visible }: NodeInfoCardProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [showActiveChannelsTooltip, setShowActiveChannelsTooltip] = useState(false);
  const [activeChannelsTooltipStyle, setActiveChannelsTooltipStyle] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const resetTimeoutRef = useRef<number | null>(null);
  const activeChannelsLabelRef = useRef<HTMLSpanElement | null>(null);
  const activeChannelsTooltipRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) {
        window.clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!showActiveChannelsTooltip) {
      return;
    }

    const updateTooltipPosition = () => {
      const labelRect = activeChannelsLabelRef.current?.getBoundingClientRect();
      const tooltipRect = activeChannelsTooltipRef.current?.getBoundingClientRect();
      if (!labelRect || !tooltipRect) {
        return;
      }

      const spacing = 8;
      const viewportPadding = 8;
      const centeredLeft = labelRect.left + labelRect.width / 2 - tooltipRect.width / 2;
      const clampedLeft = Math.min(
        Math.max(viewportPadding, centeredLeft),
        window.innerWidth - tooltipRect.width - viewportPadding
      );

      let top = labelRect.top - tooltipRect.height - spacing;
      if (top < viewportPadding) {
        top = Math.min(
          labelRect.bottom + spacing,
          window.innerHeight - tooltipRect.height - viewportPadding
        );
      }

      setActiveChannelsTooltipStyle({ left: clampedLeft, top });
    };

    const frame = window.requestAnimationFrame(updateTooltipPosition);
    window.addEventListener("resize", updateTooltipPosition);
    window.addEventListener("scroll", updateTooltipPosition, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateTooltipPosition);
      window.removeEventListener("scroll", updateTooltipPosition, true);
    };
  }, [showActiveChannelsTooltip]);

  if (!visible || !node) {
    return null;
  }

  const fullNodeId = getFullNodeId(node);
  const displayNodeId = getDisplayNodeId(node);
  const alias = node.label?.trim() ? node.label : null;
  const activeChannelCount = channels.filter(
    (channel) => channel.sourceNodeId === node.id || channel.targetNodeId === node.id
  ).length;
  const connectedPeerCount = node.peers.length;

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
      // Ignore clipboard failures so the card does not flash an extra error state.
    }
  };

  return (
    <div className="scene__card" data-onboarding-anchor="node-card">
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
              <CopyIcon className="scene__copy-icon" aria-hidden="true" />
            </button>
          </span>
        </span>
      </div>
      {alias ? (
        <div className="scene__card-row">
          <span className="scene__card-label">Alias</span>
          <span className="scene__card-value">{alias}</span>
        </div>
      ) : null}
      <div className="scene__card-row">
        <span className="scene__card-label">Region</span>
        <span className="scene__card-value">{node.region}</span>
      </div>
      <div className="scene__card-row">
        <span>
          <span
            ref={activeChannelsLabelRef}
            className="scene__card-label scene__card-label--hint"
            onMouseEnter={() => setShowActiveChannelsTooltip(true)}
            onMouseLeave={() => setShowActiveChannelsTooltip(false)}
          >
            Active Channels
          </span>
        </span>
        <span className="scene__card-value">{activeChannelCount}</span>
      </div>
      <div className="scene__card-row">
        <span className="scene__card-label">Announced Peers</span>
        <span className="scene__card-value">{connectedPeerCount}</span>
      </div>
      {showActiveChannelsTooltip ? (
        <span
          ref={activeChannelsTooltipRef}
          className="scene__card-inline-tooltip scene__card-inline-tooltip--floating"
          style={activeChannelsTooltipStyle ?? undefined}
          role="tooltip"
        >
          <span className="scene__card-inline-tooltip-value">Excludes closed channels</span>
        </span>
      ) : null}
    </div>
  );
}
