import {
  getWgpuRenderStateRuntime,
  resolveWgpuMaterialRenderer,
  resolveWgpuShader,
  resolveWgpuTexture,
} from '@flighthq/render-wgpu/contract';
import { noopRendererData } from '@flighthq/render/contract';
import { getTextureHeight, getTextureWidth, hasTextureBacking } from '@flighthq/texture/contract';
import type { RenderProxy2D, Scene2DRenderer, Sprite, WgpuRenderState } from '@flighthq/types/contract';
import { BatchFormat } from '@flighthq/types/contract';

import {
  ensureWgpuQuadBatchResources,
  flushWgpuSpriteBatch,
  packWgpuSpriteBatchMaterialInstance,
  prepareWgpuSpriteBatchWrite,
  recordWgpuSpriteBatchColorScaleBias,
} from './wgpuSpriteBatch';

export function drawWgpuSprite(state: WgpuRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.renderPass === null) return;

  const texture = (renderProxy.source as Sprite).data.texture;
  if (texture === null || texture.storage.dimension !== '2d' || !hasTextureBacking(texture)) return;

  const shader = resolveWgpuShader(state, renderProxy);
  if (shader !== null) {
    flushWgpuSpriteBatch(state);
    state.applyBlendMode?.(state, renderProxy.blendMode);
    if (resolveWgpuTexture(state, texture, true) === null) return;
    shader.bind(state, renderProxy);
    return;
  }

  const width = Math.max(0, getTextureWidth(texture)) * Math.abs(texture.uvScale.x);
  const height = Math.max(0, getTextureHeight(texture)) * Math.abs(texture.uvScale.y);
  if (width <= 0 || height <= 0) return;

  const material = renderProxy.material;
  const materialRenderer = resolveWgpuMaterialRenderer(state, material);
  if (materialRenderer === null) return;
  ensureWgpuQuadBatchResources(state);

  let u0 = texture.uvOffset.x;
  let v0 = texture.uvOffset.y;
  let u1 = u0 + texture.uvScale.x;
  let v1 = v0 + texture.uvScale.y;
  if (texture.flipX) [u0, u1] = [u1, u0];
  if (texture.flipY) [v0, v1] = [v1, v0];

  const instanceIndex = runtime.spriteBatchCount;
  const base = prepareWgpuSpriteBatchWrite(state, texture, renderProxy.blendMode, material, materialRenderer, 1);
  const data = runtime.spriteBatchInstanceData;
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
  packWgpuSpriteBatchMaterialInstance(state, renderProxy.materialData, instanceIndex);
  recordWgpuSpriteBatchColorScaleBias(state, renderProxy.colorMatrix ?? renderProxy.colorScaleBias, instanceIndex);
  runtime.spriteBatchCount++;
}

export const defaultWgpuSpriteRenderer: Scene2DRenderer = {
  format: BatchFormat.Quad,
  createData: noopRendererData,
  submit: drawWgpuSprite,
};
