import { createSpriteRendererData, isSpriteRendererDirty } from '@flighthq/scene2d/contract';
import { getTextureViewSize } from '@flighthq/texture/contract';
import type { CanvasRenderState, RenderProxy2D, Scene2DRenderer, Sprite } from '@flighthq/types/contract';

import { drawCanvasScene2D } from './canvasNode2D';
import {
  getCanvasRenderStateTextureResolvers,
  resolveCanvasTextureSmoothing,
  setCanvasGlobalAlpha,
  setCanvasImageSmoothing,
} from './canvasRenderState';
import { resolveCanvasTexture } from './canvasTextureResolver';
import { drawCanvasTextureView } from './canvasTextureView';
import { setCanvasTransform } from './canvasTransform';

export function drawCanvasSprite(state: CanvasRenderState, sprite: RenderProxy2D): void {
  drawCanvasScene2D(state, sprite);
  const texture = (sprite.source as Sprite).data.texture;
  if (texture === null || texture.dimension !== '2d') return;
  const drawable = resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), texture);
  if (drawable === null) return;

  getTextureViewSize(spriteViewSize, texture);
  const viewWidth = spriteViewSize.x;
  const viewHeight = spriteViewSize.y;
  if (viewWidth <= 0 || viewHeight <= 0) return;

  const context = state.context;
  state.applyBlendMode?.(state, sprite.blendMode);
  setCanvasGlobalAlpha(state, sprite.alpha);
  setCanvasTransform(state, context, sprite.transform2D);

  const smoothing = resolveCanvasTextureSmoothing(state, texture.sampler.magFilter);
  if (!smoothing) setCanvasImageSmoothing(state, false);
  drawCanvasTextureView(context, drawable, texture, viewWidth, viewHeight);
  if (!smoothing) setCanvasImageSmoothing(state, true);
}

export const defaultCanvasSpriteRenderer: Scene2DRenderer = {
  createData: createSpriteRendererData,
  isDirty: isSpriteRendererDirty,
  submit: drawCanvasSprite,
};

const spriteViewSize = { x: 0, y: 0 };
