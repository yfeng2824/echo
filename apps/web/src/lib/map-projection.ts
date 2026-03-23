import { geoNaturalEarth1, geoPath, type GeoProjection } from "d3-geo";
import landTopology from "world-atlas/land-110m.json";
import { feature } from "topojson-client";

export type ProjectedPoint = {
  x: number;
  y: number;
};

export type MapBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type WorldMapProjection = {
  width: number;
  height: number;
  bounds: MapBounds;
  project: (lng: number, lat: number) => ProjectedPoint | null;
  draw: (context: CanvasRenderingContext2D, alpha: number) => void;
};

const landFeature = feature(
  landTopology as never,
  (landTopology as typeof landTopology).objects.land as never
);

export function createWorldMapProjection(
  width: number,
  height: number
): WorldMapProjection {
  const projection = geoNaturalEarth1();
  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));
  const horizontalPadding = clamp(width * 0.045, 8, 64);
  const verticalPadding = clamp(height * 0.09, 20, 92);

  projection.fitExtent(
    [
      [horizontalPadding, verticalPadding],
      [width - horizontalPadding, height - verticalPadding]
    ],
    landFeature
  );

  const path = geoPath(projection);
  const [min, max] = path.bounds(landFeature);

  return {
    width,
    height,
    bounds: {
      minX: min[0],
      minY: min[1],
      maxX: max[0],
      maxY: max[1]
    },
    project: (lng, lat) => {
      const point = projection([lng, lat]);
      if (!point) {
        return null;
      }

      return { x: point[0], y: point[1] };
    },
    draw: (context, alpha) => {
      if (alpha <= 0.01) {
        return;
      }

      const contextualPath = geoPath(projection as GeoProjection, context);
      context.save();

      context.beginPath();
      contextualPath(landFeature);
      context.fillStyle = `rgba(255, 255, 255, ${0.012 * alpha})`;
      context.fill();

      context.beginPath();
      contextualPath(landFeature);
      context.strokeStyle = `rgba(255, 255, 255, ${0.03 * alpha})`;
      context.lineWidth = 2.2;
      context.stroke();

      context.beginPath();
      contextualPath(landFeature);
      context.strokeStyle = `rgba(255, 255, 255, ${0.085 * alpha})`;
      context.lineWidth = 0.8;
      context.stroke();

      context.restore();
    }
  };
}
