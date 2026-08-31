import { createEntity } from '@flighthq/entity/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { createRaster2DSurface, destroyRaster2DSurface } from '@flighthq/render/contract';
import type {
  GlRenderState,
  GlShapeRendererData,
  Raster2DSurface,
  Renderable,
  RendererData,
} from '@flighthq/types/contract';

// Allocates the rasterization surface on first use. Its uploadable Image lets the shared quad-batch
// writer treat a rasterized shape uniformly with bitmaps and atlases; re-rendering the backing store
// bumps the resource's version (invalidateImageResource), which the batch's version-aware cache uses
// to re-upload.
export function acquireGlShapeRasterSurface(data: GlShapeRendererData): Raster2DSurface | null {
  const existing = data.surface;
  if (existing !== null) return existing;
  const surface = createRaster2DSurface(1, 1);
  if (surface === null) return null;
  data.surface = surface;
  return surface;
}

// Shared by all three shape strategies so a node keeps one cache whichever one draws it. Both halves
// start empty: nothing is allocated until a strategy needs it.
export function createGlShapeData(_state: GlRenderState, _source: Renderable): RendererData | null {
  return createEntity({
    surface: null,
    lastContentId: -1,
    lastPixelRatio: 0,
    lastW: 0,
    lastH: 0,
    meshVersion: -1,
    meshes: null,
  });
}

// The batch uploads this shape's raster resource into the shared cache. Teardown deletes that GPU texture
// and removes its key before destroying the provider-owned surface; a native provider may hold a non-GC
// raster allocation beneath it. A shape that only ever tessellated owns neither resource.
export function destroyGlShapeData(state: GlRenderState, data: RendererData): void {
  const runtime = getGlRenderStateRuntime(state);
  const surface = getGlShapeData(data).surface;
  if (surface === null) return;
  const entry = runtime.context.textureSourcePremultipliedTextureCache.get(surface.image);
  if (entry !== undefined) {
    state.gl.deleteTexture(entry.texture);
    runtime.context.textureSourcePremultipliedTextureCache.delete(surface.image);
  }
  destroyRaster2DSurface(surface);
}

export function getGlShapeData(data: RendererData): GlShapeRendererData {
  return data as GlShapeRendererData;
}

export function toGlShapeRendererData(data: GlShapeRendererData): RendererData {
  return data;
}
