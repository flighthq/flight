import { createMatrix3 } from '@flighthq/geometry/contract';
import { resolveGlMaterialRenderer, resolveGlTexture } from '@flighthq/render-gl/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { SCENE2D_WORKING_COLOR_SPACE } from '@flighthq/render/contract';
import { createSpriteRendererData, isSpriteRendererDirty } from '@flighthq/scene2d/contract';
import {
  getTextureSourceKind,
  getTextureUvMatrix,
  getTextureViewSize,
  hasTextureSource,
} from '@flighthq/texture/contract';
import type { GlRenderState, RenderProxy2D, Scene2DRenderer, Sprite } from '@flighthq/types/contract';
import { BatchFormat, RenderTargetTextureSourceKind } from '@flighthq/types/contract';

import {
  QUAD_BATCH_INSTANCE_FLOATS,
  ensureGlQuadBatchShader,
  packGlQuadBatchMaterialInstance,
  prepareGlQuadBatchWrite,
  recordGlQuadBatchColorScaleBias,
  writeGlQuadBatchAffineInstance,
} from './glQuadBatchWriter';

export function drawGlSprite(state: GlRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getGlRenderStateRuntime(state);
  const texture = (renderProxy.source as Sprite).data.texture;
  if (texture === null || texture.dimension !== '2d' || !hasTextureSource(texture)) return;

  getTextureViewSize(spriteViewSize, texture);
  const width = spriteViewSize.x;
  const height = spriteViewSize.y;
  if (width <= 0 || height <= 0) return;

  const material = renderProxy.material;
  const materialRenderer = resolveGlMaterialRenderer(state, material);
  if (materialRenderer === null) return;
  const glTexture = resolveGlTexture(state, texture, true, SCENE2D_WORKING_COLOR_SPACE);
  if (glTexture === null) return;
  const straightAlpha = runtime.context.currentTextureRealization!.straightAlpha;
  ensureGlQuadBatchShader(state);

  getTextureUvMatrix(spriteUvMatrix, texture);
  const uv = spriteUvMatrix.m;
  let uvOriginY = uv[7];
  let uvAxisUY = uv[1];
  let uvAxisVY = uv[4];
  // Texture view coordinates are top-origin, while GL render attachments are bottom-origin. Reflect
  // both endpoints so a sub-view keeps selecting the same logical rows (a swap alone only works for
  // the full [0, 1] view).
  if (getTextureSourceKind(texture) === RenderTargetTextureSourceKind) {
    uvOriginY = 1 - uvOriginY;
    uvAxisUY = -uvAxisUY;
    uvAxisVY = -uvAxisVY;
  }

  const instanceIndex = prepareGlQuadBatchWrite(
    state,
    glTexture,
    straightAlpha,
    texture.sampler,
    renderProxy.blendMode,
    material,
    materialRenderer,
    1,
  );
  const base = instanceIndex * QUAD_BATCH_INSTANCE_FLOATS;
  const data = runtime.quadBatchWriterInstanceData;
  const transform = renderProxy.transform2D;
  writeGlQuadBatchAffineInstance(
    data,
    base,
    transform,
    width,
    height,
    uv[6],
    uvOriginY,
    uv[0],
    uvAxisUY,
    uv[3],
    uvAxisVY,
    renderProxy.alpha,
  );
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

const spriteUvMatrix = createMatrix3();
const spriteViewSize = { x: 0, y: 0 };
