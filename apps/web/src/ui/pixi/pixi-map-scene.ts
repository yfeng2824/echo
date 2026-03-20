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

type MapNodeLayout = {
  anchorX: number;
  anchorY: number;
  x: number;
  y: number;
};

const MAP_STACK_THRESHOLD_PX = 6;
const MAP_STACK_BASE_RADIUS_PX = 8;
const MAP_STACK_RING_STEP_PX = 7;
const MAP_STACK_RING_CAPACITY = 6;

function buildMapNodeLayout(nodes: EchoNode[], context: RenderContext) {
  const projectedNodes = nodes.map((node) => {
    const projected = getMapPosition(node, context);
    return {
      node,
      x: projected.x,
      y: projected.y
    };
  });

  const parents = projectedNodes.map((_, index) => index);

  const find = (index: number): number => {
    if (parents[index] !== index) {
      parents[index] = find(parents[index]);
    }

    return parents[index];
  };

  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);

    if (leftRoot !== rightRoot) {
      parents[rightRoot] = leftRoot;
    }
  };

  for (let left = 0; left < projectedNodes.length; left += 1) {
    for (let right = left + 1; right < projectedNodes.length; right += 1) {
      const deltaX = projectedNodes[left].x - projectedNodes[right].x;
      const deltaY = projectedNodes[left].y - projectedNodes[right].y;
      if (Math.hypot(deltaX, deltaY) <= MAP_STACK_THRESHOLD_PX) {
        union(left, right);
      }
    }
  }

  const groups = new Map<number, typeof projectedNodes>();
  projectedNodes.forEach((entry, index) => {
    const root = find(index);
    const existing = groups.get(root);
    if (existing) {
      existing.push(entry);
    } else {
      groups.set(root, [entry]);
    }
  });

  const layout = new Map<string, MapNodeLayout>();

  groups.forEach((group) => {
    const anchorX = group.reduce((sum, entry) => sum + entry.x, 0) / group.length;
    const anchorY = group.reduce((sum, entry) => sum + entry.y, 0) / group.length;
    const sortedGroup = [...group].sort((left, right) => left.node.id.localeCompare(right.node.id));

    if (sortedGroup.length === 1) {
      layout.set(sortedGroup[0].node.id, {
        anchorX,
        anchorY,
        x: anchorX,
        y: anchorY
      });
      return;
    }

    let slotOffset = 0;
    let remaining = sortedGroup.length;
    let ringIndex = 0;

    while (remaining > 0) {
      const ringCount = Math.min(remaining, MAP_STACK_RING_CAPACITY * (ringIndex === 0 ? 1 : 2));
      const radius = MAP_STACK_BASE_RADIUS_PX + ringIndex * MAP_STACK_RING_STEP_PX;
      const ringRotation = ringIndex % 2 === 0 ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / ringCount;

      for (let index = 0; index < ringCount; index += 1) {
        const entry = sortedGroup[slotOffset + index];
        const angle = ringRotation + (Math.PI * 2 * index) / ringCount;

        layout.set(entry.node.id, {
          anchorX,
          anchorY,
          x: anchorX + Math.cos(angle) * radius,
          y: anchorY + Math.sin(angle) * radius
        });
      }

      slotOffset += ringCount;
      remaining -= ringCount;
      ringIndex += 1;
    }
  });

  return layout;
}

export function findMapNodeAtPoint(
  nodes: EchoNode[],
  context: RenderContext,
  clientX: number,
  clientY: number
) {
  const layout = buildMapNodeLayout(nodes, context);

  for (const node of nodes) {
    const position = layout.get(node.id);
    const x = position?.x ?? context.width / 2;
    const y = position?.y ?? context.height / 2;
    if (Math.hypot(clientX - x, clientY - y) < 14) {
      return node;
    }
  }

  return null;
}

type ActiveRipple = {
  intensity: number;
  progress: number;
  profile: VisualProfile;
};

function getActiveRipples(
  events: EchoEvent[],
  context: RenderContext,
  getVisualProfile: (event: EchoEvent, scene: "map" | "node") => VisualProfile
) {
  return events
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
      } satisfies ActiveRipple;
    })
    .filter((ripple): ripple is ActiveRipple => ripple !== null);
}

function getVisibleRipples(activeRipples: ActiveRipple[], hasTransitionNode: boolean, isTransitionNode: boolean) {
  if (!hasTransitionNode) {
    return activeRipples;
  }

  return isTransitionNode ? activeRipples.slice(0, 1) : [];
}

function getPulse(visibleRipples: ActiveRipple[], easedFocus: number, hasTransitionNode: boolean, isTransitionNode: boolean) {
  const pulseEnergy = visibleRipples.reduce((sum, ripple) => sum + (1 - ripple.progress) * ripple.intensity, 0);

  if (!hasTransitionNode) {
    return Math.max(0.12, Math.min(1.4, pulseEnergy));
  }

  return isTransitionNode ? Math.max(0.22, Math.min(1.7, pulseEnergy + easedFocus * 0.4)) : 0;
}

function getHaloRadius(
  pulse: number,
  isHovered: boolean,
  isTransitionNode: boolean,
  easedFocus: number,
  context: RenderContext,
  index: number,
  hasTransitionNode: boolean
) {
  const breathingHalo = hasTransitionNode ? 0 : Math.sin(context.time * 0.001 + index) * 2;
  const hoverHalo = isHovered ? 5 : 0;
  const focusHalo = isTransitionNode ? easedFocus * 20 : 0;

  return 6 + breathingHalo + pulse * 16 + hoverHalo + focusHalo;
}

function applyMapFocusTransform(
  layer: MapSceneLayer,
  context: RenderContext,
  transitionPosition: MapNodeLayout | null,
  easedFocus: number
) {
  const focusDrift = transitionPosition
    ? {
        x: (context.width / 2 - transitionPosition.anchorX) * easedFocus * 0.34,
        y: (context.height / 2 - transitionPosition.anchorY) * easedFocus * 0.34
      }
    : { x: 0, y: 0 };

  layer.root.visible = true;
  layer.root.position.set(context.width / 2 + focusDrift.x, context.height / 2 + focusDrift.y);
  layer.root.pivot.set(context.width / 2, context.height / 2);
  layer.root.scale.set(1 + easedFocus * 0.14);
}

export function renderMapScene(
  layer: MapSceneLayer,
  snapshot: RenderSnapshot,
  hoverState: HoverState,
  context: RenderContext,
  getVisualProfile: (event: EchoEvent, scene: "map" | "node") => VisualProfile
) {
  const { nodes, mapSearchTransition, recentEvents } = snapshot;
  const mapNodeLayout = buildMapNodeLayout(nodes, context);
  const transitionNode = mapSearchTransition
    ? nodes.find((node) => node.id === mapSearchTransition.nodeId) ?? null
    : null;
  const { easedFocus } = getMapSearchFocusState(mapSearchTransition?.startedAt ?? null, context.now);
  const transitionPosition = transitionNode ? mapNodeLayout.get(transitionNode.id) ?? null : null;
  const hasTransitionNode = transitionNode !== null;

  applyMapFocusTransform(layer, context, transitionPosition, easedFocus);

  updateMapTexture(layer, context);
  layer.mapSprite.alpha = 1;

  layer.ripples.clear();
  layer.halos.clear();
  layer.cores.clear();
  layer.label.visible = false;

  nodes.forEach((node, index) => {
    const layout = mapNodeLayout.get(node.id);
    const x = layout?.x ?? context.width / 2;
    const y = layout?.y ?? context.height / 2;
    const isTransitionNode = transitionNode?.id === node.id;
    const activeRipples = getActiveRipples(getNodeEvents(recentEvents, node.id), context, getVisualProfile);
    const visibleRipples = getVisibleRipples(activeRipples, hasTransitionNode, isTransitionNode);
    const pulse = getPulse(visibleRipples, easedFocus, hasTransitionNode, isTransitionNode);
    const isHovered = hoverState.hoveredNodeId === node.id;
    const halo = getHaloRadius(pulse, isHovered, isTransitionNode, easedFocus, context, index, hasTransitionNode);

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
      alpha: hasTransitionNode
        ? isTransitionNode
          ? 0.06 + pulse * 0.12
          : 0.02
        : 0.04 + pulse * 0.1 + (isHovered ? 0.06 : 0)
    });

    layer.cores.circle(x, y, (isHovered ? 4 : 3) + Math.min(2, pulse * 1.5));
    layer.cores.fill({
      color: 0xffffff,
      alpha: hasTransitionNode ? (isTransitionNode ? 0.96 : 0.34) : 0.85
    });

    if (!hasTransitionNode && isHovered) {
      layer.label.text = getDisplayNodeId(node);
      layer.label.x = x + halo + 6;
      layer.label.y = y - 6;
      layer.label.visible = true;
    }
  });
}
