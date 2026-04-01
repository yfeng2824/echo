import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AudioDensity, SecretCueWord } from "@echo/contracts";
import { useAppStore } from "../state/app-store";
import { findNodeByQuery } from "../lib/network";
import { ROOT_OPTIONS } from "../lib/pentatonic";
import "./scene-chrome.css";

type SearchState = "idle" | "loading" | "empty";
type EmptyOverlayState = "idle" | "visible" | "closing";
type CountInfoKey = "announcedNodes" | "activeChannels";
type TooltipStyle = {
  left: number;
  top: number;
};
type OverlayContent = {
  title: string;
  description: string;
  buttonLabel: string;
  buttonAction: () => void;
  secondaryLinkLabel?: string;
  secondaryLinkHref?: string;
};
type NetworkOption = {
  value: "mainnet" | "testnet";
  label: string;
};

const DENSITY_OPTIONS: AudioDensity[] = ["sparse", "balanced", "rich"];
const NETWORK_OPTIONS: NetworkOption[] = [
  { value: "testnet", label: "Testnet" },
  { value: "mainnet", label: "Mainnet" },
];
const RUN_NODE_GUIDE_URL = "https://www.fiber.world/docs/quick-start/run-a-node";
const DESKTOP_SHORTCUT_MEDIA_QUERY = "(min-width: 1200px)";
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

function getNetworkLabel(network: "mainnet" | "testnet") {
  return network === "mainnet" ? "Mainnet" : "Testnet";
}

function getCountTooltipCopy(infoKey: CountInfoKey) {
  if (infoKey === "announcedNodes") {
    return "Nodes currently announced to the network and eligible to appear on the map.";
  }

  return "All non-closed channels in the current network, including channels that may not be drawable when one endpoint is unannounced.";
}

function getTooltipStyle(triggerRect: DOMRect, tooltipRect: DOMRect): TooltipStyle {
  const spacing = 8;
  const viewportPadding = 8;
  const centeredLeft = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
  const left = Math.min(
    Math.max(viewportPadding, centeredLeft),
    window.innerWidth - tooltipRect.width - viewportPadding
  );

  let top = triggerRect.top - tooltipRect.height - spacing;
  if (top < viewportPadding) {
    top = Math.min(
      triggerRect.bottom + spacing,
      window.innerHeight - tooltipRect.height - viewportPadding
    );
  }

  return { left, top };
}

function getCountLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function SceneChrome() {
  const activeScene = useAppStore((state) => state.activeScene);
  const audioEnabled = useAppStore((state) => state.audioEnabled);
  const audioSettings = useAppStore((state) => state.audioSettings);
  const currentNetwork = useAppStore((state) => state.currentNetwork);
  const invalidNodeRouteId = useAppStore((state) => state.invalidNodeRouteId);
  const networkStatus = useAppStore((state) => state.networkStatus);
  const networkError = useAppStore((state) => state.networkError);
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
  const [showDesktopShortcutHints, setShowDesktopShortcutHints] = useState(false);
  const [soundTooltipStyle, setSoundTooltipStyle] = useState<TooltipStyle | null>(null);
  const [activeCountTooltip, setActiveCountTooltip] = useState<CountInfoKey | null>(null);
  const [countTooltipStyle, setCountTooltipStyle] = useState<TooltipStyle | null>(null);
  const [networkMenuVertical, setNetworkMenuVertical] = useState<"down" | "up">("down");
  const [networkMenuHorizontal, setNetworkMenuHorizontal] = useState<"end" | "start">("end");
  const announcedCountRef = useRef<HTMLButtonElement | null>(null);
  const activeChannelCountRef = useRef<HTMLButtonElement | null>(null);
  const countTooltipRef = useRef<HTMLDivElement | null>(null);

  const { announcedNodeCount, channelCount } = headlineCounts;
  const networkLabel = getNetworkLabel(currentNetwork);
  const showCountSkeleton = networkStatus === "loading" || networkTransitionVisible;
  const isSearchLocked = activeScene === "map" && mapSearchTransition !== null;
  const isLiveDataUnavailable = networkStatus === "unavailable";
  const hasRenderedTopology = nodes.length > 0;
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
  const showSearchHelper =
    isSearchFocused &&
    !query.trim() &&
    searchState !== "loading" &&
    !hasBlockingOverlay &&
    !networkTransitionVisible;
  const countSummaryItems = useMemo(
    () => [
      {
        key: "announcedNodes" as const,
        ref: announcedCountRef,
        ariaLabel: "Explain announced nodes",
        label: getCountLabel(announcedNodeCount, "Announced Node", "Announced Nodes"),
      },
      {
        key: "activeChannels" as const,
        ref: activeChannelCountRef,
        ariaLabel: "Explain active channels",
        label: getCountLabel(channelCount, "Active Channel", "Active Channels"),
      },
    ],
    [announcedNodeCount, channelCount]
  );

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

  const closeAllMenus = useCallback(() => {
    setNetworkMenuOpen(false);
    setDensityMenuOpen(false);
    setRootMenuOpen(false);
    setMobileControlsMenuOpen(false);
  }, []);

  const handleInvalidRouteBack = useCallback(() => {
    setInvalidNodeRouteId(null);
    goToMap();
  }, [goToMap, setInvalidNodeRouteId]);

  const handleNetworkSelection = useCallback(
    (nextNetwork: NetworkOption["value"], source: "desktop" | "mobile") => {
      setNetwork(nextNetwork);

      if (source === "desktop") {
        setNetworkMenuOpen(false);
        return;
      }

      setMobileControlsMenuOpen(false);
    },
    [setNetwork]
  );

  const handleRootSelection = useCallback(
    (root: (typeof ROOT_OPTIONS)[number], closeMenu = false) => {
      setAudioSettings({ root });
      if (closeMenu) {
        setRootMenuOpen(false);
      }
    },
    [setAudioSettings]
  );

  const handleDensitySelection = useCallback(
    (density: AudioDensity, closeMenu = false) => {
      setAudioSettings({ density });
      if (closeMenu) {
        setDensityMenuOpen(false);
      }
    },
    [setAudioSettings]
  );

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
  }, [cancelSearchTimers]);

  useEffect(() => {
    const previousScene = previousSceneRef.current;
    previousSceneRef.current = activeScene;

    if (previousScene === "node" && activeScene === "map") {
      resetSearchUi();
    }

    if (activeScene !== "map") {
      setIsSearchFocused(false);
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
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(DESKTOP_SHORTCUT_MEDIA_QUERY);
    const syncDesktopShortcutHints = (matches: boolean) => {
      setShowDesktopShortcutHints(matches);
      if (!matches) {
        setShowSoundTooltip(false);
      }
    };

    syncDesktopShortcutHints(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      syncDesktopShortcutHints(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

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

      setSoundTooltipStyle(getTooltipStyle(buttonRect, tooltipRect));
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
    if (!activeCountTooltip) {
      return;
    }

    const updateCountTooltipPosition = () => {
      const trigger = countSummaryItems.find((item) => item.key === activeCountTooltip)?.ref
        .current;
      const triggerRect = trigger?.getBoundingClientRect();
      const tooltipRect = countTooltipRef.current?.getBoundingClientRect();
      if (!triggerRect || !tooltipRect) {
        return;
      }

      setCountTooltipStyle(getTooltipStyle(triggerRect, tooltipRect));
    };

    const handleWindowPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const interactingWithTrigger = countSummaryItems.some((item) =>
        item.ref.current?.contains(target)
      );
      if (interactingWithTrigger || countTooltipRef.current?.contains(target)) {
        return;
      }

      setActiveCountTooltip(null);
    };

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveCountTooltip(null);
      }
    };

    const frame = window.requestAnimationFrame(updateCountTooltipPosition);
    window.addEventListener("resize", updateCountTooltipPosition);
    window.addEventListener("scroll", updateCountTooltipPosition, true);
    window.addEventListener("pointerdown", handleWindowPointerDown);
    window.addEventListener("keydown", handleWindowKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateCountTooltipPosition);
      window.removeEventListener("scroll", updateCountTooltipPosition, true);
      window.removeEventListener("pointerdown", handleWindowPointerDown);
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [activeCountTooltip, countSummaryItems]);

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
        closeAllMenus();
      }
    };

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeAllMenus();
      }
    };

    const handleViewportChange = () => {
      closeAllMenus();
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
  }, [closeAllMenus, densityMenuOpen, mobileControlsMenuOpen, networkMenuOpen, rootMenuOpen]);

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
      title: hasRenderedTopology ? "Live feed interrupted" : "No live echo detected",
      description: networkError
        ? `Live network activity is not available right now. ${networkError}.`
        : "Live network activity is not available right now.",
      buttonLabel: "Retry",
      buttonAction: () => window.location.reload(),
    };
  } else if (invalidNodeRouteId || searchState === "empty") {
    const isInvalidRouteOverlay = invalidNodeRouteId !== null;

    overlayContent = {
      title: "No echo found",
      description: `We couldn't find a matching announced node in ${networkLabel}. To make your node announced, enable announce_listening_addr and add your public address to announced_addrs.`,
      buttonLabel: "Return to map",
      buttonAction: isInvalidRouteOverlay ? handleInvalidRouteBack : handleDismissEmptyState,
      secondaryLinkLabel: "Want to join the soundscape? ",
      secondaryLinkHref: RUN_NODE_GUIDE_URL,
    };
  }

  const showSecretPrompt =
    activeScene === "map" && secretCue.word !== null && secretCue.phase !== "idle";
  const secretPromptLetters = secretCue.word?.toUpperCase().split("") ?? [];

  return (
    <>
      <div className="scene-chrome scene-chrome--top-bar">
        <header className="scene-chrome__top-region scene-chrome--top-left">
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
                <div className="scene-chrome__meta">
                  {countSummaryItems.map((item, index) => (
                    <Fragment key={item.key}>
                      {index > 0 ? (
                        <span className="scene-chrome__meta-divider" aria-hidden="true">
                          •
                        </span>
                      ) : null}
                      <button
                        ref={item.ref}
                        className={`scene-chrome__meta-button ${
                          activeCountTooltip === item.key ? "is-active" : ""
                        }`}
                        type="button"
                        aria-label={item.ariaLabel}
                        aria-expanded={activeCountTooltip === item.key}
                        onMouseEnter={() => setActiveCountTooltip(item.key)}
                        onMouseLeave={() => setActiveCountTooltip(null)}
                        onFocus={() => setActiveCountTooltip(item.key)}
                        onBlur={() => setActiveCountTooltip(null)}
                        onClick={() =>
                          setActiveCountTooltip((current) =>
                            current === item.key ? null : item.key
                          )
                        }
                      >
                        {item.label}
                      </button>
                    </Fragment>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="scene-chrome__top-region scene-chrome--top-center">
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
              disabled={isSearchLocked || networkTransitionVisible || isLiveDataUnavailable}
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
            {showSearchHelper ? (
              <p className="scene-chrome__search-helper" aria-live="polite">
                Echo finds announced node IDs in the current network.
              </p>
            ) : null}
          </form>
        </div>

        <div
          className={`scene-chrome__top-region scene-chrome--top-right ${audioEnabled ? "is-active" : ""}`}
        >
          <div className="scene-chrome__sound-control">
            <button
              ref={soundButtonRef}
              className={`chrome-button ${audioEnabled ? "is-active" : ""}`}
              type="button"
              onClick={toggleAudio}
              onMouseEnter={() => showDesktopShortcutHints && setShowSoundTooltip(true)}
              onMouseLeave={() => setShowSoundTooltip(false)}
              onFocus={() => showDesktopShortcutHints && setShowSoundTooltip(true)}
              onBlur={() => setShowSoundTooltip(false)}
            >
              Sound: {audioEnabled ? "On" : "Off"}
            </button>
            {showDesktopShortcutHints && showSoundTooltip ? (
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
                setMobileControlsMenuOpen(false);
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
                {NETWORK_OPTIONS.map((option) => {
                  const isActive = currentNetwork === option.value;
                  return (
                    <button
                      key={option.value}
                      className={`scene-chrome__network-option ${isActive ? "is-active" : ""}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => handleNetworkSelection(option.value, "desktop")}
                    >
                      <span className="scene-chrome__network-check" aria-hidden="true">
                        {isActive ? "✓" : ""}
                      </span>
                      {option.label}
                    </button>
                  );
                })}
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
                          onClick={() => handleRootSelection(root)}
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
                    {NETWORK_OPTIONS.map((option) => {
                      const isActive = currentNetwork === option.value;
                      return (
                        <button
                          key={`mobile-network-${option.value}`}
                          className={`scene-chrome__mobile-network-option ${
                            isActive ? "is-active" : ""
                          }`}
                          type="button"
                          onClick={() => handleNetworkSelection(option.value, "mobile")}
                        >
                          <span className="scene-chrome__mobile-network-check" aria-hidden="true">
                            {isActive ? "✓" : ""}
                          </span>
                          {option.label}
                        </button>
                      );
                    })}
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
                          className={`scene-chrome__mobile-network-option ${
                            isSelected ? "is-active" : ""
                          }`}
                          type="button"
                          onClick={() => handleDensitySelection(density)}
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
              setMobileControlsMenuOpen(false);
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
                    onClick={() => handleRootSelection(root, true)}
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
              setMobileControlsMenuOpen(false);
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
                    onClick={() => handleDensitySelection(density, true)}
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

      {activeCountTooltip ? (
        <div
          ref={countTooltipRef}
          className="scene-chrome__tooltip scene-chrome__tooltip--meta"
          role="tooltip"
          style={
            countTooltipStyle
              ? {
                  left: `${countTooltipStyle.left}px`,
                  top: `${countTooltipStyle.top}px`,
                }
              : undefined
          }
        >
          {getCountTooltipCopy(activeCountTooltip)}
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
            {overlayContent.secondaryLinkLabel && overlayContent.secondaryLinkHref ? (
              <p className="scene-chrome__empty-link">
                {overlayContent.secondaryLinkLabel}
                <a
                  className="scene-chrome__empty-link-anchor"
                  href={overlayContent.secondaryLinkHref}
                  target="_blank"
                  rel="noreferrer"
                >
                  Run a Fiber node.
                </a>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
