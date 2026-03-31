import { CanvasSource, Sprite, Texture } from "pixi.js";
import type { RenderContext } from "./pixi-types";

const MAX_TEXTURE_DPR = 2;

export type ProjectionTextureLayer = {
  mapSprite: Sprite;
  mapCanvas: HTMLCanvasElement;
  mapContext: CanvasRenderingContext2D | null;
  mapTextureSource: CanvasSource;
};

export function createProjectionTextureLayer(): ProjectionTextureLayer {
  const mapCanvas = document.createElement("canvas");
  const mapTextureSource = new CanvasSource({
    resource: mapCanvas,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, MAX_TEXTURE_DPR),
  });

  return {
    mapSprite: new Sprite(
      new Texture({
        source: mapTextureSource,
      })
    ),
    mapCanvas,
    mapContext: mapCanvas.getContext("2d"),
    mapTextureSource,
  };
}

export function syncProjectionTexture(layer: ProjectionTextureLayer, context: RenderContext) {
  layer.mapTextureSource.resize(context.width, context.height, context.dpr);

  if (!layer.mapContext) {
    return;
  }

  const targetWidth = layer.mapCanvas.width;
  const targetHeight = layer.mapCanvas.height;

  layer.mapContext.setTransform(1, 0, 0, 1, 0, 0);
  layer.mapContext.clearRect(0, 0, targetWidth, targetHeight);
  layer.mapContext.setTransform(context.dpr, 0, 0, context.dpr, 0, 0);
  context.projection.draw(layer.mapContext, 1);
  layer.mapContext.setTransform(1, 0, 0, 1, 0, 0);
  layer.mapTextureSource.update();
  layer.mapSprite.width = context.width;
  layer.mapSprite.height = context.height;
}
