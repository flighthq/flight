import { createImageResource } from '@flighthq/image/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type {
  GlRenderState,
  GlShapeRasterSurface,
  GlShapeRendererData,
  Renderable,
  RendererData,
} from '@flighthq/types/contract';

// Allocates the rasterization surface on first use. The canvas wrapped as an Image (its `source`) is
// what lets the shared quad-batch writer treat a canvas-backed shape uniformly with bitmaps and atlases;
// re-rendering the canvas bumps the resource's version (invalidateImageResource), which the batch's
// version-aware cache uses to re-upload.
export function acquireGlShapeRasterSurface(data: GlShapeRendererData): GlShapeRasterSurface {
  const existing = data.surface;
  if (existing !== null) return existing;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const surface: GlShapeRasterSurface = {
    canvas,
    ctx: canvas.getContext('2d')!,
    image: createImageResource(canvas),
  };
  data.surface = surface;
  return surface;
}

// Shared by all three shape strategies so a node keeps one cache whichever one draws it. Both halves
// start empty: nothing is allocated until a strategy needs it.
export function createGlShapeData(_state: GlRenderState, _source: Renderable): RendererData | null {
  return toGlShapeRendererData({
    surface: null,
    lastContentId: -1,
    lastPixelRatio: 0,
    lastW: 0,
    lastH: 0,
    meshVersion: -1,
    meshes: null,
  });
}

// The batch uploads this shape's canvas-backed resource into the shared cache; free that GPU texture when
// the shape is torn down so it does not leak past the resource it was keyed on. A shape that only ever
// tessellated has no surface and so no texture to free.
export function destroyGlShapeData(state: GlRenderState, data: RendererData): void {
  const runtime = getGlRenderStateRuntime(state);
  const surface = getGlShapeData(data).surface;
  if (surface === null) return;
  const entry = runtime.textureSourcePremultipliedTextureCache.get(surface.image);
  if (entry !== undefined) {
    state.gl.deleteTexture(entry.texture);
    runtime.textureSourcePremultipliedTextureCache.delete(surface.image);
  }
}

// RendererData is opaque by design, so the two casts that reinterpret it live here as a named pair
// rather than being scattered at every callsite.
export function getGlShapeData(data: RendererData): GlShapeRendererData {
  return data as unknown as GlShapeRendererData;
}

export function toGlShapeRendererData(data: GlShapeRendererData): RendererData {
  return data as unknown as RendererData;
}
