import { getNodeLocalBoundsRectangle, getNodeLocalContentRevision } from '@flighthq/node';
import { renderCanvasShapeCommands } from '@flighthq/render-canvas';
import type {
  DisplayObjectRenderer,
  Renderable,
  RendererData,
  RenderProxy2D,
  RenderState,
  Shape,
} from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import type { WebGPURenderStateInternal } from './internal';
import { updateWebGPUTextureEntry } from './webgpuDraw';
import { resolveWebGPUMaterialRenderer } from './webgpuMaterialRegistry';
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
}

function createWebGPUShapeData(_state: RenderState, _source: Renderable): RendererData {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx, lastContentID: -1, lastW: 0, lastH: 0 } as unknown as RendererData;
}

export function drawWebGPUShape(state: RenderState, renderProxy: RenderProxy2D): void {
  const internal = state as WebGPURenderStateInternal;
  if (internal.renderPass === null) return;

  const source = renderProxy.source as Shape;
  const { commands } = source.data;
  const version = getNodeLocalContentRevision(source);
  if (commands.length === 0) return;
  if (renderProxy.rendererData === null) return;

  const material = renderProxy.material;
  const materialRenderer = resolveWebGPUMaterialRenderer(internal, material);
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

    const cached = internal.textureCache.get(shapeData.canvas);
    if (cached !== undefined) {
      if (sizeChanged) {
        // Physical size changed: destroy old GPU texture, let the batch create a new one.
        cached.texture.destroy();
        internal.textureCache.delete(shapeData.canvas);
      } else {
        // Same size: update content in-place.
        updateWebGPUTextureEntry(internal, cached, shapeData.canvas);
      }
    }
    shapeData.lastContentID = version;
    shapeData.lastW = w;
    shapeData.lastH = h;
  }

  ensureWebGPUQuadBatchResources(internal);

  const t = renderProxy.transform2D;
  const tx = t.tx + t.a * bounds.x + t.c * bounds.y;
  const ty = t.ty + t.b * bounds.x + t.d * bounds.y;

  const startCount = internal.spriteBatchCount;
  const base = prepareWebGPUSpriteBatchWrite(
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
  packWebGPUSpriteBatchMaterialInstance(internal, renderProxy.materialData, startCount);
  internal.spriteBatchCount++;
}

export function drawWebGPUShapeMask(state: RenderState, data: RenderProxy2D): void {
  drawWebGPUShape(state, data);
}

export const defaultWebGPUShapeRenderer: DisplayObjectRenderer = {
  format: BatchFormat.Quad,
  createData: createWebGPUShapeData,
  submit: drawWebGPUShape,
};
