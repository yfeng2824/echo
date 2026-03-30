import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioDensity, SecretCueWord } from "@echo/contracts";
import { useAppStore } from "../state/app-store";
import { findNodeByQuery } from "../lib/network";
import { ROOT_OPTIONS } from "../lib/pentatonic";
import "./scene-chrome.css";

type SearchState = "idle" | "loading" | "empty";
type EmptyOverlayState = "idle" | "visible" | "closing";
type OverlayContent = {
  title: string;
  description: string;
  buttonLabel: string;
  buttonAction: () => void;
};

const DENSITY_OPTIONS: AudioDensity[] = ["sparse", "balanced", "rich"];
const SECRET_WORD_BY_INITIAL: Record<string, SecretCueWord> = {
  c: "ckb",
  e: "echo",
  f: "fiber",
};
const SECRET_TYPING_TIMEOUT_MS = 900;

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  const tagName = element?.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || element?.isContentEditable === true;
}

function getCountSummary(nodeCount: number, channelCount: number) {
  return `${nodeCount} Announced ${nodeCount === 1 ? "Node" : "Nodes"} • ${channelCount} Active ${
    channelCount === 1 ? "Channel" : "Channels"
  }`;
}

export function SceneChrome() {
  const activeScene = useAppStore((state) => state.activeScene);
  const audioEnabled = useAppStore((state) => state.audioEnabled);
  const audioSettings = useAppStore((state) => state.audioSettings);
  const currentNetwork = useAppStore((state) => state.currentNetwork);
  const invalidNodeRouteId = useAppStore((state) => state.invalidNodeRouteId);
  const networkStatus = useAppStore((state) => state.networkStatus);
  const networkTransitionVisible = useAppStore((state) => state.networkTransitionVisible);
  const headlineCounts = useAppStore((state) => state.headlineCounts);
  const mapSearchTransition = useAppStore((state) => state.mapSearchTransition);
  const nodes = useAppStore((state) => state.nodes);
  const setAudioSettings = useAppStore((state) => state.setAudioSettings);
  const setNetwork = useAppStore((state) => state.setNetwork);
  const setInvalidNodeRouteId = useAppStore((state) => state.setInvalidNodeRouteId);
  const selectNode = useAppStore((state) => state.selectNode);
  const startMapSearchTransition = useAppStore((state) => state.startMapSearchTransition);
  const clearMapSearchTransition = useAppStore((state) => state.clearMapSearchTransition);
  const goToMap = useAppStore((state) => state.goToMap);
  const toggleAudio = useAppStore((state) => state.toggleAudio);
  const audio = useAppStore((state) => state.audio);
  const secretCue = useAppStore((state) => state.secretCue);
  const beginSecretWord = useAppStore((state) => state.beginSecretWord);
  const advanceSecretWord = useAppStore((state) => state.advanceSecretWord);
  const triggerSecretCue = useAppStore((state) => state.triggerSecretCue);
  const cancelSecretWord = useAppStore((state) => state.cancelSecretWord);
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [emptyOverlayState, setEmptyOverlayState] = useState<EmptyOverlayState>("idle");
  const loadingTimeoutRef = useRef<number | null>(null);
  const dismissTimeoutRef = useRef<number | null>(null);
  const foundTransitionTimeoutRef = useRef<number | null>(null);
  const secretTypingTimeoutRef = useRef<number | null>(null);
  const secretCueTimeoutRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const previousSceneRef = useRef(activeScene);
  const previousNetworkRef = useRef(currentNetwork);
  const networkMenuRef = useRef<HTMLDivElement | null>(null);
  const networkTriggerRef = useRef<HTMLButtonElement | null>(null);
  const networkPanelRef = useRef<HTMLDivElement | null>(null);
  const soundButtonRef = useRef<HTMLButtonElement | null>(null);
  const soundTooltipRef = useRef<HTMLDivElement | null>(null);
  const densityMenuRef = useRef<HTMLDivElement | null>(null);
  const rootMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileControlsMenuRef = useRef<HTMLDivElement | null>(null);
  const [networkMenuOpen, setNetworkMenuOpen] = useState(false);
  const [densityMenuOpen, setDensityMenuOpen] = useState(false);
  const [rootMenuOpen, setRootMenuOpen] = useState(false);
  const [mobileControlsMenuOpen, setMobileControlsMenuOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showSoundTooltip, setShowSoundTooltip] = useState(false);
  const [soundTooltipStyle, setSoundTooltipStyle] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [networkMenuVertical, setNetworkMenuVertical] = useState<"down" | "up">("down");
  const [networkMenuHorizontal, setNetworkMenuHorizontal] = useState<"end" | "start">("end");

  const { announcedNodeCount, channelCount } = headlineCounts;
  const countSummary = getCountSummary(announcedNodeCount, channelCount);
  const showCountSkeleton = networkStatus === "loading" || networkTransitionVisible;
  const isSearchLocked = activeScene === "map" && mapSearchTransition !== null;
  const isLiveDataUnavailable = networkStatus === "unavailable";
  const hasBlockingOverlay =
    isLiveDataUnavailable || invalidNodeRouteId !== null || searchState === "empty";
  const isSecretInputBlocked =
    activeScene !== "map" ||
    isSearchLocked ||
    networkTransitionVisible ||
    hasBlockingOverlay ||
    networkMenuOpen ||
    densityMenuOpen ||
    rootMenuOpen ||
    mobileControlsMenuOpen;

  const cancelSearchTimers = useCallback(() => {
    if (loadingTimeoutRef.current) {
      window.clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }

    if (foundTransitionTimeoutRef.current) {
      window.clearTimeout(foundTransitionTimeoutRef.current);
      foundTransitionTimeoutRef.current = null;
    }
  }, []);

  const resetSearchUi = useCallback(
    (nextQuery = "") => {
      setQuery(nextQuery);
      setSearchState("idle");
      setEmptyOverlayState("idle");
      clearMapSearchTransition();
    },
    [clearMapSearchTransition]
  );

  const handleInvalidRouteBack = useCallback(() => {
    setInvalidNodeRouteId(null);
    goToMap();
  }, [goToMap, setInvalidNodeRouteId]);

  useEffect(() => {
    return () => {
      cancelSearchTimers();
      if (dismissTimeoutRef.current) {
        window.clearTimeout(dismissTimeoutRef.current);
      }
      if (secretTypingTimeoutRef.current) {
        window.clearTimeout(secretTypingTimeoutRef.current);
      }
      if (secretCueTimeoutRef.current) {
        window.clearTimeout(secretCueTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const previousScene = previousSceneRef.current;
    previousSceneRef.current = activeScene;

    if (previousScene === "node" && activeScene === "map") {
      resetSearchUi();
    }
  }, [activeScene, resetSearchUi]);

  useEffect(() => {
    const previousNetwork = previousNetworkRef.current;
    const networkChanged = previousNetwork !== currentNetwork;
    previousNetworkRef.current = currentNetwork;

    if (activeScene === "map" && !networkChanged) {
      return;
    }

    cancelSearchTimers();
    resetSearchUi();
  }, [activeScene, cancelSearchTimers, currentNetwork, resetSearchUi]);

  useEffect(() => {
    if (!isSecretInputBlocked || secretCue.phase === "idle") {
      return;
    }

    if (secretTypingTimeoutRef.current) {
      window.clearTimeout(secretTypingTimeoutRef.current);
      secretTypingTimeoutRef.current = null;
    }
    if (secretCueTimeoutRef.current) {
      window.clearTimeout(secretCueTimeoutRef.current);
      secretCueTimeoutRef.current = null;
    }
    cancelSecretWord();
  }, [cancelSecretWord, isSecretInputBlocked, secretCue.phase]);

  useEffect(() => {
    if (secretTypingTimeoutRef.current) {
      window.clearTimeout(secretTypingTimeoutRef.current);
      secretTypingTimeoutRef.current = null;
    }
    if (secretCueTimeoutRef.current) {
      window.clearTimeout(secretCueTimeoutRef.current);
      secretCueTimeoutRef.current = null;
    }

    if (secretCue.phase === "typing") {
      secretTypingTimeoutRef.current = window.setTimeout(() => {
        secretTypingTimeoutRef.current = null;
        cancelSecretWord();
      }, SECRET_TYPING_TIMEOUT_MS);
      return;
    }

    if (secretCue.phase === "playing" && secretCue.expiresAt) {
      secretCueTimeoutRef.current = window.setTimeout(
        () => {
          secretCueTimeoutRef.current = null;
          cancelSecretWord();
        },
        Math.max(0, secretCue.expiresAt - Date.now())
      );
    }
  }, [cancelSecretWord, secretCue]);

  useEffect(() => {
    const handleSlashShortcut = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (
        isTypingTarget(event.target) ||
        isSearchLocked ||
        isLiveDataUnavailable ||
        secretCue.phase !== "idle"
      ) {
        return;
      }

      event.preventDefault();
      searchInputRef.current?.focus();
    };

    window.addEventListener("keydown", handleSlashShortcut);
    return () => {
      window.removeEventListener("keydown", handleSlashShortcut);
    };
  }, [isLiveDataUnavailable, isSearchLocked, secretCue.phase]);

  useEffect(() => {
    const handleMuteShortcut = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "m" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (isTypingTarget(event.target) || secretCue.phase !== "idle") {
        return;
      }

      event.preventDefault();
      toggleAudio();
    };

    window.addEventListener("keydown", handleMuteShortcut);
    return () => {
      window.removeEventListener("keydown", handleMuteShortcut);
    };
  }, [secretCue.phase, toggleAudio]);

  useEffect(() => {
    const handleSecretTyping = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) {
        return;
      }

      if (isTypingTarget(event.target) || isSecretInputBlocked || secretCue.phase === "playing") {
        return;
      }

      const key = event.key.toLowerCase();

      if (secretCue.phase === "typing" && secretCue.word) {
        const expectedChar = secretCue.word[secretCue.matchedText.length];
        if (key !== expectedChar) {
          cancelSecretWord();
          return;
        }

        const nextMatchedText = `${secretCue.matchedText}${key}`;
        advanceSecretWord(nextMatchedText);
        audio?.playSecretProgress(secretCue.word, nextMatchedText.length - 1);

        if (nextMatchedText === secretCue.word) {
          triggerSecretCue();
          audio?.playSecretCue(secretCue.word);
        }
        return;
      }

      const nextWord = SECRET_WORD_BY_INITIAL[key];
      if (!nextWord) {
        return;
      }

      beginSecretWord(nextWord, key);
      audio?.playSecretProgress(nextWord, 0);
    };

    window.addEventListener("keydown", handleSecretTyping);
    return () => {
      window.removeEventListener("keydown", handleSecretTyping);
    };
  }, [
    advanceSecretWord,
    audio,
    beginSecretWord,
    cancelSecretWord,
    isSecretInputBlocked,
    secretCue,
    triggerSecretCue,
  ]);

  useEffect(() => {
    if (!showSoundTooltip) {
      return;
    }

    const updateSoundTooltipPosition = () => {
      const buttonRect = soundButtonRef.current?.getBoundingClientRect();
      const tooltipRect = soundTooltipRef.current?.getBoundingClientRect();
      if (!buttonRect || !tooltipRect) {
        return;
      }

      const spacing = 8;
      const viewportPadding = 8;
      const centeredLeft = buttonRect.left + buttonRect.width / 2 - tooltipRect.width / 2;
      const clampedLeft = Math.min(
        Math.max(viewportPadding, centeredLeft),
        window.innerWidth - tooltipRect.width - viewportPadding
      );

      let top = buttonRect.top - tooltipRect.height - spacing;
      if (top < viewportPadding) {
        top = Math.min(
          buttonRect.bottom + spacing,
          window.innerHeight - tooltipRect.height - viewportPadding
        );
      }

      setSoundTooltipStyle({ left: clampedLeft, top });
    };

    const frame = window.requestAnimationFrame(updateSoundTooltipPosition);
    window.addEventListener("resize", updateSoundTooltipPosition);
    window.addEventListener("scroll", updateSoundTooltipPosition, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateSoundTooltipPosition);
      window.removeEventListener("scroll", updateSoundTooltipPosition, true);
    };
  }, [showSoundTooltip]);

  useEffect(() => {
    if (!networkMenuOpen && !densityMenuOpen && !rootMenuOpen && !mobileControlsMenuOpen) {
      return;
    }

    const updateMenuPlacement = () => {
      const triggerRect = networkTriggerRef.current?.getBoundingClientRect();
      const panelRect = networkPanelRef.current?.getBoundingClientRect();

      if (!triggerRect) {
        return;
      }

      const panelWidth = panelRect?.width ?? Math.max(triggerRect.width, 148);
      const panelHeight = panelRect?.height ?? 80;
      const viewportHeight = window.innerHeight;
      const spacing = 8;
      const shouldAlignStart = triggerRect.right - panelWidth < spacing;
      const spaceBelow = viewportHeight - triggerRect.bottom;
      const spaceAbove = triggerRect.top;
      const shouldOpenUp = spaceBelow < panelHeight + spacing && spaceAbove > panelHeight + spacing;

      setNetworkMenuHorizontal(shouldAlignStart ? "start" : "end");
      setNetworkMenuVertical(shouldOpenUp ? "up" : "down");
    };

    const frame = window.requestAnimationFrame(updateMenuPlacement);

    const handleWindowPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const inNetworkMenu = networkMenuRef.current?.contains(target);
      const inDensityMenu = densityMenuRef.current?.contains(target);
      const inRootMenu = rootMenuRef.current?.contains(target);
      const inMobileMenu = mobileControlsMenuRef.current?.contains(target);
      if (!inNetworkMenu && !inDensityMenu && !inRootMenu && !inMobileMenu) {
        setNetworkMenuOpen(false);
        setDensityMenuOpen(false);
        setRootMenuOpen(false);
        setMobileControlsMenuOpen(false);
      }
    };

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNetworkMenuOpen(false);
        setDensityMenuOpen(false);
        setRootMenuOpen(false);
        setMobileControlsMenuOpen(false);
      }
    };

    const handleViewportChange = () => {
      setNetworkMenuOpen(false);
      setDensityMenuOpen(false);
      setRootMenuOpen(false);
      setMobileControlsMenuOpen(false);
    };

    window.addEventListener("pointerdown", handleWindowPointerDown);
    window.addEventListener("keydown", handleWindowKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("orientationchange", handleViewportChange);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", handleWindowPointerDown);
      window.removeEventListener("keydown", handleWindowKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("orientationchange", handleViewportChange);
    };
  }, [densityMenuOpen, mobileControlsMenuOpen, networkMenuOpen, rootMenuOpen]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSearchLocked || isLiveDataUnavailable) {
      return;
    }

    cancelSearchTimers();

    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      setSearchState("idle");
      clearMapSearchTransition();
      return;
    }

    const matchedNode = findNodeByQuery(nodes, normalizedQuery);

    setSearchState("loading");

    // Hold a short loading beat so the inline search animation is perceptible.
    loadingTimeoutRef.current = window.setTimeout(() => {
      loadingTimeoutRef.current = null;

      if (matchedNode) {
        setSearchState("idle");
        setEmptyOverlayState("idle");
        clearMapSearchTransition();

        if (activeScene === "map") {
          startMapSearchTransition(matchedNode.id);
          foundTransitionTimeoutRef.current = window.setTimeout(() => {
            foundTransitionTimeoutRef.current = null;

            const { activeScene: latestScene, mapSearchTransition: latestTransition } =
              useAppStore.getState();
            if (latestScene !== "map" || latestTransition?.nodeId !== matchedNode.id) {
              return;
            }

            setQuery("");
            selectNode(matchedNode.id);
          }, 950);
          return;
        }

        setQuery("");
        selectNode(matchedNode.id);
        return;
      }

      clearMapSearchTransition();
      setQuery("");
      setSearchState("empty");
      setEmptyOverlayState("visible");
    }, 520);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);

    if (searchState === "empty") {
      setSearchState("idle");
      setEmptyOverlayState("idle");
    }
  };

  const handleClearQuery = () => {
    cancelSearchTimers();
    resetSearchUi();
  };

  const handleDismissEmptyState = () => {
    cancelSearchTimers();
    clearMapSearchTransition();
    setEmptyOverlayState("closing");

    if (dismissTimeoutRef.current) {
      window.clearTimeout(dismissTimeoutRef.current);
    }

    dismissTimeoutRef.current = window.setTimeout(() => {
      setSearchState("idle");
      setEmptyOverlayState("idle");
    }, 760);
  };

  let overlayContent: OverlayContent | null = null;

  if (isLiveDataUnavailable) {
    overlayContent = {
      title: "No live echo detected",
      description: "Live network activity is not available right now.",
      buttonLabel: "Retry",
      buttonAction: () => window.location.reload(),
    };
  } else if (invalidNodeRouteId) {
    overlayContent = {
      title: "Node not found",
      description: "This node link doesn't exist in the current network.",
      buttonLabel: "Back",
      buttonAction: handleInvalidRouteBack,
    };
  } else if (searchState === "empty") {
    overlayContent = {
      title: "No echo found",
      description: "We couldn't find a matching node in the current network.",
      buttonLabel: "Back",
      buttonAction: handleDismissEmptyState,
    };
  }

  const showSecretPrompt =
    activeScene === "map" && secretCue.word !== null && secretCue.phase !== "idle";
  const secretPromptLetters = secretCue.word?.toUpperCase().split("") ?? [];

  return (
    <>
      <header className="scene-chrome scene-chrome--top-left">
        <div className="scene-chrome__title-group">
          <button className="scene-chrome__title-button" type="button" onClick={goToMap}>
            <h1 className="scene-chrome__title">
              <img className="scene-chrome__logo" src="/echo-icon.svg" alt="Echo" />
            </h1>
          </button>
          <div className="scene-chrome__meta-slot">
            {showCountSkeleton ? (
              <div
                className="scene-chrome__meta-skeleton"
                aria-label="Loading node and channel counts"
              />
            ) : (
              <div className="scene-chrome__meta">{countSummary}</div>
            )}
          </div>
        </div>
      </header>

      <div className="scene-chrome scene-chrome--top-center">
        <form className="scene-chrome__search-box" onSubmit={handleSubmit}>
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            placeholder="Search node ID..."
            aria-label="Search nodes"
            onChange={handleChange}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            autoComplete="off"
            disabled={isSearchLocked || isLiveDataUnavailable}
          />
          {query.trim() ? (
            <button
              className="scene-chrome__search-clear"
              type="button"
              onClick={handleClearQuery}
              aria-label="Clear search"
            >
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
          <span
            className={`scene-chrome__search-loader ${
              searchState === "loading" ? "scene-chrome__search-loader--visible" : ""
            }`}
            aria-hidden="true"
          />
          {!isSearchFocused && !query.trim() && searchState !== "loading" ? (
            <span className="scene-chrome__search-shortcut" aria-hidden="true">
              <kbd>/</kbd>
            </span>
          ) : null}
        </form>
      </div>

      <div className={`scene-chrome scene-chrome--top-right ${audioEnabled ? "is-active" : ""}`}>
        <div className="scene-chrome__sound-control">
          <button
            ref={soundButtonRef}
            className={`chrome-button ${audioEnabled ? "is-active" : ""}`}
            type="button"
            onClick={toggleAudio}
            onMouseEnter={() => setShowSoundTooltip(true)}
            onMouseLeave={() => setShowSoundTooltip(false)}
            onFocus={() => setShowSoundTooltip(true)}
            onBlur={() => setShowSoundTooltip(false)}
          >
            Sound: {audioEnabled ? "On" : "Off"}
          </button>
          {showSoundTooltip ? (
            <div
              ref={soundTooltipRef}
              className="scene-chrome__tooltip"
              role="tooltip"
              style={
                soundTooltipStyle
                  ? {
                      left: `${soundTooltipStyle.left}px`,
                      top: `${soundTooltipStyle.top}px`,
                    }
                  : undefined
              }
            >
              <span className="scene-chrome__tooltip-label">Shortcut: </span>
              <span className="scene-chrome__tooltip-value">M</span>
            </div>
          ) : null}
        </div>
        <div className="scene-chrome__network-menu" ref={networkMenuRef}>
          <button
            className={`scene-chrome__network-trigger ${networkMenuOpen ? "is-open" : ""}`}
            type="button"
            aria-haspopup="listbox"
            aria-expanded={networkMenuOpen}
            onClick={() => {
              setNetworkMenuOpen((open) => !open);
              setDensityMenuOpen(false);
              setRootMenuOpen(false);
            }}
            ref={networkTriggerRef}
          >
            <span>{currentNetwork === "mainnet" ? "Mainnet" : "Testnet"}</span>
            <span className="scene-chrome__network-caret" aria-hidden="true">
              ▾
            </span>
          </button>
          {networkMenuOpen ? (
            <div
              className={`scene-chrome__network-panel scene-chrome__network-panel--${networkMenuVertical} scene-chrome__network-panel--${networkMenuHorizontal}`}
              role="listbox"
              aria-label="Network options"
              ref={networkPanelRef}
            >
              <button
                className={`scene-chrome__network-option ${currentNetwork === "testnet" ? "is-active" : ""}`}
                type="button"
                role="option"
                aria-selected={currentNetwork === "testnet"}
                onClick={() => {
                  setNetwork("testnet");
                  setNetworkMenuOpen(false);
                }}
              >
                <span className="scene-chrome__network-check" aria-hidden="true">
                  {currentNetwork === "testnet" ? "✓" : ""}
                </span>
                Testnet
              </button>
              <button
                className={`scene-chrome__network-option ${currentNetwork === "mainnet" ? "is-active" : ""}`}
                type="button"
                role="option"
                aria-selected={currentNetwork === "mainnet"}
                onClick={() => {
                  setNetwork("mainnet");
                  setNetworkMenuOpen(false);
                }}
              >
                <span className="scene-chrome__network-check" aria-hidden="true">
                  {currentNetwork === "mainnet" ? "✓" : ""}
                </span>
                Mainnet
              </button>
            </div>
          ) : null}
        </div>
        <div className="scene-chrome__mobile-menu" ref={mobileControlsMenuRef}>
          <button
            className={`scene-chrome__mobile-menu-trigger ${mobileControlsMenuOpen ? "is-open" : ""}`}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={mobileControlsMenuOpen}
            aria-label="Open controls menu"
            onClick={() => setMobileControlsMenuOpen((open) => !open)}
          >
            <span className="scene-chrome__mobile-menu-icon" aria-hidden="true">
              ☰
            </span>
          </button>
          {mobileControlsMenuOpen ? (
            <div
              className="scene-chrome__mobile-menu-panel"
              role="dialog"
              aria-label="Network and density controls"
            >
              <div className="scene-chrome__mobile-section">
                <div className="audio-controls__label">Root</div>
                <div className="scene-chrome__mobile-network-row scene-chrome__mobile-network-row--root">
                  {ROOT_OPTIONS.map((root) => {
                    const isActive = audioSettings.root === root;
                    return (
                      <button
                        key={`mobile-root-${root}`}
                        className={`scene-chrome__mobile-network-option ${isActive ? "is-active" : ""}`}
                        type="button"
                        onClick={() => {
                          setAudioSettings({ root });
                        }}
                      >
                        <span className="scene-chrome__mobile-network-check" aria-hidden="true">
                          {isActive ? "✓" : ""}
                        </span>
                        {root}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="scene-chrome__mobile-section">
                <div className="audio-controls__label">Network</div>
                <div className="scene-chrome__mobile-network-row">
                  <button
                    className={`scene-chrome__mobile-network-option ${
                      currentNetwork === "testnet" ? "is-active" : ""
                    }`}
                    type="button"
                    onClick={() => {
                      setNetwork("testnet");
                      setMobileControlsMenuOpen(false);
                    }}
                  >
                    <span className="scene-chrome__mobile-network-check" aria-hidden="true">
                      {currentNetwork === "testnet" ? "✓" : ""}
                    </span>
                    Testnet
                  </button>
                  <button
                    className={`scene-chrome__mobile-network-option ${
                      currentNetwork === "mainnet" ? "is-active" : ""
                    }`}
                    type="button"
                    onClick={() => {
                      setNetwork("mainnet");
                      setMobileControlsMenuOpen(false);
                    }}
                  >
                    <span className="scene-chrome__mobile-network-check" aria-hidden="true">
                      {currentNetwork === "mainnet" ? "✓" : ""}
                    </span>
                    Mainnet
                  </button>
                </div>
              </div>

              <div className="scene-chrome__mobile-section">
                <div className="audio-controls__label">Density</div>
                <div className="scene-chrome__mobile-network-row scene-chrome__mobile-network-row--density">
                  {DENSITY_OPTIONS.map((density) => {
                    const isSelected = audioSettings.density === density;
                    return (
                      <button
                        key={`mobile-density-${density}`}
                        className={`scene-chrome__mobile-network-option ${isSelected ? "is-active" : ""}`}
                        type="button"
                        onClick={() => setAudioSettings({ density })}
                      >
                        <span className="scene-chrome__mobile-network-check" aria-hidden="true">
                          {isSelected ? "✓" : ""}
                        </span>
                        {density}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="scene-chrome scene-chrome--bottom-left">
        <div className="scene-chrome__root-menu" ref={rootMenuRef}>
          <button
            className={`scene-chrome__network-trigger scene-chrome__network-trigger--root ${rootMenuOpen ? "is-open" : ""}`}
            type="button"
            aria-haspopup="listbox"
            aria-expanded={rootMenuOpen}
            onClick={() => {
              setRootMenuOpen((open) => !open);
              setDensityMenuOpen(false);
              setNetworkMenuOpen(false);
            }}
          >
            <span>Root: {audioSettings.root}</span>
            <span className="scene-chrome__network-caret" aria-hidden="true">
              ▾
            </span>
          </button>
          {rootMenuOpen ? (
            <div
              className="scene-chrome__network-panel scene-chrome__network-panel--up scene-chrome__network-panel--start"
              role="listbox"
              aria-label="Root note options"
            >
              {ROOT_OPTIONS.map((root) => {
                const isActive = audioSettings.root === root;
                return (
                  <button
                    key={root}
                    className={`scene-chrome__network-option ${isActive ? "is-active" : ""}`}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      setAudioSettings({ root });
                      setRootMenuOpen(false);
                    }}
                  >
                    <span className="scene-chrome__network-check" aria-hidden="true">
                      {isActive ? "✓" : ""}
                    </span>
                    {root}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="scene-chrome__density-menu" ref={densityMenuRef}>
          <button
            className={`scene-chrome__network-trigger ${densityMenuOpen ? "is-open" : ""}`}
            type="button"
            aria-haspopup="listbox"
            aria-expanded={densityMenuOpen}
            onClick={() => {
              setDensityMenuOpen((open) => !open);
              setRootMenuOpen(false);
              setNetworkMenuOpen(false);
            }}
          >
            <span>Density: {audioSettings.density}</span>
            <span className="scene-chrome__network-caret" aria-hidden="true">
              ▾
            </span>
          </button>
          {densityMenuOpen ? (
            <div
              className="scene-chrome__network-panel scene-chrome__network-panel--up scene-chrome__network-panel--start"
              role="listbox"
              aria-label="Density options"
            >
              {DENSITY_OPTIONS.map((density) => {
                const isSelected = audioSettings.density === density;
                return (
                  <button
                    key={density}
                    className={`scene-chrome__network-option ${isSelected ? "is-active" : ""}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      setAudioSettings({ density });
                      setDensityMenuOpen(false);
                    }}
                  >
                    <span className="scene-chrome__network-check" aria-hidden="true">
                      {isSelected ? "✓" : ""}
                    </span>
                    {density}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {showSecretPrompt ? (
        <div
          className={`scene-chrome__secret-overlay ${
            secretCue.phase === "playing" ? "is-playing" : ""
          }`}
          aria-hidden="true"
        >
          <div className="scene-chrome__secret-code">
            {secretPromptLetters.map((letter, index) => {
              const filled = index < secretCue.matchedText.length;
              return (
                <span
                  key={`${secretCue.word}-${index}`}
                  className={`scene-chrome__secret-slot ${filled ? "is-filled" : ""}`}
                >
                  {filled ? letter : ""}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      {overlayContent ? (
        <div
          className={`scene__empty-overlay scene-chrome__empty-overlay ${
            !isLiveDataUnavailable && emptyOverlayState === "closing"
              ? "scene__empty-overlay--closing"
              : ""
          }`}
          role="dialog"
          aria-modal="true"
          aria-live="polite"
        >
          <div
            className={`scene__empty-state scene-chrome__empty-state ${
              !isLiveDataUnavailable && emptyOverlayState === "closing"
                ? "scene__empty-state--closing"
                : ""
            }`}
          >
            <div className="scene__empty-mark" aria-hidden="true">
              <span className="scene__empty-mark-core" />
              <span className="scene__empty-mark-ring scene__empty-mark-ring--inner" />
              <span className="scene__empty-mark-ring scene__empty-mark-ring--mid" />
              <span className="scene__empty-mark-ring scene__empty-mark-ring--outer" />
            </div>
            <h2 className="scene__empty-title">{overlayContent.title}</h2>
            <p className="scene__empty-description">{overlayContent.description}</p>
            <button
              className="chrome-button scene__empty-dismiss"
              type="button"
              onClick={overlayContent.buttonAction}
            >
              {overlayContent.buttonLabel}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
