import { useMemo, useState } from "react";
import { useAppStore } from "../../state/app-store";
import "../../scenes/scenes.css";

export function WorldMapScene() {
  const nodes = useAppStore((state) => state.nodes);
  const selectNode = useAppStore((state) => state.selectNode);
  const [query, setQuery] = useState("");

  const filteredNodes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return nodes.slice(0, 6);
    }

    return nodes.filter((node) => {
      return (
        node.id.toLowerCase().includes(normalizedQuery) ||
        node.label.toLowerCase().includes(normalizedQuery) ||
        node.region.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [nodes, query]);

  const previewNode = filteredNodes[0] ?? null;

  return (
    <section className="scene scene--full">
      <div className="scene__overlay scene__overlay--top-right">
        <div className="scene__search-box">
          <input
            type="text"
            value={query}
            placeholder="Search ID or region..."
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="scene__action-controls">
          {filteredNodes.slice(0, 5).map((node) => (
            <button
              key={node.id}
              className="scene__list-button"
              type="button"
              onClick={() => selectNode(node.id)}
            >
              <span>{node.id}</span>
              <span>{node.region}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="scene__hint">Click a node to enter its local space</div>
    </section>
  );
}
