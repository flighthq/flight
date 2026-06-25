import { renderCanvasShapeCommands } from '@flighthq/displayobject-canvas';
import { getNodeLocalBoundsRectangle, getNodeLocalContentRevision } from '@flighthq/node';
import { tessellatePath } from '@flighthq/path';
import { resolveGlMaterialRenderer } from '@flighthq/render-gl';
import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import { getShapeFillRegions } from '@flighthq/shape';
import type {
  DisplayObjectRenderer,
  GlRenderState,
  Renderable,
  RendererData,
  RenderProxy2D,
  Shape,
} from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import type { GlShapeMesh } from './glShapeMesh';
import { drawGlShapeMeshes } from './glShapeMesh';
import { ensureGlQuadBatchShader, packGlSpriteBatchMaterialInstance, prepareGlSpriteBatchWrite } from './glSpriteBatch';

// Renderer-private scratch state stored in the opaque RendererData slot. It is not an Entity (it
// carries no EntityRuntimeKey), so the slot is read and written through the typed accessor pair
// below — getGlShapeData / toGlShapeRendererData — which confine the single unavoidable cast to one
// named site instead of scattering it at every callsite.
interface GlShapeData {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  lastContentId: number;
  lastW: number;
  lastH: number;
  // GPU tessellated-fill cache, rebuilt when the content revision changes. Null until first resolved;
  // populated only for solid-fill shapes (getShapeFillRegions != null), otherwise the raster path runs.
  meshVersion: number;
  meshes: GlShapeMesh[] | null;
}

function getGlShapeData(data: RendererData): GlShapeData {
  return data as unknown as GlShapeData;
}

function toGlShapeRendererData(data: GlShapeData): RendererData {
  return data as unknown as RendererData;
}

function createGlShapeData(_state: GlRenderState, _source: Renderable): RendererData | null {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  return toGlShapeRendererData({
    canvas,
    ctx,
    lastContentId: -1,
    lastW: 0,
    lastH: 0,
    meshVersion: -1,
    meshes: null,
  });
}

// The batch uploads this shape's canvas into the shared texture cache; free that GPU texture when
// the shape is torn down so it does not leak past the canvas it was keyed on.
function destroyGlShapeData(state: GlRenderState, data: RendererData): void {
  const runtime = getGlRenderStateRuntime(state);
  const { canvas } = getGlShapeData(data);
  const texture = runtime.textureCache.get(canvas);
  if (texture !== undefined) {
    state.gl.deleteTexture(texture);
    runtime.textureCache.delete(canvas);
  }
}

export function drawGlShape(state: GlRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getGlRenderStateRuntime(state);
  const source = renderProxy.source as Shape;
  const { commands } = source.data;
  const version = getNodeLocalContentRevision(source);
  if (commands.length === 0) return;
  if (renderProxy.rendererData === null) return;

  // GPU fill path: solid-fill shapes tessellate to colored meshes (crisp at any zoom). Falls through to
  // the canvas-raster path for gradient/bitmap fills and strokes (getShapeFillRegions returns null).
  const regions = getShapeFillRegions(commands);
  if (regions !== null && regions.length > 0) {
    const meshData = getGlShapeData(renderProxy.rendererData);
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
    drawGlShapeMeshes(state, renderProxy, meshData.meshes ?? []);
    return;
  }

  const material = renderProxy.material;
  const materialRenderer = resolveGlMaterialRenderer(state, material);
  if (materialRenderer === null) return;

  const shapeData = getGlShapeData(renderProxy.rendererData);
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
    // Invalidate the cached GPU texture so the batch re-uploads from the updated canvas.
    runtime.textureCache.delete(shapeData.canvas);
    shapeData.lastContentId = version;
    shapeData.lastW = w;
    shapeData.lastH = h;
  }

  ensureGlQuadBatchShader(state);

  const t = renderProxy.transform2D;
  const tx = t.tx + t.a * bounds.x + t.c * bounds.y;
  const ty = t.ty + t.b * bounds.x + t.d * bounds.y;

  const startCount = runtime.spriteBatchCount;
  const base = prepareGlSpriteBatchWrite(state, shapeData.canvas, renderProxy.blendMode, material, materialRenderer, 1);
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
  packGlSpriteBatchMaterialInstance(state, renderProxy.materialData, startCount);
  runtime.spriteBatchCount++;
}

export const defaultGlShapeRenderer: DisplayObjectRenderer = {
  format: BatchFormat.Quad,
  createData: createGlShapeData,
  destroyData: destroyGlShapeData,
  submit: drawGlShape,
};
