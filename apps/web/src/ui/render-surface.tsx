import { useEffect, useRef } from "react";
import { useAppStore } from "../state/app-store";

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

export function RenderSurface() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeScene = useAppStore((state) => state.activeScene);
  const nodes = useAppStore((state) => state.nodes);
  const selectedNodeId = useAppStore((state) => state.selectedNodeId);
  const recentEvents = useAppStore((state) => state.recentEvents);
  const selectNode = useAppStore((state) => state.selectNode);
  const recentEventsRef = useRef(recentEvents);

  useEffect(() => {
    recentEventsRef.current = recentEvents;
  }, [recentEvents]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      return;
    }

    // TODO: replace this 2D placeholder renderer with Pixi scenes.
    let animationFrame = 0;
    let hoveredNodeId: string | null = null;
    let dpr = 1;

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
            const age = now - new Date(event.at).getTime();
            if (age < 0 || age > 2200) {
              return null;
            }

            const progress = age / 2200;
            return {
              intensity: event.intensity,
              progress
            };
          })
          .filter(Boolean) as Array<{ intensity: number; progress: number }>;
        const pulseEnergy = activeRipples.reduce(
          (sum, ripple) => sum + (1 - ripple.progress) * ripple.intensity,
          0
        );
        const pulse = Math.max(0.12, Math.min(1.4, pulseEnergy));
        const isHovered = hoveredNodeId === node.id;
        const halo = 6 + Math.sin(time * 0.001 + index) * 2 + pulse * 16 + (isHovered ? 5 : 0);

        activeRipples.forEach((ripple) => {
          const rippleRadius = 8 + ripple.progress * 42;
          const rippleAlpha = (1 - ripple.progress) * (0.18 + ripple.intensity * 0.22);

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
          context.fillText(node.id, x + halo + 6, y + 3);
        }
      });
    };

    const drawLocal = (time: number) => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const centerX = width / 2;
      const centerY = height / 2;
      const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];

      context.fillStyle = "#000";
      context.fillRect(0, 0, width, height);

      if (!selectedNode) {
        return;
      }

      const peers = nodes.filter((node) => selectedNode.peers.includes(node.id));
      const ringRadius = Math.min(width, height) * 0.28;

      peers.forEach((peer, index) => {
        const angle = (index / Math.max(peers.length, 1)) * Math.PI * 2 + time * 0.00015;
        const x = Math.round(centerX + Math.cos(angle) * ringRadius);
        const y = Math.round(centerY + Math.sin(angle) * ringRadius);
        const pulseSource = recentEventsRef.current.find((event) => event.nodeId === peer.id);
        const pulse = pulseSource ? pulseSource.intensity : 0.15;

        context.beginPath();
        context.moveTo(Math.round(centerX) + 0.5, Math.round(centerY) + 0.5);
        context.lineTo(x + 0.5, y + 0.5);
        context.strokeStyle = `rgba(255, 255, 255, ${0.08 + pulse * 0.24})`;
        context.lineWidth = 1;
        context.stroke();

        context.beginPath();
        context.arc(x, y, 10 + pulse * 12, 0, Math.PI * 2);
        context.fillStyle = `rgba(255, 255, 255, ${0.03 + pulse * 0.08})`;
        context.fill();

        context.beginPath();
        context.arc(x, y, 2.5, 0, Math.PI * 2);
        context.fillStyle = "rgba(255, 255, 255, 0.85)";
        context.fill();
      });

      const selectedPulseSource = recentEventsRef.current.find(
        (event) => event.nodeId === selectedNode.id
      );
      const selectedPulse = selectedPulseSource ? selectedPulseSource.intensity : 0.28;

      context.beginPath();
      context.arc(Math.round(centerX), Math.round(centerY), 26 + selectedPulse * 20, 0, Math.PI * 2);
      context.fillStyle = `rgba(255, 255, 255, ${0.04 + selectedPulse * 0.1})`;
      context.fill();

      context.beginPath();
      context.arc(Math.round(centerX), Math.round(centerY), 5, 0, Math.PI * 2);
      context.fillStyle = "#fff";
      context.fill();
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
