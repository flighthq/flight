import { createMatrix3 } from '@flighthq/geometry/contract';
import {
  getWgpuRenderStateRuntime,
  resolveWgpuMaterialRenderer,
  resolveWgpuApplyBlendMode,
  resolveWgpuShader,
  resolveWgpuTexture,
} from '@flighthq/render-wgpu/contract';
import { SCENE2D_WORKING_COLOR_SPACE } from '@flighthq/render/contract';
import { createSpriteRendererData, isSpriteRendererDirty } from '@flighthq/scene2d/contract';
import { getTextureUvMatrix, getTextureViewSize, hasTextureSource } from '@flighthq/texture/contract';
import type { RenderProxy2D, Scene2DRenderer, Sprite, WgpuRenderState } from '@flighthq/types/contract';
import { BatchFormat } from '@flighthq/types/contract';

import {
  QUAD_BATCH_INSTANCE_FLOATS,
  ensureWgpuQuadBatchResources,
  flushWgpuQuadBatchWriter,
  packWgpuQuadBatchMaterialInstance,
  prepareWgpuQuadBatchWrite,
  recordWgpuQuadBatchColorScaleBias,
  writeWgpuQuadBatchAffineInstance,
} from './wgpuQuadBatchWriter';

export function drawWgpuSprite(state: WgpuRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.renderPass === null) return;

  const texture = (renderProxy.source as Sprite).data.texture;
  if (texture === null || texture.dimension !== '2d' || !hasTextureSource(texture)) return;

  const shader = resolveWgpuShader(state, renderProxy);
  if (shader !== null) {
    flushWgpuQuadBatchWriter(state);
    resolveWgpuApplyBlendMode(state)?.(state, renderProxy.blendMode);
    if (resolveWgpuTexture(state, texture, true, SCENE2D_WORKING_COLOR_SPACE) === null) return;
    shader.bind(state, renderProxy);
    return;
  }

  getTextureViewSize(spriteViewSize, texture);
  const width = spriteViewSize.x;
  const height = spriteViewSize.y;
  if (width <= 0 || height <= 0) return;

  const material = renderProxy.material;
  const materialRenderer = resolveWgpuMaterialRenderer(state, material);
  if (materialRenderer === null) return;
  const textureEntry = resolveWgpuTexture(state, texture, true, SCENE2D_WORKING_COLOR_SPACE);
  if (textureEntry === null) return;
  ensureWgpuQuadBatchResources(state);

  getTextureUvMatrix(spriteUvMatrix, texture);
  const uv = spriteUvMatrix.m;

  const instanceIndex = prepareWgpuQuadBatchWrite(
    state,
    textureEntry,
    texture.sampler,
    renderProxy.blendMode,
    material,
    materialRenderer,
    1,
  );
  const base = instanceIndex * QUAD_BATCH_INSTANCE_FLOATS;
  const data = runtime.quadBatchWriterInstanceData;
  const transform = renderProxy.transform2D;
  writeWgpuQuadBatchAffineInstance(
    data,
    base,
    transform,
    width,
    height,
    uv[6],
    uv[7],
    uv[0],
    uv[1],
    uv[3],
    uv[4],
    renderProxy.alpha,
  );
  packWgpuQuadBatchMaterialInstance(state, renderProxy.materialData, instanceIndex);
  recordWgpuQuadBatchColorScaleBias(state, renderProxy.colorMatrix ?? renderProxy.colorScaleBias, instanceIndex);
  runtime.quadBatchWriterCount++;
}

export const defaultWgpuSpriteRenderer: Scene2DRenderer = {
  format: BatchFormat.Quad,
  createData: createSpriteRendererData,
  isDirty: isSpriteRendererDirty,
  submit: drawWgpuSprite,
};

const spriteUvMatrix = createMatrix3();
const spriteViewSize = { x: 0, y: 0 };
