import { getNodeLocalBoundsRectangle } from '@flighthq/node';
import { renderCanvasShapeCommands } from '@flighthq/render-canvas';
import type {
  DisplayObjectRenderer,
  Renderable,
  RendererData,
  RenderNode2D,
  RenderState,
  Shape,
} from '@flighthq/types';

import type { WebGPURenderStateInternal, WebGPUTextureEntry } from './internal';
import { createWebGPUTextureEntry, drawWebGPUQuad, updateWebGPUTextureEntry } from './webgpuDraw';

interface WebGPUShapeData {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  entry: WebGPUTextureEntry | null;
  lastVersion: number;
  lastW: number;
  lastH: number;
}

function createWebGPUShapeData(_state: RenderState, _source: Renderable): RendererData {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx, entry: null, lastVersion: -1, lastW: 0, lastH: 0 } as unknown as RendererData;
}

export function drawWebGPUShape(state: RenderState, renderNode: RenderNode2D): void {
  const internal = state as WebGPURenderStateInternal;
  if (internal.renderPass === null) return;

  const source = renderNode.source as Shape;
  const { commands, version } = source.data;
  if (commands.length === 0) return;
  if (renderNode.rendererData === null) return;

  const shapeData = renderNode.rendererData as unknown as WebGPUShapeData;

  const bounds = getNodeLocalBoundsRectangle(source);
  const w = Math.ceil(bounds.width);
  const h = Math.ceil(bounds.height);
  if (w <= 0 || h <= 0) return;

  if (version !== shapeData.lastVersion || w !== shapeData.lastW || h !== shapeData.lastH) {
    shapeData.canvas.width = w;
    shapeData.canvas.height = h;
    const ctx = shapeData.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(-bounds.x, -bounds.y);
    renderCanvasShapeCommands(ctx, commands);
    ctx.restore();

    if (shapeData.entry === null || w !== shapeData.lastW || h !== shapeData.lastH) {
      shapeData.entry?.texture.destroy();
      shapeData.entry = createWebGPUTextureEntry(internal, w, h, shapeData.canvas);
    } else {
      updateWebGPUTextureEntry(internal, shapeData.entry, shapeData.canvas);
    }
    shapeData.lastVersion = version;
    shapeData.lastW = w;
    shapeData.lastH = h;
  }

  if (shapeData.entry === null) return;

  internal.applyBlendMode?.(internal, renderNode.blendMode);
  drawWebGPUQuad(internal, renderNode, shapeData.entry, bounds.x, bounds.y, bounds.x + w, bounds.y + h, 0, 0, 1, 1);
}

export function drawWebGPUShapeMask(state: RenderState, data: RenderNode2D): void {
  drawWebGPUShape(state, data);
}

export const defaultWebGPUShapeRenderer: DisplayObjectRenderer = {
  createData: createWebGPUShapeData,
  submit: drawWebGPUShape,
};
