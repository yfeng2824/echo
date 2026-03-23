import { CanvasSource, Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import type { EchoEvent, EchoNode } from "@echo/contracts";
import type { CollisionBurst, RenderCallbacks, RenderContext, RenderSnapshot, VisualProfile } from "./pixi-types";
import { clamp, easeOutCubic, getNodeEntryState } from "./pixi-transition-layer";
import { getDisplayNodeId } from "../../lib/node-id";

type NodeSceneLayer = {
  root: Container;
  mapSprite: Sprite;
  mapCanvas: HTMLCanvasElement;
  mapContext: CanvasRenderingContext2D | null;
  lineGraphics: Graphics;
  rippleGraphics: Graphics;
  nodeGraphics: Graphics;
  burstGraphics: Graphics;
  label: Text;
};

type NodeSceneTransition = {
  fromNodeId: string;
  toNodeId: string;
  startedAt: number;
} | null;

type NodeSceneHoverState = {
  hoveredPeerNodeId: string | null;
};

type NodeLayoutPoint = {
  x: number;
  y: number;
  size: number;
  events: EchoEvent[];
};

export function createNodeSceneLayer() {
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
  const lineGraphics = new Graphics();
  const rippleGraphics = new Graphics();
  const nodeGraphics = new Graphics();
  const burstGraphics = new Graphics();
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
  label.alpha = 0.74;
  label.roundPixels = true;
  label.resolution = Math.min(window.devicePixelRatio || 1, 2);

  root.addChild(mapSprite, lineGraphics, rippleGraphics, nodeGraphics, burstGraphics, label);

  return {
    root,
    mapSprite,
    mapCanvas,
    mapContext,
    lineGraphics,
    rippleGraphics,
    nodeGraphics,
    burstGraphics,
    label
  } satisfies NodeSceneLayer;
}

function updateMapTexture(layer: NodeSceneLayer, context: RenderContext) {
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
  layer.mapContext.setTransform(context.dpr, 0, 0, context.dpr, 0, 0);
  context.projection.draw(layer.mapContext, 1);
  layer.mapContext.setTransform(1, 0, 0, 1, 0, 0);
  layer.mapSprite.texture.source.update();
  layer.mapSprite.width = context.width;
  layer.mapSprite.height = context.height;
}

function hashString(value: string) {
  let hash = 0;

  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) % 100000;
  }

  return hash;
}

function seededRandom(seed: number) {
  const value = Math.sin(seed) * 10000;
  return value - Math.floor(value);
}

function getNodeEvents(events: EchoEvent[], nodeId: string) {
  return events.filter((event) => event.nodeId === nodeId);
}

function buildNodeLayout(
  nodes: EchoNode[],
  selectedNodeId: string,
  recentEvents: EchoEvent[],
  context: RenderContext,
  localLayoutSeed: number,
  entryEase: number,
  peerEntryEase: number
) {
  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  if (!selectedNode) {
    return null;
  }

  const width = context.width;
  const height = context.height;
  const centerX = Math.round(width / 2);
  const centerY = Math.round(height / 2);
  const baseRadius = Math.min(width, height) * 0.31;
  const layout = new Map<string, NodeLayoutPoint>();
  const selectedMapPosition =
    context.projection.project(selectedNode.lng, selectedNode.lat) ?? { x: centerX, y: centerY };
  const anchorX = Math.round(selectedMapPosition.x + (centerX - selectedMapPosition.x) * entryEase);
  const anchorY = Math.round(selectedMapPosition.y + (centerY - selectedMapPosition.y) * entryEase);

  layout.set(selectedNode.id, {
    x: anchorX,
    y: anchorY,
    size: 3 + entryEase * 5,
    events: getNodeEvents(recentEvents, selectedNode.id)
  });

  const peers = nodes.filter((node) => selectedNode.peers.includes(node.id));

  peers.forEach((peer, index) => {
    const hash = hashString(peer.id);
    const seedBase = localLayoutSeed + hash * 0.37 + index * 13.1;
    const angleJitter = (seededRandom(seedBase) - 0.5) * 0.7;
    const radialJitter = 0.82 + seededRandom(seedBase + 11.3) * 0.38;
    const orbitBias = (seededRandom(seedBase + 23.7) - 0.5) * 26;
    const angle = (index / Math.max(peers.length, 1)) * Math.PI * 2 + angleJitter + orbitBias * 0.01;
    const radius = baseRadius * radialJitter;
    const x = Math.round(anchorX + Math.cos(angle) * radius * peerEntryEase);
    const y = Math.round(anchorY + Math.sin(angle) * radius * peerEntryEase);

    layout.set(peer.id, {
      x,
      y,
      size: 4,
      events: getNodeEvents(recentEvents, peer.id)
    });
  });

  return {
    selectedNode,
    peers,
    layout,
    anchorX,
    anchorY
  };
}

function getNodeSceneTransitionEase(
  transition: NodeSceneTransition,
  selectedNodeId: string | null,
  now: number
) {
  if (!transition || !selectedNodeId || transition.toNodeId !== selectedNodeId) {
    return 1;
  }

  const progress = clamp((now - transition.startedAt) / 580, 0, 1);
  return easeOutCubic(progress);
}

function blendNodePoint(previous: NodeLayoutPoint | null, target: NodeLayoutPoint | null, transitionEase: number) {
  if (previous && target) {
    return {
      x: previous.x + (target.x - previous.x) * transitionEase,
      y: previous.y + (target.y - previous.y) * transitionEase,
      size: previous.size + (target.size - previous.size) * transitionEase,
      events: target.events,
      visibility: 0.45 + transitionEase * 0.55
    };
  }

  if (target) {
    return {
      ...target,
      visibility: Math.max(0.2, transitionEase)
    };
  }

  if (!previous) {
    return null;
  }

  return {
    ...previous,
    events: [],
    visibility: 1 - transitionEase
  };
}

function findPeerNodeAtPoint(
  nodes: EchoNode[],
  layout: Map<string, NodeLayoutPoint>,
  selectedNodeId: string,
  clientX: number,
  clientY: number,
  options?: {
    preferredNodeId?: string | null;
    hitRadius?: number;
    stickiness?: number;
  }
) {
  const preferredNodeId = options?.preferredNodeId ?? null;
  const hitRadius = options?.hitRadius ?? 18;
  const stickiness = options?.stickiness ?? 8;
  let nearestNode: EchoNode | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  let preferredDistance = Number.POSITIVE_INFINITY;

  for (const node of nodes) {
    if (node.id === selectedNodeId) {
      continue;
    }

    const point = layout.get(node.id);
    if (!point) {
      continue;
    }

    const distance = Math.hypot(clientX - point.x, clientY - point.y);

    if (node.id === preferredNodeId) {
      preferredDistance = distance;
    }

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestNode = node;
    }
  }

  if (!nearestNode || nearestDistance > hitRadius) {
    return null;
  }

  if (
    preferredNodeId &&
    preferredDistance <= hitRadius + stickiness &&
    preferredDistance <= nearestDistance + stickiness
  ) {
    return nodes.find((node) => node.id === preferredNodeId) ?? nearestNode;
  }

  return nearestNode;
}

export function findNodeScenePeerAtPoint(
  snapshot: RenderSnapshot,
  context: RenderContext,
  localLayoutSeed: number,
  clientX: number,
  clientY: number,
  options?: {
    preferredNodeId?: string | null;
    hitRadius?: number;
    stickiness?: number;
  }
) {
  const selectedNodeId = snapshot.selectedNodeId ?? snapshot.nodes[0]?.id;
  if (!selectedNodeId) {
    return null;
  }

  const { entryEase, peerEntryEase } = getNodeEntryState(snapshot.nodeSceneEnteredAt, context.now);
  const nodeLayout = buildNodeLayout(
    snapshot.nodes,
    selectedNodeId,
    snapshot.recentEvents,
    context,
    localLayoutSeed,
    entryEase,
    peerEntryEase
  );

  if (!nodeLayout) {
    return null;
  }

  return findPeerNodeAtPoint(
    snapshot.nodes,
    nodeLayout.layout,
    selectedNodeId,
    clientX,
    clientY,
    options
  );
}

export function renderNodeScene(
  layer: NodeSceneLayer,
  snapshot: RenderSnapshot,
  hoverState: NodeSceneHoverState,
  nodeTransition: NodeSceneTransition,
  context: RenderContext,
  localLayoutSeed: number,
  collisionHistory: Map<string, number>,
  collisionBursts: CollisionBurst[],
  callbacks: RenderCallbacks,
  getVisualProfile: (event: EchoEvent, scene: "map" | "node") => VisualProfile,
  maxRippleLayer: number
) {
  const { nodes, selectedNodeId, recentEvents, nodeSceneEnteredAt } = snapshot;
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];

  layer.root.visible = true;
  layer.root.position.set(0, 0);
  layer.root.scale.set(1);
  layer.lineGraphics.clear();
  layer.rippleGraphics.clear();
  layer.nodeGraphics.clear();
  layer.burstGraphics.clear();
  layer.label.visible = false;

  if (!selectedNode) {
    return collisionBursts;
  }

  const { entryEase, peerEntryEase, lineEntryEase, mapFade } = getNodeEntryState(
    nodeSceneEnteredAt,
    context.now
  );
  const targetLayout = buildNodeLayout(
    nodes,
    selectedNode.id,
    recentEvents,
    context,
    localLayoutSeed,
    entryEase,
    peerEntryEase
  );

  if (!targetLayout) {
    return collisionBursts;
  }

  const transitionEase = getNodeSceneTransitionEase(nodeTransition, selectedNode.id, context.now);
  const previousLayout =
    transitionEase < 1 && nodeTransition
      ? buildNodeLayout(
          nodes,
          nodeTransition.fromNodeId,
          recentEvents,
          context,
          localLayoutSeed,
          entryEase,
          peerEntryEase
        )
      : null;

  updateMapTexture(layer, context);
  layer.mapSprite.alpha = mapFade;

  const activeRipples: Array<{
    nodeId: string;
    eventId: string;
    batchId?: string;
    x: number;
    y: number;
    radius: number;
    intensity: number;
    rippleLayer: number;
  }> = [];

  if (previousLayout && transitionEase < 1) {
    previousLayout.peers.forEach((peer) => {
      const peerLayout = previousLayout.layout.get(peer.id);
      if (!peerLayout) {
        return;
      }

      layer.lineGraphics.moveTo(previousLayout.anchorX, previousLayout.anchorY);
      layer.lineGraphics.lineTo(peerLayout.x, peerLayout.y);
      layer.lineGraphics.stroke({
        color: 0xffffff,
        alpha: lineEntryEase * 0.1 * (1 - transitionEase),
        width: 1
      });
    });
  }

  targetLayout.peers.forEach((peer) => {
    const peerLayout = targetLayout.layout.get(peer.id);
    if (!peerLayout) {
      return;
    }

    layer.lineGraphics.moveTo(targetLayout.anchorX, targetLayout.anchorY);
    layer.lineGraphics.lineTo(peerLayout.x, peerLayout.y);
    layer.lineGraphics.stroke({
      color: 0xffffff,
      alpha: lineEntryEase * 0.1 * Math.max(transitionEase, 0.35),
      width: 1
    });
  });

  const renderNodeIds = new Set<string>(targetLayout.layout.keys());
  if (previousLayout) {
    for (const nodeId of previousLayout.layout.keys()) {
      renderNodeIds.add(nodeId);
    }
  }

  const renderNodes = Array.from(renderNodeIds)
    .map((nodeId) => nodes.find((node) => node.id === nodeId))
    .filter((node): node is EchoNode => Boolean(node));

  renderNodes.forEach((node, index) => {
    const point = blendNodePoint(
      previousLayout?.layout.get(node.id) ?? null,
      targetLayout.layout.get(node.id) ?? null,
      transitionEase
    );

    if (!point || point.visibility <= 0.01) {
      return;
    }

    const activeNodeRipples = point.events
      .map((event) => {
        const profile = getVisualProfile(event, "node");
        const age = context.now - new Date(event.at).getTime();
        if (age < 0 || age > profile.duration) {
          return null;
        }

        return {
          event,
          progress: age / profile.duration,
          profile
        };
      })
      .filter(Boolean) as Array<{ event: EchoEvent; progress: number; profile: VisualProfile }>;
    const pulseEnergy = activeNodeRipples.reduce(
      (sum, ripple) => sum + (1 - ripple.progress) * ripple.event.intensity,
      0
    );
    const pulse = Math.max(0.14, Math.min(1.5, pulseEnergy));
    const isSelectedNode = node.id === selectedNode.id;
    const isHoveredPeer = hoverState.hoveredPeerNodeId === node.id && !isSelectedNode;
    const nodeEntryScale = isSelectedNode ? 0.8 + entryEase * 0.9 : 0.08 + peerEntryEase * 0.92;
    const hoverHaloBoost = isHoveredPeer ? 7 : 0;
    const hoverAlphaBoost = isHoveredPeer ? 0.12 : 0;
    const haloSize =
      isSelectedNode
        ? (18 + pulse * 28 + Math.sin(context.time * 0.001 + index) * 2) * (0.95 + entryEase * 0.3)
        : (11 + pulse * 14 + Math.sin(context.time * 0.001 + index) * 1.2) * nodeEntryScale +
          hoverHaloBoost;

    for (const ripple of activeNodeRipples) {
      const rippleRadius = 12 + ripple.progress * ripple.profile.radius;
      const rippleAlpha = (1 - ripple.progress) * ripple.profile.alpha * point.visibility;

      activeRipples.push({
        nodeId: node.id,
        eventId: ripple.event.id,
        batchId: ripple.event.batchId,
        x: point.x,
        y: point.y,
        radius: rippleRadius,
        intensity: ripple.event.intensity,
        rippleLayer: ripple.event.rippleLayer ?? 0
      });

      layer.rippleGraphics.circle(point.x, point.y, rippleRadius);
      layer.rippleGraphics.stroke({
        color: 0xffffff,
        alpha: rippleAlpha * (isSelectedNode ? 1 : peerEntryEase),
        width: isSelectedNode ? 2.4 : isHoveredPeer ? 2.2 : 1.8
      });
    }

    layer.nodeGraphics.circle(point.x, point.y, haloSize);
    layer.nodeGraphics.fill({
      color: 0xffffff,
      alpha:
        (isSelectedNode
          ? 0.05 + pulse * 0.12
          : (0.025 + pulse * 0.075 + hoverAlphaBoost) * peerEntryEase) * point.visibility
    });

    layer.nodeGraphics.circle(
      point.x,
      point.y,
      ((isSelectedNode ? point.size + pulse * 2.4 : point.size + pulse + (isHoveredPeer ? 0.9 : 0)) *
        nodeEntryScale) /
        (isSelectedNode ? 1 : 1 - Math.min(0.28, (1 - point.visibility) * 0.3))
    );
    layer.nodeGraphics.fill({
      color: 0xffffff,
      alpha: (isSelectedNode ? 0.94 : (isHoveredPeer ? 0.98 : 0.9) * peerEntryEase) * point.visibility
    });

    if (isHoveredPeer) {
      layer.label.text = getDisplayNodeId(node);
      layer.label.x = point.x + haloSize + 8;
      layer.label.y = point.y - 6;
      layer.label.visible = true;
    }
  });

  for (let leftIndex = 0; leftIndex < activeRipples.length; leftIndex += 1) {
    const leftRipple = activeRipples[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < activeRipples.length; rightIndex += 1) {
      const rightRipple = activeRipples[rightIndex];
      if (leftRipple.nodeId === rightRipple.nodeId) {
        continue;
      }

      const dx = rightRipple.x - leftRipple.x;
      const dy = rightRipple.y - leftRipple.y;
      const distance = Math.hypot(dx, dy);
      const involvesSelectedNode =
        leftRipple.nodeId === selectedNode.id || rightRipple.nodeId === selectedNode.id;

      if (!involvesSelectedNode) {
        continue;
      }

      if (
        distance <= Math.abs(leftRipple.radius - rightRipple.radius) ||
        distance >= leftRipple.radius + rightRipple.radius
      ) {
        continue;
      }

      const collisionKey = [leftRipple.eventId, rightRipple.eventId].sort().join(":");
      if (collisionHistory.has(collisionKey)) {
        continue;
      }

      const unitX = dx / distance;
      const unitY = dy / distance;
      const intersectionDistance =
        (leftRipple.radius * leftRipple.radius -
          rightRipple.radius * rightRipple.radius +
          distance * distance) /
        (2 * distance);
      const collisionX = leftRipple.x + unitX * intersectionDistance;
      const collisionY = leftRipple.y + unitY * intersectionDistance;

      collisionHistory.set(collisionKey, context.now);
      collisionBursts.push({
        x: collisionX,
        y: collisionY,
        createdAt: context.now,
        radius: 12 + Math.max(leftRipple.intensity, rightRipple.intensity) * 18,
        leftNodeId: leftRipple.nodeId,
        rightNodeId: rightRipple.nodeId
      });

      const nextRippleLayer = Math.max(leftRipple.rippleLayer, rightRipple.rippleLayer) + 1;

      if (nextRippleLayer <= maxRippleLayer) {
        callbacks.emitCollisionEcho(leftRipple, rightRipple, collisionKey);
      }
    }
  }

  const nextBursts = collisionBursts.filter((burst) => context.now - burst.createdAt < 700);
  for (const burst of nextBursts) {
    const progress = (context.now - burst.createdAt) / 700;
    const size = burst.radius * (0.55 + progress * 0.28);
    const alpha = 0.34 * (1 - progress);

    layer.burstGraphics.circle(burst.x, burst.y, 3 + (1 - progress) * 6);
    layer.burstGraphics.fill({ color: 0xffffff, alpha: alpha * 0.65 });
    layer.burstGraphics.circle(burst.x, burst.y, size + 4);
    layer.burstGraphics.stroke({ color: 0xffffff, alpha: alpha * 0.85, width: 2.4 });
    layer.burstGraphics.circle(burst.x, burst.y, 8 + progress * 32);
    layer.burstGraphics.stroke({ color: 0xffffff, alpha: alpha * 0.55, width: 1.8 });
  }

  for (const [key, createdAt] of collisionHistory.entries()) {
    if (context.now - createdAt > 2600) {
      collisionHistory.delete(key);
    }
  }

  return nextBursts;
}
