import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../state/app-store";
import "./network-transition-overlay.css";

const OVERLAY_SETTLE_MS = 2500;

type OverlayState = {
  key: number;
  network: string;
  phase: "loading" | "settling";
};

function createOverlayState(network: string, phase: OverlayState["phase"]): OverlayState {
  return {
    key: Date.now(),
    network,
    phase,
  };
}

export function NetworkTransitionOverlay() {
  const currentNetwork = useAppStore((state) => state.currentNetwork);
  const networkStatus = useAppStore((state) => state.networkStatus);
  const nodes = useAppStore((state) => state.nodes);
  const setNetworkTransitionVisible = useAppStore((state) => state.setNetworkTransitionVisible);

  const previousNetworkRef = useRef(currentNetwork);
  const clearTimerRef = useRef<number | null>(null);
  const [overlayState, setOverlayState] = useState<OverlayState | null>(null);
  const isInitialLoadVisible = networkStatus === "loading" && nodes.length === 0;

  const clearOverlayTimer = () => {
    if (clearTimerRef.current !== null) {
      window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearOverlayTimer();
      setNetworkTransitionVisible(false);
    };
  }, [setNetworkTransitionVisible]);

  useEffect(() => {
    if (previousNetworkRef.current === currentNetwork) {
      return;
    }

    clearOverlayTimer();
    previousNetworkRef.current = currentNetwork;
    setNetworkTransitionVisible(true);
    setOverlayState(createOverlayState(currentNetwork, "loading"));
  }, [currentNetwork, setNetworkTransitionVisible]);

  useEffect(() => {
    if (isInitialLoadVisible) {
      setNetworkTransitionVisible(true);
      return;
    }

    if (!overlayState) {
      setNetworkTransitionVisible(false);
    }
  }, [isInitialLoadVisible, overlayState, setNetworkTransitionVisible]);

  useEffect(() => {
    if (!overlayState || overlayState.phase === "settling" || networkStatus === "loading") {
      return;
    }

    setOverlayState((current) =>
      current ? createOverlayState(current.network, "settling") : current
    );
    clearTimerRef.current = window.setTimeout(() => {
      setOverlayState(null);
      setNetworkTransitionVisible(false);
      clearTimerRef.current = null;
    }, OVERLAY_SETTLE_MS);
  }, [networkStatus, overlayState, setNetworkTransitionVisible]);

  if (!overlayState && !isInitialLoadVisible) {
    return null;
  }

  const overlayNetwork = overlayState?.network ?? currentNetwork;
  const networkLabel = overlayNetwork === "mainnet" ? "Mainnet" : "Testnet";
  const eyebrow = overlayState ? "Switching network to" : "Fetching live data for";
  const phaseClass = overlayState?.phase ?? "loading";

  return (
    <div className="network-transition" aria-hidden="true">
      <div
        key={
          overlayState
            ? `${overlayState.key}-${overlayState.phase}`
            : `initial-${overlayNetwork}-${networkStatus}`
        }
        className={`network-transition__layer network-transition__layer--${phaseClass} ${
          !overlayState ? "network-transition__layer--initial" : ""
        }`}
      >
        <div className="network-transition__veil" />
        <div className="network-transition__state">
          <div className="network-transition__indicator" aria-hidden="true">
            <span className="network-transition__indicator-dot network-transition__indicator-dot--left" />
            <span className="network-transition__indicator-dot network-transition__indicator-dot--right" />
          </div>
          <div className="network-transition__copy">
            <span className="network-transition__eyebrow">{eyebrow}</span>
            <span className="network-transition__label">{networkLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
