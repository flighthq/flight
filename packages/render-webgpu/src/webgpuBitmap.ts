import { noopRendererData } from '@flighthq/render';
import type { Bitmap, DisplayObjectRenderer, RenderProxy2D, RenderState } from '@flighthq/types';

import type { WebGPURenderStateInternal } from './internal';
import { bindWebGPUTexture } from './webgpuDraw';
import { resolveWebGPUMaterialRenderer } from './webgpuMaterialRegistry';
import { resolveWebGPUShader } from './webgpuShaderBinding';
import {
  ensureWebGPUQuadBatchResources,
  flushWebGPUSpriteBatch,
  packWebGPUSpriteBatchMaterialInstance,
  prepareWebGPUSpriteBatchWrite,
} from './webgpuSpriteBatch';

export function drawWebGPUBitmap(state: RenderState, renderProxy: RenderProxy2D): void {
  const internal = state as WebGPURenderStateInternal;
  if (internal.renderPass === null) return;

  const source = renderProxy.source as Bitmap;
  const imageSource = source.data.image;
  if (imageSource === null || imageSource.src === null) return;

  // Custom per-node shader: flush pending batch to preserve painter's order, then draw immediately.
  const shader = resolveWebGPUShader(internal, renderProxy);
  if (shader !== null) {
    flushWebGPUSpriteBatch(internal);
    internal.applyBlendMode?.(internal, renderProxy.blendMode);
    bindWebGPUTexture(internal, imageSource.src);
    shader.bind(internal, renderProxy);
    return;
  }

  const material = renderProxy.material;
  const materialRenderer = resolveWebGPUMaterialRenderer(internal, material);
  if (materialRenderer === null) return;

  ensureWebGPUQuadBatchResources(internal);

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

  const startCount = internal.spriteBatchCount;
  const base = prepareWebGPUSpriteBatchWrite(
    internal,
    imageSource.src,
    renderProxy.blendMode,
    material,
    materialRenderer,
    1,
  );
  const d = internal.spriteBatchInstanceData;
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
  packWebGPUSpriteBatchMaterialInstance(internal, renderProxy.materialData, startCount);
  internal.spriteBatchCount++;
}

export function drawWebGPUBitmapMask(state: RenderState, data: RenderProxy2D): void {
  drawWebGPUBitmap(state, data);
}

export const defaultWebGPUBitmapRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawWebGPUBitmap,
};
