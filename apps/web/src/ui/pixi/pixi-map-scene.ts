import { Container, Graphics, Text, TextStyle } from "pixi.js";
import type { EchoEvent, EchoNode } from "@echo/contracts";
import {
  buildMapNodeLayout,
  getMapVerticalOffset,
  type MapNodeLayout,
} from "../../lib/map-node-layout";
import { getDisplayNodeId } from "../../lib/node-id";
import { buildNodeViewLayout, getNodeViewLayoutSeed } from "../../lib/node-view-layout";
import {
  createProjectionTextureLayer,
  syncProjectionTexture,
  type ProjectionTextureLayer,
} from "./pixi-projection-texture";
import { getMapReturnState, getMapSearchFocusState } from "./pixi-transition-layer";
import type { HoverState, RenderContext, RenderSnapshot, VisualProfile } from "./pixi-types";

type MapSceneLayer = ProjectionTextureLayer & {
  root: Container;
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
  const projectionTextureLayer = createProjectionTextureLayer();
  const { mapSprite } = projectionTextureLayer;
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
    text.resolution = Math.min(window.devicePixelRatio || 1, 3);
    text.y = index * 15;
    hoverInfo.addChild(text);
  });
  hoverValues.forEach((text, index) => {
    text.roundPixels = true;
    text.resolution = Math.min(window.devicePixelRatio || 1, 3);
    text.y = index * 15;
    text.x = 116;
    hoverInfo.addChild(text);
  });

  root.addChild(mapSprite, links, ripples, halos, cores, hoverInfo);

  return {
    ...projectionTextureLayer,
    root,
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
  syncProjectionTexture(layer, context);
  layer.mapSprite.position.set(0, 0);
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

function getReturnStartPosition(
  node: EchoNode,
  mapNodeLayout: Map<string, MapNodeLayout>,
  returnLayout: ReturnType<typeof buildNodeViewLayout>,
  context: RenderContext
) {
  const target = mapNodeLayout.get(node.id);
  const targetX = target?.x ?? context.width / 2;
  const targetY = target?.y ?? context.height / 2;

  if (!returnLayout) {
    return { x: targetX, y: targetY };
  }

  const layoutPoint = returnLayout.layout.get(node.id);
  if (layoutPoint) {
    return {
      x: layoutPoint.x,
      y: layoutPoint.y,
    };
  }

  return {
    x: targetX,
    y: targetY,
  };
}

function getReturnNodePosition(
  node: EchoNode,
  mapNodeLayout: Map<string, MapNodeLayout>,
  returnLayout: ReturnType<typeof buildNodeViewLayout>,
  easedReturn: number,
  context: RenderContext
) {
  const target = mapNodeLayout.get(node.id);
  const targetX = target?.x ?? context.width / 2;
  const targetY = target?.y ?? context.height / 2;
  const start = getReturnStartPosition(node, mapNodeLayout, returnLayout, context);

  return {
    x: start.x + (targetX - start.x) * easedReturn,
    y: start.y + (targetY - start.y) * easedReturn,
  };
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
  const { nodes, channels, mapSearchTransition, mapReturnTransition, recentEvents } = snapshot;
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const mapNodeLayout = buildMapNodeLayout(nodes, context);
  const returnTransitionNode = mapReturnTransition
    ? (nodes.find((node) => node.id === mapReturnTransition.nodeId) ?? null)
    : null;
  const returnState = getMapReturnState(mapReturnTransition?.startedAt ?? null, context.now);
  const hasMapReturnTransition = returnTransitionNode !== null && returnState.isActive;
  const returnLayout = hasMapReturnTransition
    ? buildNodeViewLayout(
        nodes,
        returnTransitionNode.id,
        context,
        getNodeViewLayoutSeed(returnTransitionNode.id),
        {
          entryEase: 1,
          peerEntryEase: 1,
          selectedNodeSize: 8,
          peerNodeSize: 4,
        }
      )
    : null;
  const allowGuidedHoverInfo = hoverState.isOnboardingHover === true;
  const hoveredNode =
    (!isCoarsePointer || allowGuidedHoverInfo) &&
    !hasMapReturnTransition &&
    hoverState.hoveredNodeId
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
  layer.mapSprite.alpha = hasMapReturnTransition ? returnState.easedReturn : 1;

  layer.ripples.clear();
  layer.links.clear();
  layer.halos.clear();
  layer.cores.clear();
  layer.hoverInfo.visible = false;

  if (returnLayout) {
    returnLayout.peers.forEach((peer) => {
      const selectedStart = getReturnStartPosition(
        returnLayout.selectedNode,
        mapNodeLayout,
        returnLayout,
        context
      );
      const peerStart = getReturnStartPosition(peer, mapNodeLayout, returnLayout, context);

      layer.links.moveTo(selectedStart.x, selectedStart.y);
      layer.links.lineTo(peerStart.x, peerStart.y);
      layer.links.stroke({
        color: 0xffffff,
        alpha: 0.15 * returnState.remaining,
        width: 1 + returnState.remaining * 0.6,
      });
    });
  }

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
    const isReturningClusterNode =
      hasMapReturnTransition && Boolean(returnLayout?.layout.has(node.id));
    const position = isReturningClusterNode
      ? getReturnNodePosition(node, mapNodeLayout, returnLayout, returnState.easedReturn, context)
      : {
          x: layout?.x ?? context.width / 2,
          y: layout?.y ?? context.height / 2,
        };
    const x = position.x;
    const y = position.y;
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
    const hasHoverContext = hoveredNode !== null && !hasTransitionNode && !hasMapReturnTransition;
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
        : hasMapReturnTransition
          ? isReturningClusterNode
            ? 0.04 + totalPulse * 0.12
            : 0.04 + totalPulse * 0.12
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
        : hasMapReturnTransition
          ? isReturningClusterNode
            ? Math.min(1, 0.85 + secretCuePulse * 0.08)
            : Math.min(1, 0.85 + secretCuePulse * 0.08)
          : hasHoverContext
            ? isHovered
              ? 0.98
              : isConnectedToHovered
                ? 0.76
                : 0.24
            : Math.min(1, 0.85 + secretCuePulse * 0.08),
    });

    if (
      !hasTransitionNode &&
      !hasMapReturnTransition &&
      isHovered &&
      (!isCoarsePointer || allowGuidedHoverInfo)
    ) {
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
