import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { createCanvasHostSurface, destroyCanvasHostSurface } from '@flighthq/render/contract';
import type {
  CanvasSurface,
  EntityConstruction,
  GlRenderState,
  GlShapeRendererData,
  HostCanvasCapability,
  HostImageCapability,
  NodeAny,
  RendererData,
} from '@flighthq/types/contract';

export function acquireGlShapeRasterSurface(
  canvasHost: Readonly<HostCanvasCapability>,
  imageHost: Readonly<HostImageCapability>,
  data: GlShapeRendererData,
): CanvasSurface | null {
  const existing = data.surface;
  if (existing !== null) return existing;
  const surface = createCanvasHostSurface(canvasHost, 1, 1);
  if (surface === null) return null;
  data.surface = surface;
  data.image = imageHost.createImageFromSurface?.(surface) ?? null;
  return surface;
}

export function createGlShapeData(_state: GlRenderState, _source: NodeAny): RendererData | null {
  const out = allocateEntity<GlShapeRendererData>();
  initializeGlShapeData(out, _state, _source);
  return finishEntity(out);
}

// The batch uploads this shape's raster resource into the shared cache. Teardown deletes that GPU texture
// and removes its key before destroying the host-owned surface; a native host may hold a non-GC
// raster allocation beneath it. A shape that only ever tessellated owns neither resource.
export function destroyGlShapeData(state: GlRenderState, data: RendererData): void {
  const runtime = getGlRenderStateRuntime(state);
  const shapeData = getGlShapeData(data);
  const image = shapeData.image;
  if (image !== null) {
    const entry = runtime.context.textureSourcePremultipliedTextureCache.get(image);
    if (entry !== undefined) {
      state.gl.deleteTexture(entry.texture);
      runtime.context.textureSourcePremultipliedTextureCache.delete(image);
    }
  }
  if (shapeData.surface !== null) destroyCanvasHostSurface(shapeData.surface);
}

export function getGlShapeData(data: RendererData): GlShapeRendererData {
  return data as GlShapeRendererData;
}

// Shared by all three shape strategies so a node keeps one cache whichever one draws it. Both halves
// start empty: nothing is allocated until a strategy needs it.
export function initializeGlShapeData(
  out: EntityConstruction<GlShapeRendererData>,
  _state: GlRenderState,
  _source: NodeAny,
): void {
  out.image = null;
  out.lastContentId = -1;
  out.lastH = 0;
  out.lastPixelRatio = 0;
  out.lastW = 0;
  out.meshVersion = -1;
  out.meshes = null;
  out.surface = null;
}

export function toGlShapeRendererData(data: GlShapeRendererData): RendererData {
  return data;
}
