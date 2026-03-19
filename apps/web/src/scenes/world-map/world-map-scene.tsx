import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../../state/app-store";
import { findNodeByQuery } from "../../lib/network";
import "../../scenes/scenes.css";

type SearchState = "idle" | "loading" | "empty";
type EmptyOverlayState = "idle" | "visible" | "closing";

export function WorldMapScene() {
  const nodes = useAppStore((state) => state.nodes);
  const mapSearchTransition = useAppStore((state) => state.mapSearchTransition);
  const selectNode = useAppStore((state) => state.selectNode);
  const startMapSearchTransition = useAppStore((state) => state.startMapSearchTransition);
  const clearMapSearchTransition = useAppStore((state) => state.clearMapSearchTransition);
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [emptyOverlayState, setEmptyOverlayState] = useState<EmptyOverlayState>("idle");
  const loadingTimeoutRef = useRef<number | null>(null);
  const dismissTimeoutRef = useRef<number | null>(null);
  const foundTransitionTimeoutRef = useRef<number | null>(null);
  const isSearchLocked = mapSearchTransition !== null;

  const cancelSearchTimers = () => {
    if (loadingTimeoutRef.current) {
      window.clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }

    if (foundTransitionTimeoutRef.current) {
      window.clearTimeout(foundTransitionTimeoutRef.current);
      foundTransitionTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      cancelSearchTimers();
      if (dismissTimeoutRef.current) {
        window.clearTimeout(dismissTimeoutRef.current);
      }
    };
  }, []);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSearchLocked) {
      return;
    }

    cancelSearchTimers();

    if (!query.trim()) {
      setSearchState("idle");
      clearMapSearchTransition();
      return;
    }

    const matchedNode = findNodeByQuery(nodes, query);

    setSearchState("loading");

    // Hold a short loading beat so the inline search animation is perceptible.
    loadingTimeoutRef.current = window.setTimeout(() => {
      loadingTimeoutRef.current = null;

      if (matchedNode) {
        setSearchState("idle");
        setEmptyOverlayState("idle");
        clearMapSearchTransition();
        startMapSearchTransition(matchedNode.id);

        foundTransitionTimeoutRef.current = window.setTimeout(() => {
          foundTransitionTimeoutRef.current = null;
          selectNode(matchedNode.id);
        }, 950);
        return;
      }

      clearMapSearchTransition();
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

  return (
    <section className="scene scene--full">
      <div className="scene__overlay scene__overlay--top-right">
        <form className="scene__search-box" onSubmit={handleSubmit}>
          <input
            type="text"
            value={query}
            placeholder="Search node ID..."
            aria-label="Search nodes"
            onChange={handleChange}
            autoComplete="off"
            disabled={isSearchLocked}
          />
          <span
            className={`scene__search-loader ${
              searchState === "loading" ? "scene__search-loader--visible" : ""
            }`}
            aria-hidden="true"
          />
        </form>
      </div>

      {searchState === "empty" ? (
        <div
          className={`scene__empty-overlay ${
            emptyOverlayState === "closing" ? "scene__empty-overlay--closing" : ""
          }`}
          role="dialog"
          aria-modal="true"
          aria-live="polite"
        >
          <div
            className={`scene__empty-state ${
              emptyOverlayState === "closing" ? "scene__empty-state--closing" : ""
            }`}
          >
            <div className="scene__empty-mark" aria-hidden="true">
              <span className="scene__empty-mark-core" />
              <span className="scene__empty-mark-ring scene__empty-mark-ring--inner" />
              <span className="scene__empty-mark-ring scene__empty-mark-ring--mid" />
              <span className="scene__empty-mark-ring scene__empty-mark-ring--outer" />
            </div>
            <h2 className="scene__empty-title">No echo found</h2>
            <p className="scene__empty-description">
              We couldn&apos;t find a matching node in the current network.
            </p>
            <button
              className="chrome-button scene__empty-dismiss"
              type="button"
              onClick={handleDismissEmptyState}
            >
              Back to map
            </button>
          </div>
        </div>
      ) : null}

      <div className="scene__hint">Click a node to enter its local space</div>
    </section>
  );
}
