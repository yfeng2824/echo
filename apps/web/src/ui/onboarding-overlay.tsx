import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { EchoEventType, OnboardingStepId } from "@echo/contracts";
import { buildMapNodeLayout, getMapVerticalOffset } from "../lib/map-node-layout";
import { createWorldMapProjection } from "../lib/map-projection";
import { useAppStore } from "../state/app-store";
import { ChevronLeftIcon, ChevronRightIcon, PlayIcon } from "./icons";
import SplitText from "./split-text";
import "./onboarding-overlay.css";

type HighlightRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type Highlight = {
  id: string;
  shape: "rect" | "circle";
  rect: HighlightRect;
};

type AnchorLayout = {
  mapSurface: HighlightRect | null;
  bottomControls: HighlightRect | null;
  nodeCard: HighlightRect | null;
  returnToMap: HighlightRect | null;
  spotlightNode: HighlightRect | null;
};

const STEP_ORDER: OnboardingStepId[] = [
  "map-pulse",
  "connected-node",
  "event-melodies",
  "node-view",
  "controls",
];

const NETWORK_EVENT_ROWS: Array<{
  type: Extract<EchoEventType, "channel_opened" | "channel_updated" | "channel_closed">;
  label: string;
  description: string;
}> = [
  {
    type: "channel_opened",
    label: "Channel opened",
    description: "Rising phrase",
  },
  {
    type: "channel_updated",
    label: "Channel updated",
    description: "Gentle lift and settle",
  },
  {
    type: "channel_closed",
    label: "Channel closed",
    description: "Falling phrase",
  },
];

function queryAnchorRect(anchor: string): HighlightRect | null {
  const element = document.querySelector<HTMLElement>(`[data-onboarding-anchor="${anchor}"]`);
  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function getEstimatedCardHeight(stepId: OnboardingStepId | null) {
  if (stepId === "event-melodies") {
    return 360;
  }

  if (stepId === "node-view") {
    return 220;
  }

  return 240;
}

function getCardStyle(primaryHighlight: HighlightRect | null, stepId: OnboardingStepId | null) {
  if (typeof window === "undefined") {
    return {};
  }

  const width = Math.min(stepId === "node-view" ? 420 : 360, window.innerWidth - 32);

  if (window.innerWidth <= 767) {
    return {
      left: "12px",
      right: "12px",
      bottom: "12px",
    } satisfies CSSProperties;
  }

  if (stepId === "controls" && primaryHighlight) {
    const estimatedHeight = getEstimatedCardHeight(stepId);
    const viewportPadding = 16;
    const left = Math.max(
      viewportPadding,
      Math.min(primaryHighlight.left, window.innerWidth - width - viewportPadding)
    );
    const top = Math.max(viewportPadding, primaryHighlight.top - estimatedHeight - 16);

    return {
      left: `${left}px`,
      top: `${top}px`,
    } satisfies CSSProperties;
  }

  return {
    right: "24px",
    bottom: "24px",
  } satisfies CSSProperties;
}

export function OnboardingOverlay() {
  const activeScene = useAppStore((state) => state.activeScene);
  const onboardingStatus = useAppStore((state) => state.onboardingStatus);
  const onboardingStepId = useAppStore((state) => state.onboardingStepId);
  const onboardingSpotlightNodeId = useAppStore((state) => state.onboardingSpotlightNodeId);
  const nodes = useAppStore((state) => state.nodes);
  const selectedNodeId = useAppStore((state) => state.selectedNodeId);
  const audio = useAppStore((state) => state.audio);
  const audioEnabled = useAppStore((state) => state.audioEnabled);
  const previousOnboardingStep = useAppStore((state) => state.previousOnboardingStep);
  const nextOnboardingStep = useAppStore((state) => state.nextOnboardingStep);
  const skipOnboarding = useAppStore((state) => state.skipOnboarding);
  const [layout, setLayout] = useState<AnchorLayout>({
    mapSurface: null,
    bottomControls: null,
    nodeCard: null,
    returnToMap: null,
    spotlightNode: null,
  });
  const cardContentRef = useRef<HTMLDivElement | null>(null);
  const [cardHeight, setCardHeight] = useState<number | null>(null);

  const spotlightNode = nodes.find((node) => node.id === onboardingSpotlightNodeId) ?? null;
  const hasLandedOnNodeView =
    onboardingStepId === "node-view" &&
    activeScene === "node" &&
    selectedNodeId === onboardingSpotlightNodeId;
  const shouldRenderCard =
    onboardingStatus === "active" &&
    onboardingStepId !== null &&
    !(onboardingStepId === "node-view" && !hasLandedOnNodeView);

  useEffect(() => {
    if (onboardingStatus !== "active") {
      return;
    }

    const updateLayout = () => {
      const mapSurface = queryAnchorRect("map-surface");
      const bottomControls = queryAnchorRect("bottom-controls");
      const nodeCard = queryAnchorRect("node-card");
      const returnToMap = queryAnchorRect("return-to-map");

      let spotlightNodeRect: HighlightRect | null = null;
      if (mapSurface && spotlightNode) {
        const projection = createWorldMapProjection(mapSurface.width, mapSurface.height);
        const mapNodeLayout = buildMapNodeLayout(nodes, {
          width: mapSurface.width,
          height: mapSurface.height,
          projection,
        });
        const point = mapNodeLayout.get(spotlightNode.id);

        if (point) {
          const size = 44;
          spotlightNodeRect = {
            left: mapSurface.left + point.x - size / 2,
            top:
              mapSurface.top +
              point.y +
              getMapVerticalOffset(mapSurface.width, mapSurface.height) -
              size / 2,
            width: size,
            height: size,
          };
        }
      }

      setLayout({
        mapSurface,
        bottomControls,
        nodeCard,
        returnToMap,
        spotlightNode: spotlightNodeRect,
      });
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);
    window.addEventListener("scroll", updateLayout, true);

    return () => {
      window.removeEventListener("resize", updateLayout);
      window.removeEventListener("scroll", updateLayout, true);
    };
  }, [nodes, onboardingStatus, onboardingStepId, spotlightNode]);

  const highlights = useMemo(() => {
    if (onboardingStatus !== "active" || !onboardingStepId) {
      return [];
    }

    switch (onboardingStepId) {
      case "map-pulse":
        return [];
      case "connected-node":
        if (layout.spotlightNode) {
          return [{ id: "spotlight-node", shape: "circle", rect: layout.spotlightNode }];
        }
        return [];
      case "event-melodies":
        return [];
      case "node-view":
        return [];
      case "controls":
        return layout.bottomControls
          ? [
              {
                id: "bottom-controls",
                shape: "rect",
                rect: layout.bottomControls,
              } satisfies Highlight,
            ]
          : [];
      default:
        return [];
    }
  }, [
    layout.bottomControls,
    layout.mapSurface,
    layout.nodeCard,
    layout.returnToMap,
    layout.spotlightNode,
    onboardingStatus,
    onboardingStepId,
  ]);

  const primaryHighlight = highlights[0]?.rect ?? null;
  const cardStyle = useMemo(
    () => getCardStyle(primaryHighlight, onboardingStepId),
    [onboardingStepId, primaryHighlight]
  );
  const controlsReplayHint = useMemo(() => {
    if (typeof window === "undefined") {
      return "Replay this tour any time from the info icon in the bottom right.";
    }

    if (window.innerWidth <= 900) {
      return 'Open the menu and choose "Take the tour" to replay.';
    }

    return "Replay this tour any time from the info icon in the bottom right.";
  }, [layout.bottomControls, onboardingStepId]);

  useEffect(() => {
    if (!shouldRenderCard) {
      setCardHeight(null);
      return;
    }

    const element = cardContentRef.current;
    if (!element) {
      setCardHeight(null);
      return;
    }

    const updateHeight = () => {
      // Keep a tiny buffer so descenders and button borders never get clipped.
      setCardHeight(Math.ceil(element.scrollHeight) + 2);
    };

    updateHeight();
    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [audioEnabled, controlsReplayHint, onboardingStepId, shouldRenderCard]);

  if (!shouldRenderCard || !onboardingStepId) {
    return null;
  }

  const stepNumber = STEP_ORDER.indexOf(onboardingStepId) + 1;
  const isFirstStep = stepNumber <= 1;
  const isLastStep = onboardingStepId === "controls";
  const nextLabel = onboardingStepId === "controls" ? "Finish" : "Next";
  const splitTextKey = onboardingStepId;

  const titleByStep: Record<OnboardingStepId, string> = {
    "map-pulse": "The map is always alive",
    "connected-node": "Connections shape the pitch",
    "event-melodies": "Events have different melodies",
    "node-view": "Node view shows a local soundscape",
    controls: "Adjust the soundscape",
  };

  const bodyByStep: Record<OnboardingStepId, string> = {
    "map-pulse":
      "Even when nothing major changes, nodes keep pulsing. Echo is meant to make the network feel present, not only active during events.",
    "connected-node":
      "Each node has its own tone. Nodes with more connections sound higher, so you can hear differences in network presence.",
    "event-melodies":
      "Each channel event has its own short melody. Press Play to hear how open, update, and close each sound.",
    "node-view":
      "Node view centers on one node and its directly connected peers. Unannounced peers are hidden, and multiple channels between the same two peers are shown as one connection.",
    controls:
      "Root changes the tonal center. Density changes how sparse or busy the sound feels. Find these controls in the menu.",
  };

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-live="polite">
      <div className="onboarding-overlay__scrim" />

      {highlights.map((highlight) => (
        <div
          key={highlight.id}
          className={`onboarding-overlay__highlight onboarding-overlay__highlight--${highlight.shape}`}
          style={{
            left: `${highlight.rect.left}px`,
            top: `${highlight.rect.top}px`,
            width: `${highlight.rect.width}px`,
            height: `${highlight.rect.height}px`,
          }}
        />
      ))}

      <section
        className="onboarding-overlay__card"
        style={{
          ...cardStyle,
          minHeight: cardHeight ? `${cardHeight}px` : undefined,
        }}
      >
        <div ref={cardContentRef} className="onboarding-overlay__card-content">
          <p className="onboarding-overlay__eyebrow">{`${stepNumber} of ${STEP_ORDER.length}`}</p>
          <h2 className="onboarding-overlay__title">
            <SplitText
              key={`title-${splitTextKey}`}
              text={titleByStep[onboardingStepId]}
              splitType="chars"
              delay={20}
              duration={0.62}
              ease="power3.out"
              from={{ opacity: 0, y: 14 }}
              to={{ opacity: 1, y: 0 }}
            />
          </h2>
          <p className="onboarding-overlay__body">
            <SplitText
              key={`body-${splitTextKey}`}
              text={bodyByStep[onboardingStepId]}
              splitType="words"
              delay={18}
              duration={0.56}
              ease="power3.out"
              from={{ opacity: 0, y: 8 }}
              to={{ opacity: 1, y: 0 }}
            />
          </p>

          {onboardingStepId === "event-melodies" ? (
            <>
              <div className="onboarding-overlay__event-list">
                {NETWORK_EVENT_ROWS.map((row) => {
                  return (
                    <div key={row.type} className="onboarding-overlay__event-row">
                      <div className="onboarding-overlay__event-copy">
                        <span className="onboarding-overlay__event-label">{row.label}</span>
                        <span className="onboarding-overlay__event-description">
                          {row.description}
                        </span>
                      </div>
                      <button
                        className="chrome-button onboarding-overlay__event-button"
                        type="button"
                        disabled={!audioEnabled}
                        onClick={() => {
                          audio?.playOnboardingEventMelody(row.type, onboardingSpotlightNodeId);
                        }}
                      >
                        <PlayIcon className="onboarding-overlay__button-icon" aria-hidden="true" />
                        Play
                      </button>
                    </div>
                  );
                })}
              </div>

              <p className="onboarding-overlay__tone">
                {audioEnabled ? " " : "Turn sound on to hear the event melodies in this step."}
              </p>
            </>
          ) : null}

          {onboardingStepId === "node-view" ? (
            <p className="onboarding-overlay__tone">
              Use "Return to map" to go back to the map view.
            </p>
          ) : null}

          {onboardingStepId === "controls" ? (
            <p className="onboarding-overlay__tone">{controlsReplayHint}</p>
          ) : null}

          <div className="onboarding-overlay__actions">
            <button className="onboarding-overlay__skip" type="button" onClick={skipOnboarding}>
              Skip
            </button>
            <div className="onboarding-overlay__nav">
              {!isFirstStep ? (
                <button
                  className="chrome-button onboarding-overlay__previous"
                  type="button"
                  onClick={previousOnboardingStep}
                >
                  <ChevronLeftIcon className="onboarding-overlay__button-icon" aria-hidden="true" />
                  Prev
                </button>
              ) : null}
              <button
                className="chrome-button onboarding-overlay__next"
                type="button"
                onClick={nextOnboardingStep}
              >
                {nextLabel}
                {!isLastStep ? (
                  <ChevronRightIcon
                    className="onboarding-overlay__button-icon"
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
