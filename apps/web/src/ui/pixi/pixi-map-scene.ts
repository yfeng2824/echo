import { CanvasSource, Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import type { EchoEvent, EchoNode } from "@echo/contracts";
import { getDisplayNodeId } from "../../lib/node-id";
import { getMapSearchFocusState } from "./pixi-transition-layer";
import type { HoverState, RenderContext, RenderSnapshot, VisualProfile } from "./pixi-types";

type MapSceneLayer = {
  root: Container;
  mapSprite: Sprite;
  mapCanvas: HTMLCanvasElement;
  mapContext: CanvasRenderingContext2D | null;
  ripples: Graphics;
  halos: Graphics;
  cores: Graphics;
  label: Text;
};

export function createMapSceneLayer() {
  const root = new Container();
  const mapCanvas = document.createElement("canvas");
  const mapContext = mapCanvas.getContext("2d");
  const mapSprite = new Sprite(
    new Texture({
      source: new CanvasSource({
        resource: mapCanvas
      })
    })
  );
  const ripples = new Graphics();
  const halos = new Graphics();
  const cores = new Graphics();
  const label = new Text({
    text: "",
    style: new TextStyle({
      fontFamily: "Inter, sans-serif",
      fontSize: 10,
      fill: 0xffffff,
      letterSpacing: 0.3
    })
  });

  label.visible = false;
  label.alpha = 0.7;
  label.roundPixels = true;
  label.resolution = Math.min(window.devicePixelRatio || 1, 2);

  root.addChild(mapSprite, ripples, halos, cores, label);

  return {
    root,
    mapSprite,
    mapCanvas,
    mapContext,
    ripples,
    halos,
    cores,
    label
  } satisfies MapSceneLayer;
}

function updateMapTexture(layer: MapSceneLayer, context: RenderContext) {
  const targetWidth = Math.max(1, Math.floor(context.width * context.dpr));
  const targetHeight = Math.max(1, Math.floor(context.height * context.dpr));

  if (layer.mapCanvas.width !== targetWidth || layer.mapCanvas.height !== targetHeight) {
    layer.mapCanvas.width = targetWidth;
    layer.mapCanvas.height = targetHeight;
  }

  if (!layer.mapContext) {
    return;
  }

  layer.mapContext.setTransform(1, 0, 0, 1, 0, 0);
  layer.mapContext.clearRect(0, 0, targetWidth, targetHeight);
  // Draw the projection in CSS pixels while keeping a higher backing resolution.
  layer.mapContext.setTransform(context.dpr, 0, 0, context.dpr, 0, 0);
  context.projection.draw(layer.mapContext, 1);
  layer.mapContext.setTransform(1, 0, 0, 1, 0, 0);
  layer.mapSprite.texture.source.update();
  layer.mapSprite.position.set(0, 0);
  layer.mapSprite.width = context.width;
  layer.mapSprite.height = context.height;
}

function getNodeEvents(events: EchoEvent[], nodeId: string) {
  return events.filter((event) => event.nodeId === nodeId);
}

function getMapPosition(node: EchoNode, context: RenderContext) {
  return context.projection.project(node.lng, node.lat) ?? { x: context.width / 2, y: context.height / 2 };
}

export function findMapNodeAtPoint(
  nodes: EchoNode[],
  context: RenderContext,
  clientX: number,
  clientY: number
) {
  for (const node of nodes) {
    const { x, y } = getMapPosition(node, context);
    if (Math.hypot(clientX - x, clientY - y) < 14) {
      return node;
    }
  }

  return null;
}

export function renderMapScene(
  layer: MapSceneLayer,
  snapshot: RenderSnapshot,
  hoverState: HoverState,
  context: RenderContext,
  getVisualProfile: (event: EchoEvent, scene: "map" | "node") => VisualProfile
) {
  const { nodes, mapSearchTransition, recentEvents } = snapshot;
  const transitionNode = mapSearchTransition
    ? nodes.find((node) => node.id === mapSearchTransition.nodeId) ?? null
    : null;
  const { easedFocus } = getMapSearchFocusState(mapSearchTransition?.startedAt ?? null, context.now);
  const transitionPosition = transitionNode ? getMapPosition(transitionNode, context) : null;
  const focusDrift = transitionPosition
    ? {
        x: (context.width / 2 - transitionPosition.x) * easedFocus * 0.34,
        y: (context.height / 2 - transitionPosition.y) * easedFocus * 0.34
      }
    : { x: 0, y: 0 };

  layer.root.visible = true;
  layer.root.position.set(focusDrift.x, focusDrift.y);
  layer.root.pivot.set(context.width / 2, context.height / 2);
  layer.root.position.x += context.width / 2;
  layer.root.position.y += context.height / 2;
  layer.root.scale.set(1 + easedFocus * 0.14);

  updateMapTexture(layer, context);
  layer.mapSprite.alpha = 1;

  layer.ripples.clear();
  layer.halos.clear();
  layer.cores.clear();
  layer.label.visible = false;

  nodes.forEach((node, index) => {
    const { x, y } = getMapPosition(node, context);
    const nodeEvents = getNodeEvents(recentEvents, node.id);
    const isTransitionNode = transitionNode?.id === node.id;
    const activeRipples = nodeEvents
      .map((event) => {
        const profile = getVisualProfile(event, "map");
        const age = context.now - new Date(event.at).getTime();
        if (age < 0 || age > profile.duration) {
          return null;
        }

        return {
          intensity: event.intensity,
          progress: age / profile.duration,
          profile
        };
      })
      .filter(Boolean) as Array<{ intensity: number; progress: number; profile: VisualProfile }>;
    const visibleRipples = transitionNode ? (isTransitionNode ? activeRipples.slice(0, 1) : []) : activeRipples;
    const pulseEnergy = visibleRipples.reduce(
      (sum, ripple) => sum + (1 - ripple.progress) * ripple.intensity,
      0
    );
    const pulse = transitionNode
      ? isTransitionNode
        ? Math.max(0.22, Math.min(1.7, pulseEnergy + easedFocus * 0.4))
        : 0
      : Math.max(0.12, Math.min(1.4, pulseEnergy));
    const isHovered = hoverState.hoveredNodeId === node.id;
    const halo = 6 + (transitionNode ? 0 : Math.sin(context.time * 0.001 + index) * 2) + pulse * 16 + (isHovered ? 5 : 0) + (isTransitionNode ? easedFocus * 20 : 0);

    for (const ripple of visibleRipples) {
      const rippleRadius = 8 + ripple.progress * ripple.profile.radius;
      const rippleAlpha = (1 - ripple.progress) * ripple.profile.alpha * (isTransitionNode ? 0.45 : 1);
      layer.ripples.circle(x, y, rippleRadius);
      layer.ripples.stroke({ color: 0xffffff, alpha: rippleAlpha, width: 1 });
    }

    if (isTransitionNode) {
      const highlightRadius = 12 + easedFocus * 58;
      layer.halos.circle(x, y, highlightRadius);
      layer.halos.fill({ color: 0xffffff, alpha: 0.08 + easedFocus * 0.2 });
      layer.ripples.circle(x, y, 22 + easedFocus * 52);
      layer.ripples.stroke({ color: 0xffffff, alpha: 0.18 + easedFocus * 0.16, width: 1.8 });
    }

    layer.halos.circle(x, y, halo);
    layer.halos.fill({
      color: 0xffffff,
      alpha: transitionNode
        ? isTransitionNode
          ? 0.06 + pulse * 0.12
          : 0.02
        : 0.04 + pulse * 0.1 + (isHovered ? 0.06 : 0)
    });

    layer.cores.circle(x, y, (isHovered ? 4 : 3) + Math.min(2, pulse * 1.5));
    layer.cores.fill({
      color: 0xffffff,
      alpha: transitionNode ? (isTransitionNode ? 0.96 : 0.34) : 0.85
    });

    if (!transitionNode && isHovered) {
      layer.label.text = getDisplayNodeId(node.id);
      layer.label.x = x + halo + 6;
      layer.label.y = y - 6;
      layer.label.visible = true;
    }
  });
}
