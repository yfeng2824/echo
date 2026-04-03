import type { EchoNode } from "@echo/contracts";
import type { WorldMapProjection } from "./map-projection";

export type MapNodeLayoutContext = {
  width: number;
  height: number;
  projection: Pick<WorldMapProjection, "project">;
};

export type MapNodeLayout = {
  anchorX: number;
  anchorY: number;
  x: number;
  y: number;
};

function getMapPosition(node: EchoNode, context: MapNodeLayoutContext) {
  return (
    context.projection.project(node.lng, node.lat) ?? {
      x: context.width / 2,
      y: context.height / 2,
    }
  );
}

export function getMapVerticalOffset(width: number, height: number) {
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

export function buildMapNodeLayout(nodes: EchoNode[], context: MapNodeLayoutContext) {
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
