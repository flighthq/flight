import { noopRendererData } from '@flighthq/render/contract';
import { getNode2DRuntime } from '@flighthq/scene2d/contract';
import type {
  BitmapText,
  BitmapTextRuntime,
  CanvasRenderState,
  RenderProxy2D,
  SpriteRenderer,
} from '@flighthq/types/contract';

import { applyCanvasMaterial } from './canvasMaterialRegistry';
import { resolveCanvasTexture } from './canvasTextureResolver';

// Draws a BitmapText leaf on Canvas 2D: one `drawImage` per glyph, per glyph-atlas page. Canvas realizes
// no color-adjustment fold, so a node tint is not applied here (honest — the missing
// `enableCanvasColorAdjustment` is the signal). Mirrors `drawCanvasQuadBatch`'s vector2 path, one page at
// a time.
export function drawCanvasSpriteText(state: CanvasRenderState, node: RenderProxy2D): void {
  const source = node.source as BitmapText;
  const pages = (getNode2DRuntime(source) as BitmapTextRuntime).pages;

  const context = state.context;
  const transform = node.transform2D;
  const roundPixels = state.roundPixels;

  state.applyBlendMode?.(state, node.blendMode);
  context.globalAlpha = node.alpha;
  if (!state.allowSmoothing) context.imageSmoothingEnabled = false;
  const restoreMaterial = applyCanvasMaterial(state, node.material);
  context.setTransform(transform.a, transform.b, transform.c, transform.d, transform.tx, transform.ty);

  for (const page of pages) {
    const atlas = page.atlas;
    const texture = atlas.texture;
    if (texture === null || page.instanceCount === 0) continue;
    const domImage = resolveCanvasTexture(state, texture);
    if (domImage === null) continue;
    const regions = atlas.regions;
    const numRegions = regions.length;
    const ids = page.ids;
    const transforms = page.transforms;

    for (let i = 0; i < page.instanceCount; i++) {
      const id = ids[i];
      if (id < 0 || id >= numRegions) continue;
      const region = regions[id];
      if (region.width <= 0 || region.height <= 0) continue;
      const dx = transforms[i * 2];
      const dy = transforms[i * 2 + 1];
      context.drawImage(
        domImage,
        region.x,
        region.y,
        region.width,
        region.height,
        roundPixels ? dx | 0 : dx,
        roundPixels ? dy | 0 : dy,
        region.width,
        region.height,
      );
    }
  }

  if (restoreMaterial) context.restore();
  context.setTransform(1, 0, 0, 1, 0, 0);
  if (!state.allowSmoothing) context.imageSmoothingEnabled = true;
}

export const defaultCanvasBitmapTextRenderer: SpriteRenderer = {
  createData: noopRendererData,
  submit: drawCanvasSpriteText,
};
