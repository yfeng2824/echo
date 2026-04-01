import { AccessibilitySystem, Application, Container } from "pixi.js";
import type { EchoEvent } from "@echo/contracts";
import { createWorldMapProjection, type WorldMapProjection } from "../../lib/map-projection";
import { getNodeViewLayoutSeed } from "../../lib/node-view-layout";
import { createMapSceneLayer, findMapNodeAtPoint, renderMapScene } from "./pixi-map-scene";
import type { NodeSceneLayer } from "./pixi-node-scene";
import type { CollisionBurst, RenderSnapshot, VisualProfile } from "./pixi-types";

const MAX_COLLISION_HISTORY_SIZE = 2000;
const MAX_COLLISION_BURSTS = 200;

type PixiSurfaceOptions = {
  root: HTMLElement;
  selectNode: (nodeId: string) => void;
  appendEvent: (event: EchoEvent) => void;
  triggerEvent: (event: EchoEvent) => void;
  getVisualProfile: (event: EchoEvent, scene: "map" | "node") => VisualProfile;
};

type NodeSceneModule = typeof import("./pixi-node-scene");

export class PixiSurface {
  private readonly app = new Application();
  private readonly root = new Container();
  private readonly mapLayer = createMapSceneLayer();
  private readonly collisionHistory = new Map<string, number>();
  private nodeLayer: NodeSceneLayer | null = null;
  private nodeSceneModule: NodeSceneModule | null = null;
  private nodeSceneModulePromise: Promise<NodeSceneModule> | null = null;
  private collisionBursts: CollisionBurst[] = [];
  private snapshot: RenderSnapshot = {
    activeScene: "map",
    mapSearchTransition: null,
    nodeSceneEnteredAt: null,
    nodes: [],
    channels: [],
    selectedNodeId: null,
    recentEvents: [],
    secretCue: {
      phase: "idle",
      word: null,
      matchedText: "",
      startedAt: null,
      expiresAt: null,
      promptCollapseAt: null,
      promptReleaseAt: null,
      promptHideAt: null,
    },
  };
  private localLayoutSeed = 0;
  private hoveredNodeId: string | null = null;
  private hoveredPeerNodeId: string | null = null;
  private nodeSceneTransition: {
    fromNodeId: string;
    toNodeId: string;
    startedAt: number;
  } | null = null;
  private width = 0;
  private height = 0;
  private dpr = 0;
  private projection: WorldMapProjection = createWorldMapProjection(1, 1);
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;
  private initialized = false;
  private handlePointerMove: ((event: PointerEvent) => void) | null = null;
  private handleClick: ((event: MouseEvent) => void) | null = null;
  private handlePointerLeave: (() => void) | null = null;

  constructor(private readonly options: PixiSurfaceOptions) {}

  async init() {
    AccessibilitySystem.defaultOptions.activateOnTab = false;
    AccessibilitySystem.defaultOptions.enabledByDefault = false;

    await this.app.init({
      antialias: true,
      autoDensity: true,
      resolution: this.dpr,
      backgroundColor: 0x000000,
      eventMode: "passive",
    });

    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }

    this.initialized = true;
    (this.app.renderer as { accessibility?: { destroy?: () => void } }).accessibility?.destroy?.();

    this.options.root.appendChild(this.app.canvas);
    this.app.canvas.className = "render-surface-canvas";
    this.root.addChild(this.mapLayer.root);
    this.app.stage.addChild(this.root);
    this.syncViewportSize();
    this.bindPointerEvents();
    this.app.ticker.add(this.render);
  }

  setSnapshot(nextSnapshot: RenderSnapshot) {
    const shouldReseed =
      nextSnapshot.activeScene === "node" &&
      nextSnapshot.selectedNodeId &&
      this.snapshot.activeScene !== "node";

    const nodeSceneSelectionChanged =
      this.snapshot.activeScene === "node" &&
      nextSnapshot.activeScene === "node" &&
      this.snapshot.selectedNodeId !== null &&
      nextSnapshot.selectedNodeId !== null &&
      nextSnapshot.selectedNodeId !== this.snapshot.selectedNodeId;

    if ((shouldReseed || nodeSceneSelectionChanged) && nextSnapshot.selectedNodeId) {
      this.localLayoutSeed = getNodeViewLayoutSeed(nextSnapshot.selectedNodeId);
    }

    if (shouldReseed || nodeSceneSelectionChanged) {
      this.collisionHistory.clear();
      this.collisionBursts = [];
    }

    if (nodeSceneSelectionChanged) {
      const fromNodeId = this.snapshot.selectedNodeId;
      const toNodeId = nextSnapshot.selectedNodeId;
      if (!fromNodeId || !toNodeId) {
        this.nodeSceneTransition = null;
      } else {
        this.nodeSceneTransition = {
          fromNodeId,
          toNodeId,
          startedAt: Date.now(),
        };
      }
    } else if (nextSnapshot.activeScene !== "node") {
      this.nodeSceneTransition = null;
    }

    if (nextSnapshot.activeScene !== "map") {
      this.hoveredNodeId = null;
    }
    if (nextSnapshot.activeScene !== "node") {
      this.hoveredPeerNodeId = null;
    }
    if (nextSnapshot.selectedNodeId !== this.snapshot.selectedNodeId) {
      this.hoveredPeerNodeId = null;
    }

    this.snapshot = nextSnapshot;

    if (nextSnapshot.activeScene === "node") {
      void this.ensureNodeSceneModule();
    }
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
    if (this.handlePointerLeave) {
      this.app.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.app.ticker.remove(this.render);
    this.app.destroy(true, { children: true });
  }

  private syncViewportSize = () => {
    const rect = this.options.root.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(rect.width));
    const nextHeight = Math.max(1, Math.round(rect.height));
    const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
    const rendererWidth = Math.round(this.app.renderer.screen.width);
    const rendererHeight = Math.round(this.app.renderer.screen.height);
    const rendererDpr = this.app.renderer.resolution;
    const viewportUnchanged =
      nextWidth === this.width && nextHeight === this.height && nextDpr === this.dpr;
    const rendererMatchesViewport =
      !this.initialized ||
      (rendererWidth === nextWidth &&
        rendererHeight === nextHeight &&
        Math.abs(rendererDpr - nextDpr) < 0.001);

    if (viewportUnchanged && rendererMatchesViewport) {
      return;
    }

    this.width = nextWidth;
    this.height = nextHeight;
    this.dpr = nextDpr;
    if (this.initialized) {
      this.app.renderer.resize(nextWidth, nextHeight, nextDpr);
    }
    this.projection = createWorldMapProjection(this.width, this.height);
  };

  private getRenderContext(now = Date.now(), time = performance.now()) {
    return {
      now,
      time,
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      projection: this.projection,
    };
  }

  private ensureNodeSceneModule() {
    if (this.nodeSceneModule) {
      return Promise.resolve(this.nodeSceneModule);
    }

    if (!this.nodeSceneModulePromise) {
      this.nodeSceneModulePromise = import("./pixi-node-scene").then((module) => {
        this.nodeSceneModule = module;

        if (!this.destroyed && !this.nodeLayer) {
          this.nodeLayer = module.createNodeSceneLayer();
          this.nodeLayer.root.visible = this.snapshot.activeScene === "node";
          this.root.addChild(this.nodeLayer.root);
        }

        return module;
      });
    }

    return this.nodeSceneModulePromise;
  }

  private findPeerNodeAtPointer(
    clientX: number,
    clientY: number,
    options?: {
      preferredNodeId?: string | null;
      hitRadius?: number;
      stickiness?: number;
    }
  ) {
    if (!this.nodeSceneModule) {
      return null;
    }

    return this.nodeSceneModule.findNodeScenePeerAtPoint(
      this.snapshot,
      this.getRenderContext(),
      this.localLayoutSeed,
      clientX,
      clientY,
      options
    );
  }

  private bindPointerEvents() {
    this.handlePointerMove = (event: PointerEvent) => {
      if (this.snapshot.activeScene !== "map") {
        if (this.snapshot.activeScene === "node") {
          const peerNode = this.findPeerNodeAtPointer(event.clientX, event.clientY, {
            preferredNodeId: this.hoveredPeerNodeId,
            hitRadius: 22,
            stickiness: 10,
          });

          this.hoveredPeerNodeId = peerNode?.id ?? null;
          this.app.canvas.style.cursor = peerNode ? "pointer" : "default";
          return;
        }

        this.app.canvas.style.cursor = "default";
        this.hoveredNodeId = null;
        this.hoveredPeerNodeId = null;
        return;
      }

      const node = findMapNodeAtPoint(
        this.snapshot.nodes,
        this.getRenderContext(),
        event.clientX,
        event.clientY,
        {
          preferredNodeId: this.hoveredNodeId,
          hitRadius: 16,
          stickiness: 8,
        }
      );

      this.hoveredNodeId = node?.id ?? null;
      this.app.canvas.style.cursor = node ? "pointer" : "default";
    };

    this.handleClick = (event: MouseEvent) => {
      if (this.snapshot.activeScene !== "map") {
        if (this.snapshot.activeScene === "node") {
          const peerNode = this.findPeerNodeAtPointer(event.clientX, event.clientY, {
            hitRadius: 24,
          });

          if (peerNode) {
            this.options.selectNode(peerNode.id);
          }
        }
        return;
      }

      const node = findMapNodeAtPoint(
        this.snapshot.nodes,
        this.getRenderContext(),
        event.clientX,
        event.clientY,
        {
          hitRadius: 18,
        }
      );

      if (node) {
        this.options.selectNode(node.id);
      }
    };

    this.handlePointerLeave = () => {
      this.hoveredNodeId = null;
      this.hoveredPeerNodeId = null;
      this.app.canvas.style.cursor = "default";
    };

    this.app.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.app.canvas.addEventListener("click", this.handleClick);
    this.app.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    this.resizeObserver = new ResizeObserver(() => {
      this.syncViewportSize();
    });
    this.resizeObserver.observe(this.options.root);
  }

  private readonly render = () => {
    if (this.destroyed) {
      return;
    }

    // Keep projection synced even when layout changes without a window resize event.
    this.syncViewportSize();

    const context = this.getRenderContext();

    this.mapLayer.root.visible = this.snapshot.activeScene === "map";
    if (this.nodeLayer) {
      this.nodeLayer.root.visible = this.snapshot.activeScene === "node";
    }

    if (this.snapshot.activeScene === "map") {
      renderMapScene(
        this.mapLayer,
        this.snapshot,
        { hoveredNodeId: this.hoveredNodeId },
        context,
        this.options.getVisualProfile
      );
      if (this.nodeLayer) {
        this.nodeLayer.root.visible = false;
      }
      return;
    }

    void this.ensureNodeSceneModule();

    if (!this.nodeSceneModule || !this.nodeLayer) {
      this.mapLayer.root.visible = false;
      return;
    }

    this.mapLayer.root.visible = false;
    this.collisionBursts = this.nodeSceneModule.renderNodeScene(
      this.nodeLayer,
      this.snapshot,
      { hoveredPeerNodeId: this.hoveredPeerNodeId },
      this.nodeSceneTransition,
      context,
      this.localLayoutSeed,
      this.collisionHistory,
      this.collisionBursts,
      {
        emitCollisionEcho: (leftRipple, rightRipple, collisionKey) => {
          const collisionEvent: EchoEvent = {
            id: `collision-${collisionKey}`,
            type: "node_active",
            at: new Date().toISOString(),
            nodeId:
              leftRipple.intensity >= rightRipple.intensity
                ? leftRipple.nodeId
                : rightRipple.nodeId,
            intensity: 0.14,
            batchRole: "tail",
            source: "resonance",
            rippleLayer: Math.max(leftRipple.rippleLayer, rightRipple.rippleLayer) + 1,
          };

          this.options.appendEvent(collisionEvent);
          this.options.triggerEvent(collisionEvent);
        },
      },
      this.options.getVisualProfile,
      2
    );

    // Evict oldest collision history entries to prevent unbounded memory growth.
    if (this.collisionHistory.size > MAX_COLLISION_HISTORY_SIZE) {
      const entries = [...this.collisionHistory.entries()]
        .sort((a, b) => a[1] - b[1])
        .slice(0, this.collisionHistory.size - MAX_COLLISION_HISTORY_SIZE);
      for (const [key] of entries) {
        this.collisionHistory.delete(key);
      }
    }

    if (this.collisionBursts.length > MAX_COLLISION_BURSTS) {
      this.collisionBursts = this.collisionBursts.slice(-MAX_COLLISION_BURSTS);
    }
  };
}
