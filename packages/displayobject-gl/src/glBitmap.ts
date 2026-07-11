import { resolveGlMaterialRenderer } from '@flighthq/render-gl';
import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type {
  Bitmap,
  DisplayObjectRenderer,
  GlRenderState,
  Renderable,
  RendererData,
  RenderProxy2D,
} from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import {
  ensureGlQuadBatchShader,
  packGlSpriteBatchMaterialInstance,
  prepareGlSpriteBatchWrite,
  recordGlSpriteBatchColorTransform,
} from './glSpriteBatch';

interface GlBitmapData {
  lastSrc: CanvasImageSource | null;
  lastVersion: number;
}

function createGlBitmapData(_state: GlRenderState, _source: Renderable): RendererData | null {
  return { lastSrc: null, lastVersion: -1 } as unknown as RendererData;
}

// Deletes the cached GPU texture when this bitmap is torn down. Prevents textures from leaking when
// a bitmap is removed from the scene via disposeDisplayObjectRender.
function destroyGlBitmapData(state: GlRenderState, data: RendererData): void {
  const runtime = getGlRenderStateRuntime(state);
  const { lastSrc } = data as unknown as GlBitmapData;
  if (lastSrc === null) return;
  const texture = runtime.textureCache.get(lastSrc);
  if (texture !== undefined) {
    state.gl.deleteTexture(texture);
    runtime.textureCache.delete(lastSrc);
  }
}

export function drawGlBitmap(state: GlRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getGlRenderStateRuntime(state);
  const source = renderProxy.source as Bitmap;
  const imageSource = source.data.image;
  if (imageSource === null || imageSource.source === null) return;
  if (renderProxy.rendererData === null) return;

  const bitmapData = renderProxy.rendererData as unknown as GlBitmapData;
  const src = imageSource.source;
  const version = imageSource.version;

  // Invalidate the cached GPU texture when the image content changes in place (Surface edits) or
  // when the element reference is replaced (setBitmapImage). Both cases bump imageSource.version.
  if (bitmapData.lastVersion !== version || bitmapData.lastSrc !== src) {
    if (bitmapData.lastSrc !== null && bitmapData.lastSrc !== src) {
      const oldTexture = runtime.textureCache.get(bitmapData.lastSrc);
      if (oldTexture !== undefined) {
        state.gl.deleteTexture(oldTexture);
        runtime.textureCache.delete(bitmapData.lastSrc);
      }
    }
    const staleTexture = runtime.textureCache.get(src);
    if (staleTexture !== undefined) {
      state.gl.deleteTexture(staleTexture);
      runtime.textureCache.delete(src);
    }
    bitmapData.lastSrc = src;
    bitmapData.lastVersion = version;
  }

  const material = renderProxy.material;
  const materialRenderer = resolveGlMaterialRenderer(state, material);
  if (materialRenderer === null) return;

  ensureGlQuadBatchShader(state);

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
  const base = prepareGlSpriteBatchWrite(
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
  packGlSpriteBatchMaterialInstance(state, renderProxy.materialData, startCount);
  recordGlSpriteBatchColorTransform(state, renderProxy.colorTransform, startCount);
  runtime.spriteBatchCount++;
}

export const defaultGlBitmapRenderer: DisplayObjectRenderer = {
  format: BatchFormat.Quad,
  createData: createGlBitmapData,
  destroyData: destroyGlBitmapData,
  submit: drawGlBitmap,
};
