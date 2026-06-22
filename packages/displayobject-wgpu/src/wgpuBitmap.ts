import { noopRendererData } from '@flighthq/render';
import { bindWgpuTexture } from '@flighthq/render-wgpu';
import { resolveWgpuMaterialRenderer } from '@flighthq/render-wgpu';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import { resolveWgpuShader } from '@flighthq/render-wgpu';
import type { Bitmap, DisplayObjectRenderer, RenderProxy2D, WgpuRenderState } from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import {
  ensureWgpuQuadBatchResources,
  flushWgpuSpriteBatch,
  packWgpuSpriteBatchMaterialInstance,
  prepareWgpuSpriteBatchWrite,
} from './wgpuSpriteBatch';

export function drawWgpuBitmap(state: WgpuRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.renderPass === null) return;

  const source = renderProxy.source as Bitmap;
  const imageSource = source.data.image;
  if (imageSource === null || imageSource.source === null) return;

  // Custom per-node shader: flush pending batch to preserve painter's order, then draw immediately.
  const shader = resolveWgpuShader(state, renderProxy);
  if (shader !== null) {
    flushWgpuSpriteBatch(state);
    state.applyBlendMode?.(state, renderProxy.blendMode);
    bindWgpuTexture(state, imageSource.source);
    shader.bind(state, renderProxy);
    return;
  }

  const material = renderProxy.material;
  const materialRenderer = resolveWgpuMaterialRenderer(state, material);
  if (materialRenderer === null) return;

  ensureWgpuQuadBatchResources(state);

  const sr = source.data.sourceRectangle ?? null;
  const iw = 1 / (imageSource.width || 1);
  const ih = 1 / (imageSource.height || 1);
  let w: number;
  let h: number;
  let u0: number;
  let v0: number;
  let u1: number;
  let v1: number;
  if (sr === null) {
    w = imageSource.width;
    h = imageSource.height;
    u0 = 0;
    v0 = 0;
    u1 = 1;
    v1 = 1;
  } else {
    w = sr.width;
    h = sr.height;
    u0 = sr.x * iw;
    v0 = sr.y * ih;
    u1 = (sr.x + sr.width) * iw;
    v1 = (sr.y + sr.height) * ih;
  }

  const startCount = runtime.spriteBatchCount;
  const base = prepareWgpuSpriteBatchWrite(
    state,
    imageSource.source,
    renderProxy.blendMode,
    material,
    materialRenderer,
    1,
  );
  const d = runtime.spriteBatchInstanceData;
  const t = renderProxy.transform2D;
  d[base] = t.a;
  d[base + 1] = t.b;
  d[base + 2] = t.c;
  d[base + 3] = t.d;
  d[base + 4] = t.tx;
  d[base + 5] = t.ty;
  d[base + 6] = w;
  d[base + 7] = h;
  d[base + 8] = u0;
  d[base + 9] = v0;
  d[base + 10] = u1;
  d[base + 11] = v1;
  d[base + 12] = renderProxy.alpha;
  packWgpuSpriteBatchMaterialInstance(state, renderProxy.materialData, startCount);
  runtime.spriteBatchCount++;
}

export const defaultWgpuBitmapRenderer: DisplayObjectRenderer = {
  format: BatchFormat.Quad,
  createData: noopRendererData,
  submit: drawWgpuBitmap,
};
