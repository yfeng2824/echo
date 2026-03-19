import "../../scenes/scenes.css";

export function WorldMapScene() {
  return (
    <section className="scene scene--full">
      <div className="scene__overlay scene__overlay--top-right">
        <div className="scene__search-box">
          <input
            type="text"
            placeholder="Search ID or region..."
            aria-label="Search nodes"
          />
        </div>
      </div>

      <div className="scene__hint">Click a node to enter its local space</div>
    </section>
  );
}
