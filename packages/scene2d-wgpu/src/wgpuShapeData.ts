import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { createCanvasHostSurface, destroyCanvasHostSurface } from '@flighthq/render/contract';
import type {
  CanvasSurface,
  HostCanvasCapability,
  HostImageCapability,
  NodeAny,
  RendererData,
  RenderState,
  WgpuRenderState,
  WgpuShapeRendererData,
} from '@flighthq/types/contract';

import { createWgpuRendererData, getWgpuRendererData } from './wgpuRendererData.ts';

// Allocates the rasterization surface on first use, matching scene2d-gl. A shape whose fills all
// tessellate never touches this, so a scene drawn entirely through the mesh path carries no raster
// surface.
export function acquireWgpuShapeRasterSurface(
  canvasHost: Readonly<HostCanvasCapability>,
  imageHost: Readonly<HostImageCapability>,
  data: WgpuShapeRendererData,
): CanvasSurface | null {
  const existing = data.surface;
  if (existing !== null) return existing;
  const surface = createCanvasHostSurface(canvasHost, 1, 1);
  if (surface === null) return null;
  data.surface = surface;
  data.image = imageHost.createImageFromSurface?.(surface) ?? null;
  return surface;
}

// Shared by all three shape strategies so a node keeps one cache whichever one draws it. Both halves
// start empty: nothing is allocated until a strategy needs it.
export function createWgpuShapeData(_state: RenderState, _source: NodeAny): RendererData {
  return createWgpuRendererData({
    image: null,
    surface: null,
    lastContentId: -1,
    lastPixelRatio: 0,
    lastW: 0,
    lastH: 0,
    meshVersion: -1,
    meshes: null,
    meshBuffers: {
      vertexBuffers: [],
      vertexCapacities: [],
      indexBuffers: [],
      indexCapacities: [],
      uniformBuffers: [],
      bindGroups: [],
      colorScaleBiasUniformBuffers: [],
      colorScaleBiasBindGroups: [],
    },
  });
}

// Destroy the GPU texture the batch uploaded for this shape's raster surface and remove its cache key before
// destroying the provider-owned surface. Then free the mesh path's per-shape buffers. A shape that only ever
// tessellated owns mesh state but no raster resources.
export function destroyWgpuShapeData(state: WgpuRenderState, data: RendererData): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const shapeData = getWgpuShapeData(data);
  if (shapeData === null) return;
  const { image, surface } = shapeData;
  if (image !== null) {
    const entry = runtime.context.textureSourcePremultipliedTextureCache.get(image);
    if (entry !== undefined) {
      entry.texture.destroy();
      runtime.context.textureSourcePremultipliedTextureCache.delete(image);
    }
  }
  if (surface !== null) destroyCanvasHostSurface(surface);
  const b = shapeData.meshBuffers;
  for (const buffer of b.vertexBuffers) buffer.destroy();
  for (const buffer of b.indexBuffers) buffer.destroy();
  for (const buffer of b.uniformBuffers) buffer.destroy();
  for (const buffer of b.colorScaleBiasUniformBuffers) buffer.destroy();
  b.vertexBuffers.length = 0;
  b.vertexCapacities.length = 0;
  b.indexBuffers.length = 0;
  b.indexCapacities.length = 0;
  b.uniformBuffers.length = 0;
  b.bindGroups.length = 0;
  b.colorScaleBiasUniformBuffers.length = 0;
  b.colorScaleBiasBindGroups.length = 0;
}

export function getWgpuShapeData(data: RendererData): WgpuShapeRendererData | null {
  return getWgpuRendererData<WgpuShapeRendererData>(data);
}
