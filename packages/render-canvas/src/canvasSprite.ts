import { createNullRendererData } from '@flighthq/render';
import type { CanvasRenderState, Sprite, SpriteRenderer, SpriteRenderNode } from '@flighthq/types';

import { setCanvasBlendMode } from './canvasMaterials';

export function drawCanvasSprite(state: CanvasRenderState, spriteNode: SpriteRenderNode): void {
  const source = spriteNode.source as Sprite;
  const { atlas, id } = source.data;
  if (atlas === null || atlas.image === null || atlas.image.src === null) return;

  const regions = atlas.regions;
  if (id < 0 || id >= regions.length) return;

  const region = regions[id];
  if (region.width <= 0 || region.height <= 0) return;

  setCanvasBlendMode(state, spriteNode.blendMode);

  const context = state.context;
  const transform = spriteNode.transform2D;

  context.globalAlpha = spriteNode.alpha;

  if (!state.allowSmoothing) {
    context.imageSmoothingEnabled = false;
  }

  context.setTransform(transform.a, transform.b, transform.c, transform.d, transform.tx, transform.ty);
  context.drawImage(
    atlas.image.src,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    region.width,
    region.height,
  );

  if (!state.allowSmoothing) {
    context.imageSmoothingEnabled = true;
  }
}

export const defaultCanvasSpriteRenderer: SpriteRenderer = {
  createData: createNullRendererData,
  draw: drawCanvasSprite,
};
