import { useEffect, useRef } from "react";
import { useAppStore } from "../state/app-store";
import type { EchoEvent } from "@echo/contracts";
import { getDisplayNodeId } from "../lib/node-id";

const WORLD_ASCII = [
  "                                                                                ",
  "          #######                                                               ",
  "        ###########                  ########     ##################            ",
  "       ##############              ###################################          ",
  "      #################           #####################################         ",
  "      ###################        #######################################        ",
  "       ##################        #######################################  ##    ",
  "        ##################      ############################################    ",
  "         #################      ############################################    ",
  "           #############         ##########################################     ",
  "            ###########          ########################################       ",
  "             #########            #####################################         ",
  "              #######             ###################################           ",
  "               #####               #################################            ",
  "                ###                 ##############################       ##     ",
  "                ##                   ###########################       ######   ",
  "                                      #######################         ########  ",
  "                  ###                  ####################           ########  ",
  "                 #####                 ###################             ######   ",
  "                 ######                 ################                ####    ",
  "                 ######                  ##############                         ",
  "                 #####                    ###########                           ",
  "                 ####                      #########                            ",
  "                  ##                        #######                             ",
  "                                             #####                              ",
  "                                              ###                               ",
  "                                                                                "
];

function getVisualProfile(event: EchoEvent, scene: "map" | "node") {
  const baseIntensity = Math.max(0.08, Math.min(1, event.intensity));
  const rippleLayer = event.rippleLayer ?? 0;

  if (scene === "map") {
    const duration = event.source === "ambient" ? 1700 : 2000;
    const radius = 34 + baseIntensity * 26;

    return {
      duration,
      radius,
      alpha: 0.14 + baseIntensity * 0.2,
      halo: 0.08 + baseIntensity * 0.12
    };
  }

  const duration =
    rippleLayer > 0
      ? 900
      : event.source === "resonance"
        ? 2400
        : event.source === "ambient"
          ? 1600
          : 1900;
  const radius =
    rippleLayer > 0
      ? 42 + baseIntensity * 18
      : event.batchRole === "lead"
        ? 190 + baseIntensity * 36
        : 140 + baseIntensity * 28;
  const alpha =
    rippleLayer > 0
      ? 0.11 + baseIntensity * 0.1
      : event.batchRole === "lead"
        ? 0.2 + baseIntensity * 0.16
        : 0.13 + baseIntensity * 0.14;

  return {
    duration,
    radius,
    alpha,
    halo: rippleLayer > 0 ? 0.04 + baseIntensity * 0.06 : 0.06 + baseIntensity * 0.12
  };
}

export function RenderSurface() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeScene = useAppStore((state) => state.activeScene);
  const nodes = useAppStore((state) => state.nodes);
  const selectedNodeId = useAppStore((state) => state.selectedNodeId);
  const recentEvents = useAppStore((state) => state.recentEvents);
  const selectNode = useAppStore((state) => state.selectNode);
  const appendEvent = useAppStore((state) => state.appendEvent);
  const audio = useAppStore((state) => state.audio);
  const recentEventsRef = useRef(recentEvents);
  const audioRef = useRef(audio);
  const localLayoutSeedRef = useRef(0);

  useEffect(() => {
    recentEventsRef.current = recentEvents;
  }, [recentEvents]);

  useEffect(() => {
    audioRef.current = audio;
  }, [audio]);

  useEffect(() => {
    if (activeScene === "node" && selectedNodeId) {
      // Reseed the local field on entry so repeated visits do not feel identical.
      localLayoutSeedRef.current = Math.random() * 100000;
    }
  }, [activeScene, selectedNodeId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      return;
    }

    // TODO: replace this 2D renderer with Pixi once the motion language is stable.
    const MAX_RIPPLE_LAYER = 2;
    let animationFrame = 0;
    let hoveredNodeId: string | null = null;
    let dpr = 1;
    const collisionHistory = new Map<string, number>();
    const collisionAudioHistory = new Map<string, number>();
    let collisionBursts: Array<{
      x: number;
      y: number;
      createdAt: number;
      radius: number;
      leftNodeId: string;
      rightNodeId: string;
    }> = [];

    const resize = () => {
      dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.imageSmoothingEnabled = false;
    };

    const getMapLayout = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const mapWidth = Math.min(width * 0.8, 1100);
      const mapHeight = mapWidth * (27 / 80);
      const offsetX = width / 2 - mapWidth / 2;
      const offsetY = height / 2 - mapHeight / 2 + 20;

      return { width, height, mapWidth, mapHeight, offsetX, offsetY };
    };

    const getMapPosition = (lat: number, lng: number) => {
      const { mapWidth, mapHeight, offsetX, offsetY } = getMapLayout();

      return {
        x: offsetX + ((lng + 180) / 360) * mapWidth,
        y: offsetY + ((90 - lat) / 180) * mapHeight
      };
    };

    const hashString = (value: string) => {
      let hash = 0;

      for (const char of value) {
        hash = (hash * 31 + char.charCodeAt(0)) % 100000;
      }

      return hash;
    };

    const seededRandom = (seed: number) => {
      const value = Math.sin(seed) * 10000;
      return value - Math.floor(value);
    };

    const findNodeAtPoint = (clientX: number, clientY: number) => {
      for (const node of nodes) {
        const { x, y } = getMapPosition(node.lat, node.lng);
        const distance = Math.hypot(clientX - x, clientY - y);
        if (distance < 14) {
          return node;
        }
      }

      return null;
    };

    const drawMap = (time: number) => {
      const { width, height, mapWidth, mapHeight, offsetX, offsetY } = getMapLayout();
      const now = Date.now();

      context.fillStyle = "#000";
      context.fillRect(0, 0, width, height);

      context.fillStyle = "rgba(255, 255, 255, 0.16)";
      context.beginPath();
      for (let y = 0; y < WORLD_ASCII.length; y += 1) {
        const row = WORLD_ASCII[y];
        for (let x = 0; x < row.length; x += 1) {
          if (row[x] !== "#") {
            continue;
          }

          const px = Math.round(offsetX + (x / 79) * mapWidth);
          const py = Math.round(offsetY + (y / 26) * mapHeight);
          context.rect(px, py, 2, 2);
        }
      }
      context.fill();

      nodes.forEach((node, index) => {
        const rawPosition = getMapPosition(node.lat, node.lng);
        const x = Math.round(rawPosition.x);
        const y = Math.round(rawPosition.y);
        const nodeEvents = recentEventsRef.current.filter((event) => event.nodeId === node.id);
        const activeRipples = nodeEvents
          .map((event) => {
            const profile = getVisualProfile(event, "map");
            const age = now - new Date(event.at).getTime();
            if (age < 0 || age > profile.duration) {
              return null;
            }

            const progress = age / profile.duration;
            return {
              intensity: event.intensity,
              progress,
              profile
            };
          })
          .filter(Boolean) as Array<{
          intensity: number;
          progress: number;
          profile: ReturnType<typeof getVisualProfile>;
        }>;
        const pulseEnergy = activeRipples.reduce(
          (sum, ripple) => sum + (1 - ripple.progress) * ripple.intensity,
          0
        );
        const pulse = Math.max(0.12, Math.min(1.4, pulseEnergy));
        const isHovered = hoveredNodeId === node.id;
        const halo = 6 + Math.sin(time * 0.001 + index) * 2 + pulse * 16 + (isHovered ? 5 : 0);

        activeRipples.forEach((ripple) => {
          const rippleRadius = 8 + ripple.progress * ripple.profile.radius;
          const rippleAlpha = (1 - ripple.progress) * ripple.profile.alpha;

          context.beginPath();
          context.arc(x + 0.5, y + 0.5, rippleRadius, 0, Math.PI * 2);
          context.strokeStyle = `rgba(255, 255, 255, ${rippleAlpha})`;
          context.lineWidth = 1;
          context.stroke();
        });

        context.beginPath();
        context.arc(x, y, halo, 0, Math.PI * 2);
        context.fillStyle = `rgba(255, 255, 255, ${0.04 + pulse * 0.1 + (isHovered ? 0.06 : 0)})`;
        context.fill();

        context.beginPath();
        context.arc(x, y, (isHovered ? 4 : 3) + Math.min(2, pulse * 1.5), 0, Math.PI * 2);
        context.fillStyle = "rgba(255, 255, 255, 0.85)";
        context.fill();

        if (isHovered) {
          context.fillStyle = "rgba(255, 255, 255, 0.7)";
          context.font = '10px "Inter", sans-serif';
          context.fillText(getDisplayNodeId(node.id), x + halo + 6, y + 3);
        }
      });
    };

    const drawLocal = (time: number) => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const centerX = Math.round(width / 2);
      const centerY = Math.round(height / 2);
      const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];
      const now = Date.now();

      context.fillStyle = "#000";
      context.fillRect(0, 0, width, height);

      if (!selectedNode) {
        return;
      }

      const peers = nodes.filter((node) => selectedNode.peers.includes(node.id));
      const localNodes = [selectedNode, ...peers];
      const baseRadius = Math.min(width, height) * 0.31;
      const layout = new Map<string, { x: number; y: number; size: number; events: EchoEvent[] }>();

      layout.set(selectedNode.id, {
        x: centerX,
        y: centerY,
        size: 8,
        events: recentEventsRef.current.filter((event) => event.nodeId === selectedNode.id)
      });

      peers.forEach((peer, index) => {
        const hash = hashString(peer.id);
        const seedBase = localLayoutSeedRef.current + hash * 0.37 + index * 13.1;
        const angleJitter = (seededRandom(seedBase) - 0.5) * 0.7;
        const radialJitter = 0.82 + seededRandom(seedBase + 11.3) * 0.38;
        const orbitBias = (seededRandom(seedBase + 23.7) - 0.5) * 26;
        const angle =
          (index / Math.max(peers.length, 1)) * Math.PI * 2 +
          angleJitter +
          orbitBias * 0.01;
        const radius = baseRadius * radialJitter;
        const x = Math.round(centerX + Math.cos(angle) * radius);
        const y = Math.round(centerY + Math.sin(angle) * radius);

        layout.set(peer.id, {
          x,
          y,
          size: 4,
          events: recentEventsRef.current.filter((event) => event.nodeId === peer.id)
        });
      });

      // Keep the node scene relationship-based: center node plus direct peer links only.
      peers.forEach((peer) => {
        const peerLayout = layout.get(peer.id);
        if (!peerLayout) {
          return;
        }

        context.beginPath();
        context.moveTo(centerX + 0.5, centerY + 0.5);
        context.lineTo(peerLayout.x + 0.5, peerLayout.y + 0.5);
        context.strokeStyle = "rgba(255, 255, 255, 0.1)";
        context.lineWidth = 1;
        context.stroke();
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
            const age = now - new Date(event.at).getTime();
            if (age < 0 || age > profile.duration) {
              return null;
            }

            const progress = age / profile.duration;
            return {
              event,
              progress,
              profile
            };
          })
          .filter(Boolean) as Array<{
          event: EchoEvent;
          progress: number;
          profile: ReturnType<typeof getVisualProfile>;
        }>;
        const pulseEnergy = activeNodeRipples.reduce(
          (sum, ripple) => sum + (1 - ripple.progress) * ripple.event.intensity,
          0
        );
        const pulse = Math.max(0.14, Math.min(1.5, pulseEnergy));
        const haloSize =
          node.id === selectedNode.id
            ? 22 + pulse * 28 + Math.sin(time * 0.001 + index) * 2
            : 11 + pulse * 14 + Math.sin(time * 0.001 + index) * 1.2;

        activeNodeRipples.forEach((ripple) => {
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

          context.beginPath();
          context.arc(nodeLayout.x + 0.5, nodeLayout.y + 0.5, rippleRadius, 0, Math.PI * 2);
          context.strokeStyle = `rgba(255, 255, 255, ${rippleAlpha})`;
          context.lineWidth = node.id === selectedNode.id ? 2.4 : 1.8;
          context.stroke();
        });

        context.beginPath();
        context.arc(nodeLayout.x, nodeLayout.y, haloSize, 0, Math.PI * 2);
        context.fillStyle =
          node.id === selectedNode.id
            ? `rgba(255, 255, 255, ${0.04 + pulse * 0.11})`
            : `rgba(255, 255, 255, ${0.025 + pulse * 0.075})`;
        context.fill();

        context.beginPath();
        context.arc(
          nodeLayout.x,
          nodeLayout.y,
          node.id === selectedNode.id ? nodeLayout.size + pulse * 2.4 : nodeLayout.size + pulse,
          0,
          Math.PI * 2
        );
        context.fillStyle = "rgba(255, 255, 255, 0.9)";
        context.fill();
      });

      activeRipples.forEach((leftRipple, leftIndex) => {
        activeRipples.slice(leftIndex + 1).forEach((rightRipple) => {
          if (leftRipple.nodeId === rightRipple.nodeId) {
            return;
          }

          const dx = rightRipple.x - leftRipple.x;
          const dy = rightRipple.y - leftRipple.y;
          const distance = Math.hypot(dx, dy);
          const involvesSelectedNode =
            leftRipple.nodeId === selectedNode.id || rightRipple.nodeId === selectedNode.id;

          if (!involvesSelectedNode) {
            return;
          }

          if (
            distance <= Math.abs(leftRipple.radius - rightRipple.radius) ||
            distance >= leftRipple.radius + rightRipple.radius
          ) {
            return;
          }

          const collisionKey = [leftRipple.eventId, rightRipple.eventId].sort().join(":");
          if (collisionHistory.has(collisionKey)) {
            return;
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

          collisionHistory.set(collisionKey, now);
          collisionBursts.push({
            x: collisionX,
            y: collisionY,
            createdAt: now,
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

          // Collision echoes recurse only a little before the field settles back down.
          if (nextRippleLayer <= MAX_RIPPLE_LAYER && now - lastCollisionAudioAt > 900) {
            collisionAudioHistory.set(collisionBatchKey, now);

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
              rippleLayer: nextRippleLayer
            };

            appendEvent(collisionEvent);
            audioRef.current?.trigger(collisionEvent);
          }
        });
      });

      collisionBursts = collisionBursts.filter((burst) => now - burst.createdAt < 700);
      collisionBursts.forEach((burst) => {
        const progress = (now - burst.createdAt) / 700;
        const size = burst.radius * (0.55 + progress * 0.28);
        const alpha = 0.34 * (1 - progress);

        context.beginPath();
        context.arc(burst.x, burst.y, 3 + (1 - progress) * 6, 0, Math.PI * 2);
        context.fillStyle = `rgba(255, 255, 255, ${alpha * 0.65})`;
        context.fill();

        context.beginPath();
        context.arc(burst.x, burst.y, size + 4, 0, Math.PI * 2);
        context.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.85})`;
        context.lineWidth = 2.4;
        context.stroke();

        context.beginPath();
        context.arc(burst.x, burst.y, 8 + progress * 32, 0, Math.PI * 2);
        context.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.55})`;
        context.lineWidth = 1.8;
        context.stroke();
      });

      for (const [key, createdAt] of collisionHistory.entries()) {
        if (now - createdAt > 2600) {
          collisionHistory.delete(key);
        }
      }

      for (const [key, createdAt] of collisionAudioHistory.entries()) {
        if (now - createdAt > 2600) {
          collisionAudioHistory.delete(key);
        }
      }
    };

    const draw = (time: number) => {
      if (activeScene === "node") {
        drawLocal(time);
      } else {
        drawMap(time);
      }

      animationFrame = window.requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    const handlePointerMove = (event: PointerEvent) => {
      if (activeScene !== "map") {
        canvas.style.cursor = "default";
        hoveredNodeId = null;
        return;
      }

      const hoveredNode = findNodeAtPoint(event.clientX, event.clientY);
      hoveredNodeId = hoveredNode?.id ?? null;
      canvas.style.cursor = hoveredNode ? "pointer" : "default";
    };
    const handleClick = (event: MouseEvent) => {
      if (activeScene !== "map") {
        return;
      }

      const node = findNodeAtPoint(event.clientX, event.clientY);
      if (node) {
        selectNode(node.id);
      }
    };

    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("click", handleClick);
    animationFrame = window.requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("click", handleClick);
      canvas.style.cursor = "default";
      window.cancelAnimationFrame(animationFrame);
    };
  }, [activeScene, nodes, selectNode, selectedNodeId]);

  return <canvas ref={canvasRef} className="render-surface" aria-hidden="true" />;
}
