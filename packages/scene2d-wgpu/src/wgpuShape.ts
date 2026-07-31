import { createImageResource, invalidateImageResource } from '@flighthq/image/contract';
import { getNodeLocalBoundsRectangle, getNodeLocalContentRevision } from '@flighthq/node/contract';
import { tessellatePath } from '@flighthq/path/contract';
import { bindWgpuImageResourceTexture, resolveWgpuMaterialRenderer } from '@flighthq/render-wgpu/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { renderCanvasShapeCommands } from '@flighthq/scene2d-canvas/contract';
import { getShapeFillRegions, getShapeStrokeRegions } from '@flighthq/shape/contract';
import type {
  Scene2DRenderer,
  Image,
  Renderable,
  RendererData,
  RenderProxy2D,
  RenderState,
  Shape,
  ShapeCommandToken,
  ShapeFillRegion,
  WgpuRenderState,
  WgpuShapeMeshBuffers,
} from '@flighthq/types/contract';
import { BatchFormat } from '@flighthq/types/contract';
import type { WgpuShapeMesh } from '@flighthq/types/contract';

import {
  ensureWgpuQuadBatchResources,
  packWgpuQuadBatchMaterialInstance,
  prepareWgpuQuadBatchWrite,
  recordWgpuQuadBatchColorScaleBias,
} from './wgpuQuadBatchWriter';
import { createWgpuRendererData, getWgpuRendererData } from './wgpuRendererData';
import { drawWgpuShapeMeshes } from './wgpuShapeMesh';

interface WgpuShapeData {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  // The canvas wrapped as an Image (its `source`) so the shared quad-batch writer treats a canvas-backed
  // shape uniformly with bitmaps; re-rendering bumps the version, which the batch's version-aware cache
  // re-uploads on (recreating the GPU texture, covering both content and size changes).
  image: Image;
  lastContentId: number;
  lastW: number;
  lastH: number;
  // GPU tessellated-mesh cache, rebuilt when the content revision changes. Null until first resolved;
  // populated only when every fill and stroke resolves to a solid mesh region, otherwise raster runs.
  meshVersion: number;
  meshes: WgpuShapeMesh[] | null;
  // Reusable per-shape GPU buffers for the mesh path, grown on demand and destroyed in destroyData.
  meshBuffers: WgpuShapeMeshBuffers;
}

function createWgpuShapeData(_state: RenderState, _source: Renderable): RendererData {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  return createWgpuRendererData<WgpuShapeData>({
    canvas,
    ctx,
    image: createImageResource(canvas),
    lastContentId: -1,
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
    },
  });
}

// Destroy the GPU texture the batch uploaded for this shape's canvas, plus the mesh path's per-shape
// vertex/index/uniform buffers, when the shape is torn down.
function destroyWgpuShapeData(state: WgpuRenderState, data: RendererData): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const shapeData = getWgpuRendererData<WgpuShapeData>(data);
  if (shapeData === null) return;
  const entry = runtime.textureSourcePremultipliedTextureCache.get(shapeData.image);
  if (entry !== undefined) {
    entry.texture.destroy();
    runtime.textureSourcePremultipliedTextureCache.delete(shapeData.image);
  }
  const b = shapeData.meshBuffers;
  for (const buffer of b.vertexBuffers) buffer.destroy();
  for (const buffer of b.indexBuffers) buffer.destroy();
  for (const buffer of b.uniformBuffers) buffer.destroy();
  b.vertexBuffers.length = 0;
  b.vertexCapacities.length = 0;
  b.indexBuffers.length = 0;
  b.indexCapacities.length = 0;
  b.uniformBuffers.length = 0;
  b.bindGroups.length = 0;
}

// Resolves every solid fill and open solid stroke into one fill-before-stroke mesh list. Either layer's
// null sentinel keeps the whole shape on the raster path, preserving gradient/texture styles and closed
// stroke rings that the direct-fill tessellator cannot express. Mirrors scene2d-gl/glShape.
function resolveWgpuShapeMeshRegions(commands: readonly ShapeCommandToken[]): ShapeFillRegion[] | null {
  const fillRegions = getShapeFillRegions(commands);
  if (fillRegions === null) return null;
  const strokeRegions = getShapeStrokeRegions(commands);
  if (strokeRegions === null) return null;
  const regions = fillRegions.concat(strokeRegions);
  return regions.length > 0 ? regions : null;
}

export function drawWgpuShape(state: WgpuRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.renderPass === null) return;

  const source = renderProxy.source as Shape;
  const { commands } = source.data;
  const version = getNodeLocalContentRevision(source);
  if (commands.length === 0) return;
  if (renderProxy.rendererData === null) return;

  // GPU mesh path: solid fills tessellate to colored meshes and open solid strokes become fillable
  // outlines via getShapeStrokeRegions (real joins/caps/dashing, resolution-independent). Both layers
  // compose fill-before-stroke. Gradient/texture styles and closed stroke rings stay on the raster path.
  // Mirrors scene2d-gl/glShape.
  const regions = resolveWgpuShapeMeshRegions(commands);
  if (regions !== null && regions.length > 0) {
    const meshData = getWgpuRendererData<WgpuShapeData>(renderProxy.rendererData);
    if (meshData === null) return;
    if (meshData.meshVersion !== version) {
      meshData.meshes = regions.map((region) => {
        const mesh = tessellatePath(region.path);
        return {
          vertices: new Float32Array(mesh.vertices),
          indices: new Uint16Array(mesh.indices),
          color: region.color,
          alpha: region.alpha,
        };
      });
      meshData.meshVersion = version;
    }
    drawWgpuShapeMeshes(state, renderProxy, meshData.meshes ?? [], meshData.meshBuffers);
    return;
  }

  const material = renderProxy.material;
  const materialRenderer = resolveWgpuMaterialRenderer(state, material);
  if (materialRenderer === null) return;

  const shapeData = getWgpuRendererData<WgpuShapeData>(renderProxy.rendererData);
  if (shapeData === null) return;
  const bounds = getNodeLocalBoundsRectangle(source);
  const w = Math.ceil(bounds.width);
  const h = Math.ceil(bounds.height);
  if (w <= 0 || h <= 0) return;

  if (version !== shapeData.lastContentId || w !== shapeData.lastW || h !== shapeData.lastH) {
    shapeData.canvas.width = w;
    shapeData.canvas.height = h;
    const ctx = shapeData.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(-bounds.x, -bounds.y);
    renderCanvasShapeCommands(ctx, commands, null, state);
    ctx.restore();
    // Re-read the canvas dimensions and bump the resource version so the batch's version-aware cache
    // re-uploads (recreating the GPU texture, which covers a size change too).
    invalidateImageResource(shapeData.image);
    shapeData.lastContentId = version;
    shapeData.lastW = w;
    shapeData.lastH = h;
  }

  ensureWgpuQuadBatchResources(state);

  const t = renderProxy.transform2D;
  const tx = t.tx + t.a * bounds.x + t.c * bounds.y;
  const ty = t.ty + t.b * bounds.x + t.d * bounds.y;

  const textureEntry = bindWgpuImageResourceTexture(state, shapeData.image, false, true);
  const startCount = runtime.quadBatchWriterCount;
  const base = prepareWgpuQuadBatchWrite(
    state,
    textureEntry,
    null,
    renderProxy.blendMode,
    material,
    materialRenderer,
    1,
  );
  const d = runtime.quadBatchWriterInstanceData;
  d[base] = t.a;
  d[base + 1] = t.b;
  d[base + 2] = t.c;
  d[base + 3] = t.d;
  d[base + 4] = tx;
  d[base + 5] = ty;
  d[base + 6] = w;
  d[base + 7] = h;
  d[base + 8] = 0;
  d[base + 9] = 0;
  d[base + 10] = 1;
  d[base + 11] = 1;
  d[base + 12] = renderProxy.alpha;
  packWgpuQuadBatchMaterialInstance(state, renderProxy.materialData, startCount);
  recordWgpuQuadBatchColorScaleBias(state, renderProxy.colorMatrix ?? renderProxy.colorScaleBias, startCount);
  runtime.quadBatchWriterCount++;
}

export const defaultWgpuShapeRenderer: Scene2DRenderer = {
  format: BatchFormat.Quad,
  createData: createWgpuShapeData,
  destroyData: destroyWgpuShapeData,
  submit: drawWgpuShape,
};
