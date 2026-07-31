import { createSpriteRendererData, isSpriteRendererDirty } from '@flighthq/scene2d/contract';
import { getTextureHeight, getTextureWidth } from '@flighthq/texture/contract';
import type { CanvasRenderState, RenderProxy2D, Scene2DRenderer, Sprite } from '@flighthq/types/contract';

import { drawCanvasScene2D } from './canvasNode2D';
import { resolveCanvasTexture } from './canvasTextureResolver';
import { setCanvasTransform } from './canvasTransform';

export function drawCanvasSprite(state: CanvasRenderState, sprite: RenderProxy2D): void {
  drawCanvasScene2D(state, sprite);
  const texture = (sprite.source as Sprite).data.texture;
  if (texture === null || texture.dimension !== '2d') return;
  const drawable = resolveCanvasTexture(state, texture);
  if (drawable === null) return;

  const textureWidth = getTextureWidth(texture);
  const textureHeight = getTextureHeight(texture);
  const sourceX = texture.uvOffset.x * textureWidth;
  const sourceY = texture.uvOffset.y * textureHeight;
  const sourceWidth = Math.abs(texture.uvScale.x * textureWidth);
  const sourceHeight = Math.abs(texture.uvScale.y * textureHeight);
  if (sourceWidth <= 0 || sourceHeight <= 0) return;

  const context = state.context;
  state.applyBlendMode?.(state, sprite.blendMode);
  context.globalAlpha = sprite.alpha;
  setCanvasTransform(state, context, sprite.transform2D);

  const smoothing = state.allowSmoothing && !texture.sampler.magFilter.startsWith('nearest');
  if (!smoothing) context.imageSmoothingEnabled = false;
  context.drawImage(drawable, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
  if (!smoothing) context.imageSmoothingEnabled = true;
}

export const defaultCanvasSpriteRenderer: Scene2DRenderer = {
  createData: createSpriteRendererData,
  isDirty: isSpriteRendererDirty,
  submit: drawCanvasSprite,
};
