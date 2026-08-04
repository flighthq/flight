import { createImageResource } from '@flighthq/image/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import type {
  Renderable,
  RendererData,
  RenderState,
  WgpuRenderState,
  WgpuShapeRasterSurface,
  WgpuShapeRendererData,
} from '@flighthq/types/contract';

import { createWgpuRendererData, getWgpuRendererData } from './wgpuRendererData';

// Allocates the rasterization surface on first use, matching scene2d-gl. A shape whose fills all
// tessellate never touches this, so a scene drawn entirely through the mesh path carries no canvases.
export function acquireWgpuShapeRasterSurface(data: WgpuShapeRendererData): WgpuShapeRasterSurface {
  const existing = data.surface;
  if (existing !== null) return existing;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const surface: WgpuShapeRasterSurface = {
    canvas,
    ctx: canvas.getContext('2d')!,
    image: createImageResource(canvas),
  };
  data.surface = surface;
  return surface;
}

// Shared by all three shape strategies so a node keeps one cache whichever one draws it. Both halves
// start empty: nothing is allocated until a strategy needs it.
export function createWgpuShapeData(_state: RenderState, _source: Renderable): RendererData {
  return createWgpuRendererData<WgpuShapeRendererData>({
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

// Destroy the GPU texture the batch uploaded for this shape's canvas, plus the mesh path's per-shape
// vertex/index/uniform buffers, when the shape is torn down. A shape that only ever tessellated has no
// surface and so no texture to free.
export function destroyWgpuShapeData(state: WgpuRenderState, data: RendererData): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const shapeData = getWgpuShapeData(data);
  if (shapeData === null) return;
  const surface = shapeData.surface;
  if (surface !== null) {
    const entry = runtime.textureSourcePremultipliedTextureCache.get(surface.image);
    if (entry !== undefined) {
      entry.texture.destroy();
      runtime.textureSourcePremultipliedTextureCache.delete(surface.image);
    }
  }
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
