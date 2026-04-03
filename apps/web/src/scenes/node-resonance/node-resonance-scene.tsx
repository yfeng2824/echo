import { useEffect, useState } from "react";
import { useAppStore } from "../../state/app-store";
import "../../scenes/scenes.css";
import { getDisplayNodeId } from "../../lib/node-id";
import { BackIcon, CaretDownIcon } from "../../ui/icons";
import { NodeInfoCard } from "../../ui/node-info-card";

const MOBILE_NODE_PANEL_MEDIA_QUERY = "(max-width: 767px)";

export function NodeResonanceScene() {
  const selectedNodeId = useAppStore((state) => state.selectedNodeId);
  const nodes = useAppStore((state) => state.nodes);
  const channels = useAppStore((state) => state.channels);
  const goToMap = useAppStore((state) => state.goToMap);
  const [isMobilePanel, setIsMobilePanel] = useState(false);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(true);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];
  const panelLabel = selectedNode ? getDisplayNodeId(selectedNode) : "Node info";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(MOBILE_NODE_PANEL_MEDIA_QUERY);
    const syncMobilePanel = (matches: boolean) => {
      setIsMobilePanel(matches);
      setIsMobilePanelOpen(!matches);
    };

    syncMobilePanel(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      syncMobilePanel(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  const showPanelContent = !isMobilePanel || isMobilePanelOpen;

  return (
    <section className="scene scene--full">
      <div
        className={`scene__overlay scene__overlay--top-right scene__overlay--node-card ${
          isMobilePanel ? "scene__overlay--node-card-mobile" : ""
        } ${showPanelContent ? "is-open" : "is-collapsed"}`}
      >
        {isMobilePanel ? (
          <button
            className={`scene__mobile-node-panel-toggle ${showPanelContent ? "is-open" : ""}`}
            type="button"
            onClick={() => setIsMobilePanelOpen((open) => !open)}
            aria-expanded={showPanelContent}
            aria-controls="mobile-node-panel-content"
          >
            <span className="scene__mobile-node-panel-copy">
              <span className="scene__mobile-node-panel-label">Node info</span>
              <span className="scene__mobile-node-panel-value">{panelLabel}</span>
            </span>
            <CaretDownIcon className="scene__mobile-node-panel-caret" aria-hidden="true" />
          </button>
        ) : null}

        {showPanelContent ? (
          <div id="mobile-node-panel-content" className="scene__mobile-node-panel-content">
            <NodeInfoCard
              node={selectedNode ?? null}
              channels={channels}
              visible={Boolean(selectedNode)}
            />
          </div>
        ) : null}

        <div
          className={`scene__action-controls ${
            isMobilePanel ? "scene__action-controls--mobile-node" : ""
          }`}
        >
          <button
            className="chrome-button"
            type="button"
            data-onboarding-anchor="return-to-map"
            onClick={goToMap}
          >
            <BackIcon className="scene__action-icon" aria-hidden="true" />
            Return to map
          </button>
        </div>
      </div>
    </section>
  );
}
