import { CanvasSource, Container, Graphics, Sprite, Texture } from "pixi.js";
import type { EchoEvent } from "@echo/contracts";
import type { CollisionBurst, RenderCallbacks, RenderContext, RenderSnapshot, VisualProfile } from "./pixi-types";
import { getNodeEntryState } from "./pixi-transition-layer";

type NodeSceneLayer = {
  root: Container;
  mapSprite: Sprite;
  mapCanvas: HTMLCanvasElement;
  mapContext: CanvasRenderingContext2D | null;
  lineGraphics: Graphics;
  rippleGraphics: Graphics;
  nodeGraphics: Graphics;
  burstGraphics: Graphics;
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

  root.addChild(mapSprite, lineGraphics, rippleGraphics, nodeGraphics, burstGraphics);

  return {
    root,
    mapSprite,
    mapCanvas,
    mapContext,
    lineGraphics,
    rippleGraphics,
    nodeGraphics,
    burstGraphics
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

export function renderNodeScene(
  layer: NodeSceneLayer,
  snapshot: RenderSnapshot,
  context: RenderContext,
  localLayoutSeed: number,
  collisionHistory: Map<string, number>,
  collisionAudioHistory: Map<string, number>,
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

  if (!selectedNode) {
    return collisionBursts;
  }

  const width = context.width;
  const height = context.height;
  const centerX = Math.round(width / 2);
  const centerY = Math.round(height / 2);
  const { entryEase, peerEntryEase, lineEntryEase, mapFade } = getNodeEntryState(
    nodeSceneEnteredAt,
    context.now
  );
  updateMapTexture(layer, context);
  layer.mapSprite.alpha = mapFade;

  const peers = nodes.filter((node) => selectedNode.peers.includes(node.id));
  const localNodes = [selectedNode, ...peers];
  const baseRadius = Math.min(width, height) * 0.31;
  const layout = new Map<string, { x: number; y: number; size: number; events: EchoEvent[] }>();
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

  peers.forEach((peer) => {
    const peerLayout = layout.get(peer.id);
    if (!peerLayout) {
      return;
    }

    layer.lineGraphics.moveTo(anchorX, anchorY);
    layer.lineGraphics.lineTo(peerLayout.x, peerLayout.y);
    layer.lineGraphics.stroke({ color: 0xffffff, alpha: lineEntryEase * 0.1, width: 1 });
  });

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

  localNodes.forEach((node, index) => {
    const nodeLayout = layout.get(node.id);
    if (!nodeLayout) {
      return;
    }

    const activeNodeRipples = nodeLayout.events
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
    const nodeEntryScale =
      node.id === selectedNode.id ? 0.8 + entryEase * 0.9 : 0.08 + peerEntryEase * 0.92;
    const haloSize =
      node.id === selectedNode.id
        ? (18 + pulse * 28 + Math.sin(context.time * 0.001 + index) * 2) * (0.95 + entryEase * 0.3)
        : (11 + pulse * 14 + Math.sin(context.time * 0.001 + index) * 1.2) * nodeEntryScale;

    for (const ripple of activeNodeRipples) {
      const rippleRadius = 12 + ripple.progress * ripple.profile.radius;
      const rippleAlpha = (1 - ripple.progress) * ripple.profile.alpha;

      activeRipples.push({
        nodeId: node.id,
        eventId: ripple.event.id,
        batchId: ripple.event.batchId,
        x: nodeLayout.x,
        y: nodeLayout.y,
        radius: rippleRadius,
        intensity: ripple.event.intensity,
        rippleLayer: ripple.event.rippleLayer ?? 0
      });

      layer.rippleGraphics.circle(nodeLayout.x, nodeLayout.y, rippleRadius);
      layer.rippleGraphics.stroke({
        color: 0xffffff,
        alpha: rippleAlpha * (node.id === selectedNode.id ? 1 : peerEntryEase),
        width: node.id === selectedNode.id ? 2.4 : 1.8
      });
    }

    layer.nodeGraphics.circle(nodeLayout.x, nodeLayout.y, haloSize);
    layer.nodeGraphics.fill({
      color: 0xffffff,
      alpha:
        node.id === selectedNode.id
          ? 0.05 + pulse * 0.12
          : (0.025 + pulse * 0.075) * peerEntryEase
    });

    layer.nodeGraphics.circle(
      nodeLayout.x,
      nodeLayout.y,
      (node.id === selectedNode.id ? nodeLayout.size + pulse * 2.4 : nodeLayout.size + pulse) *
        nodeEntryScale
    );
    layer.nodeGraphics.fill({
      color: 0xffffff,
      alpha: node.id === selectedNode.id ? 0.94 : 0.9 * peerEntryEase
    });
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

      const collisionBatchKey =
        leftRipple.batchId && rightRipple.batchId
          ? [leftRipple.batchId, rightRipple.batchId].sort().join(":")
          : collisionKey;
      const lastCollisionAudioAt = collisionAudioHistory.get(collisionBatchKey) ?? 0;
      const nextRippleLayer = Math.max(leftRipple.rippleLayer, rightRipple.rippleLayer) + 1;

      if (nextRippleLayer <= maxRippleLayer && context.now - lastCollisionAudioAt > 900) {
        collisionAudioHistory.set(collisionBatchKey, context.now);
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

  for (const [key, createdAt] of collisionAudioHistory.entries()) {
    if (context.now - createdAt > 2600) {
      collisionAudioHistory.delete(key);
    }
  }

  return nextBursts;
}
