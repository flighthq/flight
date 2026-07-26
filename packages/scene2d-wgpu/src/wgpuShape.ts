import { createImageResource, setImageResourceSource } from '@flighthq/image/contract';
import { getNodeLocalBoundsRectangle, getNodeLocalContentRevision } from '@flighthq/node/contract';
import { tessellatePath } from '@flighthq/path/contract';
import { resolveWgpuMaterialRenderer } from '@flighthq/render-wgpu/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { renderCanvasShapeCommands } from '@flighthq/scene2d-canvas/contract';
import { getShapeFillRegions, getShapeStrokeRegions, hasShapeFill } from '@flighthq/shape/contract';
import type {
  Scene2DRenderer,
  ImageResource,
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

import { createWgpuRendererData, getWgpuRendererData } from './wgpuRendererData';
import { drawWgpuShapeMeshes } from './wgpuShapeMesh';
import {
  ensureWgpuQuadBatchResources,
  packWgpuSpriteBatchMaterialInstance,
  prepareWgpuSpriteBatchWrite,
  recordWgpuSpriteBatchColorScaleBias,
} from './wgpuSpriteBatch';

interface WgpuShapeData {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  // The canvas wrapped as an ImageResource (its `source`) so the shared sprite batch treats a canvas-backed
  // shape uniformly with bitmaps; re-rendering bumps the version, which the batch's version-aware cache
  // re-uploads on (recreating the GPU texture, covering both content and size changes).
  image: ImageResource;
  lastContentId: number;
  lastW: number;
  lastH: number;
  // GPU tessellated-mesh cache, rebuilt when the content revision changes. Null until first resolved;
  // populated for solid-fill and stroke-only shapes (resolveWgpuShapeMeshRegions), else the raster path runs.
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
      vertexBuffer: null,
      vertexCapacity: 0,
      indexBuffer: null,
      indexCapacity: 0,
      uniformBuffer: null,
      bindGroup: null,
    },
  });
}

// Destroy the GPU texture the batch uploaded for this shape's canvas, plus the mesh path's per-shape
// vertex/index/uniform buffers, when the shape is torn down.
function destroyWgpuShapeData(state: WgpuRenderState, data: RendererData): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const shapeData = getWgpuRendererData<WgpuShapeData>(data);
  if (shapeData === null) return;
  const entry = runtime.imageResourcePremultipliedTextureCache.get(shapeData.image);
  if (entry !== undefined) {
    entry.texture.destroy();
    runtime.imageResourcePremultipliedTextureCache.delete(shapeData.image);
  }
  const b = shapeData.meshBuffers;
  b.vertexBuffer?.destroy();
  b.indexBuffer?.destroy();
  b.uniformBuffer?.destroy();
  b.vertexBuffer = null;
  b.indexBuffer = null;
  b.uniformBuffer = null;
  b.bindGroup = null;
}

// Chooses the fillable regions to tessellate into GPU meshes for a shape: its solid-fill regions when it
// is fill-only, or its stroke-outline regions (via getShapeStrokeRegions → strokePath) when it is
// stroke-only. Returns null when the shape must use the raster fallback — a gradient/bitmap fill or
// stroke, a closed-primitive (ring) stroke, or a shape that BOTH fills and strokes. Mirrors
// scene2d-gl/glShape's resolveGlShapeMeshRegions.
function resolveWgpuShapeMeshRegions(commands: readonly ShapeCommandToken[]): ShapeFillRegion[] | null {
  const fillRegions = getShapeFillRegions(commands);
  if (fillRegions !== null) return fillRegions.length > 0 ? fillRegions : null;
  if (hasShapeFill(commands)) return null;
  return getShapeStrokeRegions(commands);
}

export function drawWgpuShape(state: WgpuRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.renderPass === null) return;

  const source = renderProxy.source as Shape;
  const { commands } = source.data;
  const version = getNodeLocalContentRevision(source);
  if (commands.length === 0) return;
  if (renderProxy.rendererData === null) return;

  // GPU mesh path: solid-fill shapes tessellate to colored meshes (crisp at any zoom), and a STROKE-ONLY
  // shape offsets its strokes to fillable outlines via getShapeStrokeRegions (real joins/caps/dashing,
  // resolution-independent — no offscreen raster). Falls through to the canvas-raster path for
  // gradient/bitmap fills/strokes, closed-primitive (ring) strokes, and filled-and-stroked shapes (the
  // fill + stroke mesh paths don't compose yet). Mirrors scene2d-gl/glShape.
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
    renderCanvasShapeCommands(ctx, commands);
    ctx.restore();
    // Re-read the canvas dimensions and bump the resource version so the batch's version-aware cache
    // re-uploads (recreating the GPU texture, which covers a size change too).
    setImageResourceSource(shapeData.image, shapeData.canvas);
    shapeData.lastContentId = version;
    shapeData.lastW = w;
    shapeData.lastH = h;
  }

  ensureWgpuQuadBatchResources(state);

  const t = renderProxy.transform2D;
  const tx = t.tx + t.a * bounds.x + t.c * bounds.y;
  const ty = t.ty + t.b * bounds.x + t.d * bounds.y;

  const startCount = runtime.spriteBatchCount;
  const base = prepareWgpuSpriteBatchWrite(
    state,
    shapeData.image,
    renderProxy.blendMode,
    material,
    materialRenderer,
    1,
  );
  const d = runtime.spriteBatchInstanceData;
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
  packWgpuSpriteBatchMaterialInstance(state, renderProxy.materialData, startCount);
  recordWgpuSpriteBatchColorScaleBias(state, renderProxy.colorMatrix ?? renderProxy.colorScaleBias, startCount);
  runtime.spriteBatchCount++;
}

export const defaultWgpuShapeRenderer: Scene2DRenderer = {
  format: BatchFormat.Quad,
  createData: createWgpuShapeData,
  destroyData: destroyWgpuShapeData,
  submit: drawWgpuShape,
};
