import { AccessibilitySystem, Application, Container } from "pixi.js";
import type { EchoEvent } from "@echo/contracts";
import { createWorldMapProjection, type WorldMapProjection } from "../../lib/map-projection";
import { createMapSceneLayer, findMapNodeAtPoint, renderMapScene } from "./pixi-map-scene";
import { createNodeSceneLayer, renderNodeScene } from "./pixi-node-scene";
import type { CollisionBurst, RenderSnapshot, VisualProfile } from "./pixi-types";

type PixiSurfaceOptions = {
  root: HTMLElement;
  selectNode: (nodeId: string) => void;
  appendEvent: (event: EchoEvent) => void;
  triggerEvent: (event: EchoEvent) => void;
  getVisualProfile: (event: EchoEvent, scene: "map" | "node") => VisualProfile;
};

export class PixiSurface {
  private readonly app = new Application();
  private readonly root = new Container();
  private readonly mapLayer = createMapSceneLayer();
  private readonly nodeLayer = createNodeSceneLayer();
  private readonly collisionHistory = new Map<string, number>();
  private readonly collisionAudioHistory = new Map<string, number>();
  private collisionBursts: CollisionBurst[] = [];
  private snapshot: RenderSnapshot = {
    activeScene: "map",
    mapSearchTransition: null,
    nodeSceneEnteredAt: null,
    nodes: [],
    selectedNodeId: null,
    recentEvents: []
  };
  private localLayoutSeed = 0;
  private hoveredNodeId: string | null = null;
  private width = window.innerWidth;
  private height = window.innerHeight;
  private dpr = Math.min(window.devicePixelRatio || 1, 2);
  private projection: WorldMapProjection = createWorldMapProjection(this.width, this.height);
  private destroyed = false;
  private initialized = false;
  private handlePointerMove: ((event: PointerEvent) => void) | null = null;
  private handleClick: ((event: MouseEvent) => void) | null = null;

  constructor(private readonly options: PixiSurfaceOptions) {}

  async init() {
    AccessibilitySystem.defaultOptions.activateOnTab = false;
    AccessibilitySystem.defaultOptions.enabledByDefault = false;

    await this.app.init({
      resizeTo: window,
      antialias: true,
      autoDensity: true,
      resolution: this.dpr,
      backgroundColor: 0x000000,
      eventMode: "passive"
    });

    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }

    this.initialized = true;
    (this.app.renderer as { accessibility?: { destroy?: () => void } }).accessibility?.destroy?.();

    this.options.root.appendChild(this.app.canvas);
    this.app.canvas.className = "render-surface";
    this.root.addChild(this.mapLayer.root, this.nodeLayer.root);
    this.app.stage.addChild(this.root);
    this.resize();
    this.bindPointerEvents();
    this.app.ticker.add(this.render);
  }

  setSnapshot(nextSnapshot: RenderSnapshot) {
    const shouldReseed =
      nextSnapshot.activeScene === "node" &&
      nextSnapshot.selectedNodeId &&
      (nextSnapshot.selectedNodeId !== this.snapshot.selectedNodeId ||
        this.snapshot.activeScene !== "node");

    if (shouldReseed) {
      this.localLayoutSeed = Math.random() * 100000;
      this.collisionHistory.clear();
      this.collisionAudioHistory.clear();
      this.collisionBursts = [];
    }

    if (nextSnapshot.activeScene !== "map") {
      this.hoveredNodeId = null;
    }

    this.snapshot = nextSnapshot;
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    if (!this.initialized) {
      return;
    }

    if (this.handlePointerMove) {
      this.app.canvas.removeEventListener("pointermove", this.handlePointerMove);
    }
    if (this.handleClick) {
      this.app.canvas.removeEventListener("click", this.handleClick);
    }
    window.removeEventListener("resize", this.resize);
    this.app.ticker.remove(this.render);
    this.app.destroy(true, { children: true });
  }

  private resize = () => {
    const nextWidth = window.innerWidth;
    const nextHeight = window.innerHeight;
    const nextDpr = Math.min(window.devicePixelRatio || 1, 2);

    if (nextWidth === this.width && nextHeight === this.height && nextDpr === this.dpr) {
      return;
    }

    this.width = nextWidth;
    this.height = nextHeight;
    this.dpr = nextDpr;
    this.projection = createWorldMapProjection(this.width, this.height);
  };

  private bindPointerEvents() {
    this.handlePointerMove = (event: PointerEvent) => {
      if (this.snapshot.activeScene !== "map") {
        this.app.canvas.style.cursor = "default";
        this.hoveredNodeId = null;
        return;
      }

      const node = findMapNodeAtPoint(
        this.snapshot.nodes,
        {
          now: Date.now(),
          time: performance.now(),
          width: this.width,
          height: this.height,
          dpr: this.dpr,
          projection: this.projection
        },
        event.clientX,
        event.clientY
      );

      this.hoveredNodeId = node?.id ?? null;
      this.app.canvas.style.cursor = node ? "pointer" : "default";
    };

    this.handleClick = (event: MouseEvent) => {
      if (this.snapshot.activeScene !== "map") {
        return;
      }

      const node = findMapNodeAtPoint(
        this.snapshot.nodes,
        {
          now: Date.now(),
          time: performance.now(),
          width: this.width,
          height: this.height,
          dpr: this.dpr,
          projection: this.projection
        },
        event.clientX,
        event.clientY
      );

      if (node) {
        this.options.selectNode(node.id);
      }
    };

    this.app.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.app.canvas.addEventListener("click", this.handleClick);
    window.addEventListener("resize", this.resize);
  }

  private readonly render = () => {
    if (this.destroyed) {
      return;
    }

    const context = {
      now: Date.now(),
      time: performance.now(),
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      projection: this.projection
    };

    this.mapLayer.root.visible = this.snapshot.activeScene === "map";
    this.nodeLayer.root.visible = this.snapshot.activeScene === "node";

    if (this.snapshot.activeScene === "map") {
      renderMapScene(this.mapLayer, this.snapshot, { hoveredNodeId: this.hoveredNodeId }, context, this.options.getVisualProfile);
      this.nodeLayer.root.visible = false;
      return;
    }

    this.mapLayer.root.visible = false;
    this.collisionBursts = renderNodeScene(
      this.nodeLayer,
      this.snapshot,
      context,
      this.localLayoutSeed,
      this.collisionHistory,
      this.collisionAudioHistory,
      this.collisionBursts,
      {
        emitCollisionEcho: (leftRipple, rightRipple, collisionKey) => {
          const collisionEvent: EchoEvent = {
            id: `collision-${collisionKey}`,
            type: "node_active",
            at: new Date().toISOString(),
            nodeId:
              leftRipple.intensity >= rightRipple.intensity ? leftRipple.nodeId : rightRipple.nodeId,
            intensity: 0.14,
            degreeHint: "yu",
            batchRole: "tail",
            source: "resonance",
            rippleLayer: Math.max(leftRipple.rippleLayer, rightRipple.rippleLayer) + 1
          };

          this.options.appendEvent(collisionEvent);
          this.options.triggerEvent(collisionEvent);
        }
      },
      this.options.getVisualProfile,
      2
    );
  };
}
