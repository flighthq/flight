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
} from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { resolveWebGLMaterialRenderer } from './webglMaterialRegistry';
import type { WebGLShapeMesh } from './webglShapeMesh';
import { drawWebGLShapeMeshes } from './webglShapeMesh';
import {
  ensureWebGLQuadBatchShader,
  packWebGLSpriteBatchMaterialInstance,
  prepareWebGLSpriteBatchWrite,
} from './webglSpriteBatch';

interface WebGLShapeData {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  lastContentID: number;
  lastW: number;
  lastH: number;
  // GPU tessellated-fill cache, rebuilt when the content revision changes. Null until first resolved;
  // populated only for solid-fill shapes (getShapeFillRegions != null), otherwise the raster path runs.
  meshVersion: number;
  meshes: WebGLShapeMesh[] | null;
}

function createWebGLShapeData(_state: RenderState, _source: Renderable): RendererData | null {
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
  } as unknown as RendererData;
}

// The batch uploads this shape's canvas into the shared texture cache; free that GPU texture when
// the shape is torn down so it does not leak past the canvas it was keyed on.
function destroyWebGLShapeData(state: RenderState, data: RendererData): void {
  const internal = state as WebGLRenderStateInternal;
  const { canvas } = data as unknown as WebGLShapeData;
  const texture = internal.textureCache.get(canvas);
  if (texture !== undefined) {
    internal.gl.deleteTexture(texture);
    internal.textureCache.delete(canvas);
  }
}

export function drawWebGLShape(state: RenderState, renderProxy: RenderProxy2D): void {
  const internal = state as WebGLRenderStateInternal;
  const source = renderProxy.source as Shape;
  const { commands } = source.data;
  const version = getNodeLocalContentRevision(source);
  if (commands.length === 0) return;
  if (renderProxy.rendererData === null) return;

  // GPU fill path: solid-fill shapes tessellate to colored meshes (crisp at any zoom). Falls through to
  // the canvas-raster path for gradient/bitmap fills and strokes (getShapeFillRegions returns null).
  const regions = getShapeFillRegions(commands);
  if (regions !== null && regions.length > 0) {
    const meshData = renderProxy.rendererData as unknown as WebGLShapeData;
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
    drawWebGLShapeMeshes(internal, renderProxy, meshData.meshes ?? []);
    return;
  }

  const material = renderProxy.material;
  const materialRenderer = resolveWebGLMaterialRenderer(internal, material);
  if (materialRenderer === null) return;

  const shapeData = renderProxy.rendererData as unknown as WebGLShapeData;
  const bounds = getNodeLocalBoundsRectangle(source);
  const w = Math.ceil(bounds.width);
  const h = Math.ceil(bounds.height);
  if (w <= 0 || h <= 0) return;

  if (version !== shapeData.lastContentID || w !== shapeData.lastW || h !== shapeData.lastH) {
    shapeData.canvas.width = w;
    shapeData.canvas.height = h;
    const ctx = shapeData.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(-bounds.x, -bounds.y);
    renderCanvasShapeCommands(ctx, commands);
    ctx.restore();
    // Invalidate the cached GPU texture so the batch re-uploads from the updated canvas.
    internal.textureCache.delete(shapeData.canvas);
    shapeData.lastContentID = version;
    shapeData.lastW = w;
    shapeData.lastH = h;
  }

  ensureWebGLQuadBatchShader(internal);

  const t = renderProxy.transform2D;
  const tx = t.tx + t.a * bounds.x + t.c * bounds.y;
  const ty = t.ty + t.b * bounds.x + t.d * bounds.y;

  const startCount = internal.spriteBatchCount;
  const base = prepareWebGLSpriteBatchWrite(
    internal,
    shapeData.canvas,
    renderProxy.blendMode,
    material,
    materialRenderer,
    1,
  );
  const d = internal.spriteBatchInstanceData;
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
  packWebGLSpriteBatchMaterialInstance(internal, renderProxy.materialData, startCount);
  internal.spriteBatchCount++;
}

export const defaultWebGLShapeRenderer: DisplayObjectRenderer = {
  format: BatchFormat.Quad,
  createData: createWebGLShapeData,
  destroyData: destroyWebGLShapeData,
  submit: drawWebGLShape,
};
