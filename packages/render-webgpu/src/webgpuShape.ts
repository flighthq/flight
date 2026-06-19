import { getNodeLocalBoundsRectangle, getNodeLocalContentRevision } from '@flighthq/node';
import { tessellatePath } from '@flighthq/path';
import { renderCanvasShapeCommands } from '@flighthq/render-canvas';
import { getShapeFillRegions } from '@flighthq/shape';
import type {
  DisplayObjectRenderer,
  Renderable,
  RendererData,
  RenderProxy2D,
  RenderState,
  Shape,
  WebGPURenderState,
  WebGPUShapeMeshBuffers,
} from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import { updateWebGPUTextureEntry } from './webgpuDraw';
import { resolveWebGPUMaterialRenderer } from './webgpuMaterialRegistry';
import { getWebGPURenderStateRuntime } from './webgpuRenderState';
import type { WebGPUShapeMesh } from './webgpuShapeMesh';
import { drawWebGPUShapeMeshes } from './webgpuShapeMesh';
import {
  ensureWebGPUQuadBatchResources,
  packWebGPUSpriteBatchMaterialInstance,
  prepareWebGPUSpriteBatchWrite,
} from './webgpuSpriteBatch';

interface WebGPUShapeData {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  lastContentID: number;
  lastW: number;
  lastH: number;
  // GPU tessellated-fill cache, rebuilt when the content revision changes. Null until first resolved;
  // populated only for solid-fill shapes (getShapeFillRegions != null), otherwise the raster path runs.
  meshVersion: number;
  meshes: WebGPUShapeMesh[] | null;
  // Reusable per-shape GPU buffers for the mesh path, grown on demand and destroyed in destroyData.
  meshBuffers: WebGPUShapeMeshBuffers;
}

function createWebGPUShapeData(_state: RenderState, _source: Renderable): RendererData {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  return {
    canvas,
    ctx,
    lastContentID: -1,
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
  } as unknown as RendererData;
}

// Destroy the GPU texture the batch uploaded for this shape's canvas, plus the mesh path's per-shape
// vertex/index/uniform buffers, when the shape is torn down.
function destroyWebGPUShapeData(state: WebGPURenderState, data: RendererData): void {
  const runtime = getWebGPURenderStateRuntime(state);
  const shapeData = data as unknown as WebGPUShapeData;
  const { canvas } = shapeData;
  const entry = runtime.textureCache.get(canvas);
  if (entry !== undefined) {
    entry.texture.destroy();
    runtime.textureCache.delete(canvas);
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

export function drawWebGPUShape(state: WebGPURenderState, renderProxy: RenderProxy2D): void {
  const runtime = getWebGPURenderStateRuntime(state);
  if (runtime.renderPass === null) return;

  const source = renderProxy.source as Shape;
  const { commands } = source.data;
  const version = getNodeLocalContentRevision(source);
  if (commands.length === 0) return;
  if (renderProxy.rendererData === null) return;

  // GPU fill path: solid-fill shapes tessellate to colored meshes (crisp at any zoom). Falls through to
  // the canvas-raster path for gradient/bitmap fills and strokes (getShapeFillRegions returns null).
  const regions = getShapeFillRegions(commands);
  if (regions !== null && regions.length > 0) {
    const meshData = renderProxy.rendererData as unknown as WebGPUShapeData;
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
    drawWebGPUShapeMeshes(state, renderProxy, meshData.meshes ?? [], meshData.meshBuffers);
    return;
  }

  const material = renderProxy.material;
  const materialRenderer = resolveWebGPUMaterialRenderer(state, material);
  if (materialRenderer === null) return;

  const shapeData = renderProxy.rendererData as unknown as WebGPUShapeData;
  const bounds = getNodeLocalBoundsRectangle(source);
  const w = Math.ceil(bounds.width);
  const h = Math.ceil(bounds.height);
  if (w <= 0 || h <= 0) return;

  if (version !== shapeData.lastContentID || w !== shapeData.lastW || h !== shapeData.lastH) {
    const sizeChanged = w !== shapeData.lastW || h !== shapeData.lastH;
    shapeData.canvas.width = w;
    shapeData.canvas.height = h;
    const ctx = shapeData.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(-bounds.x, -bounds.y);
    renderCanvasShapeCommands(ctx, commands);
    ctx.restore();

    const cached = runtime.textureCache.get(shapeData.canvas);
    if (cached !== undefined) {
      if (sizeChanged) {
        // Physical size changed: destroy old GPU texture, let the batch create a new one.
        cached.texture.destroy();
        runtime.textureCache.delete(shapeData.canvas);
      } else {
        // Same size: update content in-place.
        updateWebGPUTextureEntry(state, cached, shapeData.canvas);
      }
    }
    shapeData.lastContentID = version;
    shapeData.lastW = w;
    shapeData.lastH = h;
  }

  ensureWebGPUQuadBatchResources(state);

  const t = renderProxy.transform2D;
  const tx = t.tx + t.a * bounds.x + t.c * bounds.y;
  const ty = t.ty + t.b * bounds.x + t.d * bounds.y;

  const startCount = runtime.spriteBatchCount;
  const base = prepareWebGPUSpriteBatchWrite(
    state,
    shapeData.canvas,
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
  packWebGPUSpriteBatchMaterialInstance(state, renderProxy.materialData, startCount);
  runtime.spriteBatchCount++;
}

export const defaultWebGPUShapeRenderer: DisplayObjectRenderer = {
  format: BatchFormat.Quad,
  createData: createWebGPUShapeData,
  destroyData: destroyWebGPUShapeData,
  submit: drawWebGPUShape,
};
