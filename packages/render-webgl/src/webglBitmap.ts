import type {
  Bitmap,
  DisplayObjectRenderer,
  Renderable,
  RendererData,
  RenderProxy2D,
  RenderState,
} from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { resolveWebGLMaterialRenderer } from './webglMaterialRegistry';
import {
  ensureWebGLQuadBatchShader,
  packWebGLSpriteBatchMaterialInstance,
  prepareWebGLSpriteBatchWrite,
} from './webglSpriteBatch';

interface WebGLBitmapData {
  lastSrc: CanvasImageSource | null;
  lastVersion: number;
}

function createWebGLBitmapData(_state: RenderState, _source: Renderable): RendererData | null {
  return { lastSrc: null, lastVersion: -1 } as unknown as RendererData;
}

// Deletes the cached GPU texture when this bitmap is torn down. Prevents textures from leaking when
// a bitmap is removed from the scene via disposeDisplayObjectSubtree.
function destroyWebGLBitmapData(state: RenderState, data: RendererData): void {
  const internal = state as WebGLRenderStateInternal;
  const { lastSrc } = data as unknown as WebGLBitmapData;
  if (lastSrc === null) return;
  const texture = internal.textureCache.get(lastSrc);
  if (texture !== undefined) {
    internal.gl.deleteTexture(texture);
    internal.textureCache.delete(lastSrc);
  }
}

export function drawWebGLBitmap(state: RenderState, renderProxy: RenderProxy2D): void {
  const internal = state as WebGLRenderStateInternal;
  const source = renderProxy.source as Bitmap;
  const imageSource = source.data.image;
  if (imageSource === null || imageSource.src === null) return;
  if (renderProxy.rendererData === null) return;

  const bitmapData = renderProxy.rendererData as unknown as WebGLBitmapData;
  const src = imageSource.src;
  const version = imageSource.version;

  // Invalidate the cached GPU texture when the image content changes in place (Surface edits) or
  // when the element reference is replaced (setBitmapImage). Both cases bump imageSource.version.
  if (bitmapData.lastVersion !== version || bitmapData.lastSrc !== src) {
    if (bitmapData.lastSrc !== null && bitmapData.lastSrc !== src) {
      const oldTexture = internal.textureCache.get(bitmapData.lastSrc);
      if (oldTexture !== undefined) {
        internal.gl.deleteTexture(oldTexture);
        internal.textureCache.delete(bitmapData.lastSrc);
      }
    }
    const staleTexture = internal.textureCache.get(src);
    if (staleTexture !== undefined) {
      internal.gl.deleteTexture(staleTexture);
      internal.textureCache.delete(src);
    }
    bitmapData.lastSrc = src;
    bitmapData.lastVersion = version;
  }

  const material = renderProxy.material;
  const materialRenderer = resolveWebGLMaterialRenderer(internal, material);
  if (materialRenderer === null) return;

  ensureWebGLQuadBatchShader(internal);

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
  const base = prepareWebGLSpriteBatchWrite(internal, src, renderProxy.blendMode, material, materialRenderer, 1);
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
  packWebGLSpriteBatchMaterialInstance(internal, renderProxy.materialData, startCount);
  internal.spriteBatchCount++;
}

export function drawWebGLBitmapMask(state: RenderState, data: RenderProxy2D): void {
  drawWebGLBitmap(state, data);
}

export const defaultWebGLBitmapRenderer: DisplayObjectRenderer = {
  format: BatchFormat.Quad,
  createData: createWebGLBitmapData,
  destroyData: destroyWebGLBitmapData,
  submit: drawWebGLBitmap,
};
