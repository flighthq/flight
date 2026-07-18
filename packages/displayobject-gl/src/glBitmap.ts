import { hasImageResourcePixels } from '@flighthq/image';
import { resolveGlMaterialRenderer } from '@flighthq/render-gl';
import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type {
  Bitmap,
  DisplayObjectRenderer,
  GlRenderState,
  ImageResource,
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
  image: ImageResource | null;
}

function createGlBitmapData(_state: GlRenderState, _source: Renderable): RendererData | null {
  return { image: null } as unknown as RendererData;
}

// Deletes the cached GPU texture when this bitmap is torn down. Prevents textures from leaking when
// a bitmap is removed from the scene via disposeDisplayObjectRender. Content-change re-upload is handled
// by bindGlTexture's version-aware cache, so this only frees on teardown.
function destroyGlBitmapData(state: GlRenderState, data: RendererData): void {
  const runtime = getGlRenderStateRuntime(state);
  const { image } = data as unknown as GlBitmapData;
  if (image === null) return;
  const entry = runtime.imageResourceTextureCache.get(image);
  if (entry !== undefined) {
    state.gl.deleteTexture(entry.texture);
    runtime.imageResourceTextureCache.delete(image);
  }
}

export function drawGlBitmap(state: GlRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getGlRenderStateRuntime(state);
  const source = renderProxy.source as Bitmap;
  const imageSource = source.data.image;
  if (imageSource === null || !hasImageResourcePixels(imageSource)) return;
  if (renderProxy.rendererData === null) return;

  // Recorded so teardown can free the resource's cached GPU texture; re-upload on content change is the
  // cache's job (keyed by the resource, version-aware), not this node's.
  (renderProxy.rendererData as unknown as GlBitmapData).image = imageSource;

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
  const base = prepareGlSpriteBatchWrite(state, imageSource, renderProxy.blendMode, material, materialRenderer, 1);
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
