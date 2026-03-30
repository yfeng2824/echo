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
  links: Graphics;
  ripples: Graphics;
  halos: Graphics;
  cores: Graphics;
  hoverInfo: Container;
  hoverLabels: Text[];
  hoverValues: Text[];
};

export function createMapSceneLayer() {
  const root = new Container();
  const mapCanvas = document.createElement("canvas");
  const mapContext = mapCanvas.getContext("2d");
  const mapSprite = new Sprite(
    new Texture({
      source: new CanvasSource({
        resource: mapCanvas,
      }),
    })
  );
  const links = new Graphics();
  const ripples = new Graphics();
  const halos = new Graphics();
  const cores = new Graphics();
  const hoverInfo = new Container();
  const labelStyle = new TextStyle({
    fontFamily: "Inter, sans-serif",
    fontSize: 10,
    fill: 0xffffff,
    letterSpacing: 0.3,
  });
  const valueStyle = new TextStyle({
    fontFamily: "Inter, sans-serif",
    fontSize: 10,
    fill: 0xffffff,
    letterSpacing: 0.3,
  });
  const hoverLabels = Array.from({ length: 4 }, () => new Text({ text: "", style: labelStyle }));
  const hoverValues = Array.from({ length: 4 }, () => new Text({ text: "", style: valueStyle }));

  hoverInfo.visible = false;
  hoverInfo.alpha = 0.7;
  hoverLabels.forEach((text, index) => {
    text.alpha = 0.4;
    text.roundPixels = true;
    text.resolution = Math.min(window.devicePixelRatio || 1, 2);
    text.y = index * 15;
    hoverInfo.addChild(text);
  });
  hoverValues.forEach((text, index) => {
    text.roundPixels = true;
    text.resolution = Math.min(window.devicePixelRatio || 1, 2);
    text.y = index * 15;
    text.x = 116;
    hoverInfo.addChild(text);
  });

  root.addChild(mapSprite, links, ripples, halos, cores, hoverInfo);

  return {
    root,
    mapSprite,
    mapCanvas,
    mapContext,
    links,
    ripples,
    halos,
    cores,
    hoverInfo,
    hoverLabels,
    hoverValues,
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

function getVisibleNodeEvents(
  events: EchoEvent[],
  nodeId: string,
  context: RenderContext,
  getVisualProfile: (event: EchoEvent, scene: "map" | "node") => VisualProfile
) {
  const nodeEvents = getNodeEvents(events, nodeId);
  const activePriorityEvents = nodeEvents.filter((event) => {
    if (event.type === "node_active") {
      return false;
    }

    const profile = getVisualProfile(event, "map");
    const age = context.now - new Date(event.at).getTime();
    return age >= 0 && age <= profile.duration;
  });

  return activePriorityEvents.length > 0 ? activePriorityEvents : nodeEvents;
}

function getMapPosition(node: EchoNode, context: RenderContext) {
  return (
    context.projection.project(node.lng, node.lat) ?? {
      x: context.width / 2,
      y: context.height / 2,
    }
  );
}

type MapNodeLayout = {
  anchorX: number;
  anchorY: number;
  x: number;
  y: number;
};

function getMapVerticalOffset(width: number, height: number) {
  const base = Math.max(12, Math.min(48, Math.round(height * 0.06)));

  if (width <= 480) {
    return Math.max(10, base - 8);
  }

  if (width <= 767) {
    return Math.max(12, base - 4);
  }

  if (width <= 1199) {
    return base;
  }

  return Math.max(28, base);
}
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
      y: projected.y,
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
        y: anchorY,
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
          y: anchorY + Math.sin(angle) * radius,
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
  clientY: number,
  options?: {
    preferredNodeId?: string | null;
    hitRadius?: number;
    stickiness?: number;
  }
) {
  const layout = buildMapNodeLayout(nodes, context);
  const adjustedY = clientY - getMapVerticalOffset(context.width, context.height);
  const hitRadius = options?.hitRadius ?? 16;
  const stickiness = options?.stickiness ?? 6;
  let nearestNode: EchoNode | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  let preferredDistance = Number.POSITIVE_INFINITY;
  const preferredNodeId = options?.preferredNodeId ?? null;

  for (const node of nodes) {
    const position = layout.get(node.id);
    const x = position?.x ?? context.width / 2;
    const y = position?.y ?? context.height / 2;
    const distance = Math.hypot(clientX - x, adjustedY - y);

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
        profile,
      } satisfies ActiveRipple;
    })
    .filter((ripple): ripple is ActiveRipple => ripple !== null);
}

function getVisibleRipples(
  activeRipples: ActiveRipple[],
  hasTransitionNode: boolean,
  isTransitionNode: boolean
) {
  if (!hasTransitionNode) {
    return activeRipples;
  }

  return isTransitionNode ? activeRipples.slice(0, 1) : [];
}

function getPulse(
  visibleRipples: ActiveRipple[],
  easedFocus: number,
  hasTransitionNode: boolean,
  isTransitionNode: boolean
) {
  const pulseEnergy = visibleRipples.reduce(
    (sum, ripple) => sum + (1 - ripple.progress) * ripple.intensity,
    0
  );

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

function getSecretCueWaveEnergy(snapshot: RenderSnapshot, context: RenderContext) {
  const { secretCue } = snapshot;

  if (
    secretCue.phase !== "playing" ||
    !secretCue.word ||
    secretCue.startedAt === null ||
    secretCue.expiresAt === null
  ) {
    return null;
  }

  const duration = Math.max(1, secretCue.expiresAt - secretCue.startedAt);
  const progress = Math.max(0, Math.min(1, (context.now - secretCue.startedAt) / duration));
  if (progress >= 1) {
    return null;
  }

  const attack = Math.min(1, progress / 0.16);
  const decay = 1 - Math.max(0, (progress - 0.62) / 0.38);

  return {
    word: secretCue.word,
    progress,
    energy: attack * decay,
  };
}

function getSecretCuePulse(cue: { progress: number; energy: number } | null) {
  if (!cue) {
    return 0;
  }

  const cycle = (cue.progress * 3) % 1;
  const pulseShape = Math.sin(cycle * Math.PI);
  const pulse = Math.max(0, pulseShape) ** 1.35;

  return pulse * cue.energy;
}

function applyMapFocusTransform(
  layer: MapSceneLayer,
  context: RenderContext,
  transitionPosition: MapNodeLayout | null,
  easedFocus: number
) {
  const verticalOffset = getMapVerticalOffset(context.width, context.height);
  const focusDrift = transitionPosition
    ? {
        x: (context.width / 2 - transitionPosition.anchorX) * easedFocus * 0.34,
        y: (context.height / 2 - transitionPosition.anchorY) * easedFocus * 0.34,
      }
    : { x: 0, y: 0 };

  layer.root.visible = true;
  layer.root.position.set(
    context.width / 2 + focusDrift.x,
    context.height / 2 + focusDrift.y + verticalOffset
  );
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
  const { nodes, channels, mapSearchTransition, recentEvents } = snapshot;
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const mapNodeLayout = buildMapNodeLayout(nodes, context);
  const hoveredNode =
    !isCoarsePointer && hoverState.hoveredNodeId
      ? (nodes.find((node) => node.id === hoverState.hoveredNodeId) ?? null)
      : null;
  const connectedNodeIds = new Set<string>();
  if (hoveredNode) {
    connectedNodeIds.add(hoveredNode.id);
    nodes.forEach((candidate) => {
      if (
        candidate.id === hoveredNode.id ||
        hoveredNode.peers.includes(candidate.id) ||
        candidate.peers.includes(hoveredNode.id)
      ) {
        connectedNodeIds.add(candidate.id);
      }
    });
  }
  const transitionNode = mapSearchTransition
    ? (nodes.find((node) => node.id === mapSearchTransition.nodeId) ?? null)
    : null;
  const { easedFocus } = getMapSearchFocusState(
    mapSearchTransition?.startedAt ?? null,
    context.now
  );
  const transitionPosition = transitionNode ? (mapNodeLayout.get(transitionNode.id) ?? null) : null;
  const hasTransitionNode = transitionNode !== null;
  const secretCueWave = getSecretCueWaveEnergy(snapshot, context);

  applyMapFocusTransform(layer, context, transitionPosition, easedFocus);

  updateMapTexture(layer, context);
  layer.mapSprite.alpha = 1;

  layer.ripples.clear();
  layer.links.clear();
  layer.halos.clear();
  layer.cores.clear();
  layer.hoverInfo.visible = false;

  if (hoveredNode && !hasTransitionNode) {
    const hoveredLayout = mapNodeLayout.get(hoveredNode.id);
    if (hoveredLayout) {
      connectedNodeIds.forEach((peerId) => {
        if (peerId === hoveredNode.id) {
          return;
        }

        const peerLayout = mapNodeLayout.get(peerId);
        if (!peerLayout) {
          return;
        }

        layer.links.moveTo(hoveredLayout.x, hoveredLayout.y);
        layer.links.lineTo(peerLayout.x, peerLayout.y);
        layer.links.stroke({
          color: 0xffffff,
          alpha: 0.3,
          width: 1,
        });
      });
    }
  }

  nodes.forEach((node, index) => {
    const layout = mapNodeLayout.get(node.id);
    const x = layout?.x ?? context.width / 2;
    const y = layout?.y ?? context.height / 2;
    const isTransitionNode = transitionNode?.id === node.id;
    const activeRipples = getActiveRipples(
      getVisibleNodeEvents(recentEvents, node.id, context, getVisualProfile),
      context,
      getVisualProfile
    );
    const visibleRipples = getVisibleRipples(activeRipples, hasTransitionNode, isTransitionNode);
    const pulse = getPulse(visibleRipples, easedFocus, hasTransitionNode, isTransitionNode);
    const secretCuePulse = getSecretCuePulse(secretCueWave);
    const totalPulse = pulse + secretCuePulse * 0.95;
    const isHovered = hoverState.hoveredNodeId === node.id;
    const isConnectedToHovered = connectedNodeIds.has(node.id);
    const hasHoverContext = hoveredNode !== null && !hasTransitionNode;
    const halo = getHaloRadius(
      totalPulse,
      isHovered,
      isTransitionNode,
      easedFocus,
      context,
      index,
      hasTransitionNode
    );
    const hoverHaloBoost = hasHoverContext
      ? isHovered
        ? 2.8
        : isConnectedToHovered
          ? 1.8
          : -1.5
      : 0;
    const haloRadius = Math.max(4, halo + hoverHaloBoost);
    const coreSizeBoost = hasHoverContext
      ? isHovered
        ? 1.3
        : isConnectedToHovered
          ? 0.7
          : -0.6
      : 0;
    const coreRadius = (isHovered ? 4 : 3) + Math.min(2, pulse * 1.5) + coreSizeBoost;

    for (const ripple of visibleRipples) {
      const rippleRadius = 8 + ripple.progress * ripple.profile.radius;
      const rippleAlpha =
        (1 - ripple.progress) * ripple.profile.alpha * (isTransitionNode ? 0.45 : 1);
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

    layer.halos.circle(x, y, haloRadius);
    layer.halos.fill({
      color: 0xffffff,
      alpha: hasTransitionNode
        ? isTransitionNode
          ? 0.06 + pulse * 0.12
          : 0.02
        : hasHoverContext
          ? isHovered
            ? 0.12 + totalPulse * 0.16
            : isConnectedToHovered
              ? 0.07 + totalPulse * 0.11
              : 0.015 + totalPulse * 0.04
          : 0.04 + totalPulse * 0.12 + (isHovered ? 0.06 : 0),
    });

    layer.cores.circle(x, y, Math.max(2.4, coreRadius + secretCuePulse * 0.9));
    layer.cores.fill({
      color: 0xffffff,
      alpha: hasTransitionNode
        ? isTransitionNode
          ? 0.96
          : 0.34
        : hasHoverContext
          ? isHovered
            ? 0.98
            : isConnectedToHovered
              ? 0.76
              : 0.24
          : Math.min(1, 0.85 + secretCuePulse * 0.08),
    });

    if (!hasTransitionNode && isHovered && !isCoarsePointer) {
      const activeChannelCount = channels.filter(
        (channel) => channel.sourceNodeId === node.id || channel.targetNodeId === node.id
      ).length;
      const rows = [
        { label: "ID", value: getDisplayNodeId(node) },
        { label: "ACTIVE CHANNELS", value: String(activeChannelCount) },
        { label: "ANNOUNCED PEERS", value: String(node.peers.length) },
      ];

      if (node.label?.trim()) {
        rows.splice(1, 0, { label: "ALIAS", value: node.label });
      }

      rows.forEach((row, index) => {
        layer.hoverLabels[index].text = row.label;
        layer.hoverValues[index].text = row.value;
      });
      for (let index = rows.length; index < layer.hoverLabels.length; index += 1) {
        layer.hoverLabels[index].text = "";
        layer.hoverValues[index].text = "";
      }

      layer.hoverInfo.x = x + halo + 6;
      layer.hoverInfo.y = y - 6;
      layer.hoverInfo.visible = true;
    }
  });
}
