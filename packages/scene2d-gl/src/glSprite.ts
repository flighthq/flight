import { resolveGlMaterialRenderer, resolveGlTexture } from '@flighthq/render-gl/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { SCENE2D_WORKING_COLOR_SPACE } from '@flighthq/render/contract';
import { createSpriteRendererData, isSpriteRendererDirty } from '@flighthq/scene2d/contract';
import { getTextureHeight, getTextureSourceKind, getTextureWidth, hasTextureSource } from '@flighthq/texture/contract';
import type { GlRenderState, RenderProxy2D, Scene2DRenderer, Sprite } from '@flighthq/types/contract';
import { BatchFormat, RenderTargetTextureSourceKind } from '@flighthq/types/contract';

import {
  ensureGlQuadBatchShader,
  packGlQuadBatchMaterialInstance,
  prepareGlQuadBatchWrite,
  recordGlQuadBatchColorScaleBias,
} from './glQuadBatchWriter';

export function drawGlSprite(state: GlRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getGlRenderStateRuntime(state);
  const texture = (renderProxy.source as Sprite).data.texture;
  if (texture === null || texture.dimension !== '2d' || !hasTextureSource(texture)) return;

  const width = Math.max(0, getTextureWidth(texture)) * Math.abs(texture.uvScale.x);
  const height = Math.max(0, getTextureHeight(texture)) * Math.abs(texture.uvScale.y);
  if (width <= 0 || height <= 0) return;

  const material = renderProxy.material;
  const materialRenderer = resolveGlMaterialRenderer(state, material);
  if (materialRenderer === null) return;
  const glTexture = resolveGlTexture(state, texture, true, SCENE2D_WORKING_COLOR_SPACE);
  if (glTexture === null) return;
  const straightAlpha = runtime.currentTextureRealization!.straightAlpha;
  ensureGlQuadBatchShader(state);

  let u0 = texture.uvOffset.x;
  let v0 = texture.uvOffset.y;
  let u1 = u0 + texture.uvScale.x;
  let v1 = v0 + texture.uvScale.y;
  if (texture.flipX) [u0, u1] = [u1, u0];
  if (texture.flipY) [v0, v1] = [v1, v0];
  // Texture view coordinates are top-origin, while GL render attachments are bottom-origin. Reflect
  // both endpoints so a sub-view keeps selecting the same logical rows (a swap alone only works for
  // the full [0, 1] view).
  if (getTextureSourceKind(texture) === RenderTargetTextureSourceKind) {
    v0 = 1 - v0;
    v1 = 1 - v1;
  }

  const instanceIndex = runtime.quadBatchWriterCount;
  const base = prepareGlQuadBatchWrite(
    state,
    glTexture,
    straightAlpha,
    texture.sampler,
    renderProxy.blendMode,
    material,
    materialRenderer,
    1,
  );
  const data = runtime.quadBatchWriterInstanceData;
  const transform = renderProxy.transform2D;
  data[base] = transform.a;
  data[base + 1] = transform.b;
  data[base + 2] = transform.c;
  data[base + 3] = transform.d;
  data[base + 4] = transform.tx;
  data[base + 5] = transform.ty;
  data[base + 6] = width;
  data[base + 7] = height;
  data[base + 8] = u0;
  data[base + 9] = v0;
  data[base + 10] = u1;
  data[base + 11] = v1;
  data[base + 12] = renderProxy.alpha;
  packGlQuadBatchMaterialInstance(state, renderProxy.materialData, instanceIndex);
  recordGlQuadBatchColorScaleBias(state, renderProxy.colorMatrix ?? renderProxy.colorScaleBias, instanceIndex);
  runtime.quadBatchWriterCount++;
}

export const defaultGlSpriteRenderer: Scene2DRenderer = {
  format: BatchFormat.Quad,
  createData: createSpriteRendererData,
  isDirty: isSpriteRendererDirty,
  submit: drawGlSprite,
};
