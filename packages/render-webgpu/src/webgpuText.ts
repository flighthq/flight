import { getTextRuntime } from '@flighthq/displayobject';
import { computeRGBHexString } from '@flighthq/materials';
import { computeTextFormatFontString } from '@flighthq/render';
import { computeTextLayout, createTextFormatRange, getTextLayoutResult } from '@flighthq/text-layout';
import type {
  DisplayObjectRenderer,
  Renderable,
  RendererData,
  RenderProxy2D,
  RenderState,
  Text,
  TextFormat,
  TextRuntime,
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

interface WebGPUTextData {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  lastHash: string;
  logW: number;
  logH: number;
  lastPW: number;
  lastPH: number;
}

function createWebGPUTextData(_state: RenderState, _source: Renderable): RendererData {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx, lastHash: '', logW: 0, logH: 0, lastPW: 0, lastPH: 0 } as unknown as RendererData;
}

export function drawWebGPUText(state: RenderState, renderProxy: RenderProxy2D): void {
  const internal = state as WebGPURenderStateInternal;
  if (internal.renderPass === null) return;

  const source = renderProxy.source as Text;
  const { text, textFormat, width: fieldWidth, height: fieldHeight } = source.data;
  if (text.length === 0) return;
  if (renderProxy.rendererData === null) return;

  const material = renderProxy.material;
  const materialRenderer = resolveWebGPUMaterialRenderer(internal, material);
  if (materialRenderer === null) return;

  const textData = renderProxy.rendererData as unknown as WebGPUTextData;
  const maxTexDim = internal.device.limits.maxTextureDimension2D;
  const pixelRatio = internal.pixelRatio;
  const hash = `${text}\0${fieldWidth}\0${fieldHeight}\0${pixelRatio}\0${JSON.stringify(textFormat)}`;

  if (hash !== textData.lastHash) {
    const measure = (t: string, format: TextFormat): number => {
      textData.ctx.font = computeTextFormatFontString(format);
      return textData.ctx.measureText(t).width;
    };

    const result = getTextLayoutResult(getTextRuntime(source) as TextRuntime);
    computeTextLayout(result, {
      text,
      formatRanges: [createTextFormatRange(textFormat, 0, text.length)],
      width: fieldWidth,
      height: fieldHeight,
      measure,
    });

    textData.lastHash = hash;
    textData.logW = 0;
    textData.logH = 0;

    if (result.groups.length === 0) return;

    let maxX = 0;
    let maxY = 0;
    for (const group of result.groups) {
      const right = group.offsetX + group.width;
      const bottom = group.offsetY + group.ascent + group.descent;
      if (right > maxX) maxX = right;
      if (bottom > maxY) maxY = bottom;
    }

    const maxLogical = Math.floor(maxTexDim / pixelRatio);
    const w = Math.min(Math.ceil(maxX), maxLogical);
    const h = Math.min(Math.ceil(maxY), maxLogical);
    if (w <= 0 || h <= 0) return;

    const pw = Math.ceil(w * pixelRatio);
    const ph = Math.ceil(h * pixelRatio);
    textData.canvas.width = pw;
    textData.canvas.height = ph;

    const ctx = textData.ctx;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'start';

    for (const group of result.groups) {
      ctx.font = computeTextFormatFontString(group.format);
      ctx.fillStyle = computeRGBHexString(group.format.color ?? 0);
      const slice = text.substring(group.startIndex, group.endIndex);
      ctx.fillText(slice, group.offsetX, group.offsetY + group.ascent * 0.815);
    }

    // Update or invalidate the GPU texture.
    const cached = internal.textureCache.get(textData.canvas);
    if (cached !== undefined) {
      if (pw === textData.lastPW && ph === textData.lastPH) {
        // Same physical size: update content in-place.
        updateWebGPUTextureEntry(internal, cached, textData.canvas);
      } else {
        // Physical size changed: destroy old GPU texture, let the batch create a new one.
        cached.texture.destroy();
        internal.textureCache.delete(textData.canvas);
      }
    }

    textData.logW = w;
    textData.logH = h;
    textData.lastPW = pw;
    textData.lastPH = ph;
  }

  if (textData.logW <= 0 || textData.logH <= 0) return;

  ensureWebGPUQuadBatchResources(internal);

  const startCount = internal.spriteBatchCount;
  const base = prepareWebGPUSpriteBatchWrite(
    internal,
    textData.canvas,
    renderProxy.blendMode,
    material,
    materialRenderer,
    1,
  );
  const d = internal.spriteBatchInstanceData;
  const t = renderProxy.transform2D;
  d[base] = t.a;
  d[base + 1] = t.b;
  d[base + 2] = t.c;
  d[base + 3] = t.d;
  d[base + 4] = t.tx;
  d[base + 5] = t.ty;
  d[base + 6] = textData.logW;
  d[base + 7] = textData.logH;
  d[base + 8] = 0;
  d[base + 9] = 0;
  d[base + 10] = 1;
  d[base + 11] = 1;
  d[base + 12] = renderProxy.alpha;
  packWebGPUSpriteBatchMaterialInstance(internal, renderProxy.materialData, startCount);
  internal.spriteBatchCount++;
}

export function drawWebGPUTextMask(state: RenderState, data: RenderProxy2D): void {
  drawWebGPUText(state, data);
}

export const defaultWebGPUTextRenderer: DisplayObjectRenderer = {
  format: BatchFormat.Quad,
  createData: createWebGPUTextData,
  submit: drawWebGPUText,
};
