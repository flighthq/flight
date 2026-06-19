import { computeRGBHexString } from '@flighthq/materials';
import { getNodeLocalContentRevision } from '@flighthq/node';
import { computeTextFormatFontString } from '@flighthq/render';
import { getTextLabelRuntime } from '@flighthq/text';
import { computeTextLayout, createTextFormatRange, getTextLayoutResult } from '@flighthq/text-layout';
import type {
  DisplayObjectRenderer,
  Renderable,
  RendererData,
  RenderProxy2D,
  RenderState,
  TextFormat,
  TextLabel,
  TextLabelRuntime,
  WebGPURenderState,
} from '@flighthq/types';
import { BatchFormat } from '@flighthq/types';

import { updateWebGPUTextureEntry } from './webgpuDraw';
import { resolveWebGPUMaterialRenderer } from './webgpuMaterialRegistry';
import { getWebGPURenderStateRuntime } from './webgpuRenderState';
import {
  ensureWebGPUQuadBatchResources,
  packWebGPUSpriteBatchMaterialInstance,
  prepareWebGPUSpriteBatchWrite,
} from './webgpuSpriteBatch';

interface WebGPUTextLabelData {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  // Content revision and pixel ratio at last rasterization. Re-rasterization is driven by the
  // upstream TextLabel content version (bumped by TextLabel setters on layout-affecting changes), never by
  // appearance-only changes such as alpha.
  lastContentID: number;
  lastPixelRatio: number;
  logW: number;
  logH: number;
  lastPW: number;
  lastPH: number;
}

function createWebGPUTextLabelData(_state: RenderState, _source: Renderable): RendererData {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  return {
    canvas,
    ctx,
    lastContentID: -1,
    lastPixelRatio: 0,
    logW: 0,
    logH: 0,
    lastPW: 0,
    lastPH: 0,
  } as unknown as RendererData;
}

// Destroy the GPU texture the batch uploaded for this text node's canvas when it is torn down.
function destroyWebGPUTextLabelData(state: WebGPURenderState, data: RendererData): void {
  const runtime = getWebGPURenderStateRuntime(state);
  const { canvas } = data as unknown as WebGPUTextLabelData;
  const entry = runtime.textureCache.get(canvas);
  if (entry !== undefined) {
    entry.texture.destroy();
    runtime.textureCache.delete(canvas);
  }
}

export function drawWebGPUTextLabel(state: WebGPURenderState, renderProxy: RenderProxy2D): void {
  const runtime = getWebGPURenderStateRuntime(state);
  if (runtime.renderPass === null) return;

  const source = renderProxy.source as TextLabel;
  const { text, textFormat, width: fieldWidth, height: fieldHeight } = source.data;
  if (text.length === 0) return;
  if (renderProxy.rendererData === null) return;

  const material = renderProxy.material;
  const materialRenderer = resolveWebGPUMaterialRenderer(state, material);
  if (materialRenderer === null) return;

  const textData = renderProxy.rendererData as unknown as WebGPUTextLabelData;
  const maxTexDim = state.device.limits.maxTextureDimension2D;
  const pixelRatio = state.pixelRatio;
  const version = getNodeLocalContentRevision(source);

  if (version !== textData.lastContentID || pixelRatio !== textData.lastPixelRatio) {
    const measure = (t: string, format: TextFormat): number => {
      textData.ctx.font = computeTextFormatFontString(format);
      return textData.ctx.measureText(t).width;
    };

    const result = getTextLayoutResult(getTextLabelRuntime(source) as TextLabelRuntime);
    computeTextLayout(result, {
      text,
      formatRanges: [createTextFormatRange(textFormat, 0, text.length)],
      width: fieldWidth,
      height: fieldHeight,
      measure,
    });

    textData.lastContentID = version;
    textData.lastPixelRatio = pixelRatio;
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
    const cached = runtime.textureCache.get(textData.canvas);
    if (cached !== undefined) {
      if (pw === textData.lastPW && ph === textData.lastPH) {
        // Same physical size: update content in-place.
        updateWebGPUTextureEntry(state, cached, textData.canvas);
      } else {
        // Physical size changed: destroy old GPU texture, let the batch create a new one.
        cached.texture.destroy();
        runtime.textureCache.delete(textData.canvas);
      }
    }

    textData.logW = w;
    textData.logH = h;
    textData.lastPW = pw;
    textData.lastPH = ph;
  }

  if (textData.logW <= 0 || textData.logH <= 0) return;

  ensureWebGPUQuadBatchResources(state);

  const startCount = runtime.spriteBatchCount;
  const base = prepareWebGPUSpriteBatchWrite(
    state,
    textData.canvas,
    renderProxy.blendMode,
    material,
    materialRenderer,
    1,
  );
  const d = runtime.spriteBatchInstanceData;
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
  packWebGPUSpriteBatchMaterialInstance(state, renderProxy.materialData, startCount);
  runtime.spriteBatchCount++;
}

export const defaultWebGPUTextLabelRenderer: DisplayObjectRenderer = {
  format: BatchFormat.Quad,
  createData: createWebGPUTextLabelData,
  destroyData: destroyWebGPUTextLabelData,
  submit: drawWebGPUTextLabel,
};
