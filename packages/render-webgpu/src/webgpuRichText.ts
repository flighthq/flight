import { getRichTextRuntime } from '@flighthq/displayobject';
import { computeRGBHexString } from '@flighthq/materials';
import { computeTextFormatFontString } from '@flighthq/render';
import {
  computeRichTextContent,
  computeTextLayout,
  getRichTextContent,
  getRichTextFieldHeight,
  getRichTextFieldWidth,
  getRichTextScrollYOffset,
  getTextLayoutResult,
} from '@flighthq/text-layout';
import type {
  DisplayObjectRenderer,
  Renderable,
  RendererData,
  RenderProxy2D,
  RenderState,
  RichText,
  RichTextRuntime,
  TextFormat,
  TextLayoutResult,
  TextRuntime,
} from '@flighthq/types';

import type { WebGPURenderStateInternal, WebGPUTextureEntry } from './internal';
import { createWebGPUTextureEntry, drawWebGPUQuad, updateWebGPUTextureEntry } from './webgpuDraw';
import { flushWebGPUSpriteBatch } from './webgpuSpriteBatch';

export type WebGPURichTextOverlay = (
  context: CanvasRenderingContext2D,
  source: RichText,
  result: TextLayoutResult,
  fieldW: number,
  fieldH: number,
  text: string,
) => void;

let _offscreenCanvas: HTMLCanvasElement | null = null;
let _offscreenCtx: CanvasRenderingContext2D | null = null;

// Per-node GPU texture entry this rich text rasterizes into. Held on the node's RendererData (not a
// module-level map keyed by render proxy) so destroyWebGPURichTextData can free it on teardown.
interface WebGPURichTextData {
  entry: WebGPUTextureEntry | null;
  w: number;
  h: number;
}

export function createWebGPURichTextData(_state: RenderState, _source: Renderable): RendererData {
  return { entry: null, h: 0, w: 0 } as unknown as RendererData;
}

// Destroys the GPU texture this rich text node owns when it is torn down via disposeDisplayObjectRender.
export function destroyWebGPURichTextData(_state: RenderState, data: RendererData): void {
  const richData = data as unknown as WebGPURichTextData;
  richData.entry?.texture.destroy();
}

export function drawWebGPURichText(state: RenderState, renderProxy: RenderProxy2D): void {
  drawWebGPURichTextWithOverlay(state, renderProxy);
}

export function drawWebGPURichTextMask(state: RenderState, renderProxy: RenderProxy2D): void {
  drawWebGPURichText(state, renderProxy);
}

export function drawWebGPURichTextWithOverlay(
  state: RenderState,
  renderProxy: RenderProxy2D,
  overlay?: WebGPURichTextOverlay,
): void {
  const internal = state as WebGPURenderStateInternal;
  if (internal.renderPass === null) return;
  flushWebGPUSpriteBatch(internal);

  const source = renderProxy.source as RichText;
  const data = source.data;
  const richTextRuntime = getRichTextRuntime(source) as RichTextRuntime;
  const content = getRichTextContent(richTextRuntime);
  computeRichTextContent(content, data);
  if (content.text.length === 0 && !data.background && !data.border) return;

  const result = layoutRichText(source, richTextRuntime, content.text, content.formatRanges, internal);
  const maxTexDim = internal.device.limits.maxTextureDimension2D;
  const pixelRatio = internal.pixelRatio;
  const maxLogical = Math.floor(maxTexDim / pixelRatio);
  const fieldW = Math.min(Math.ceil(getRichTextFieldWidth(data, result)), maxLogical);
  const fieldH = Math.min(Math.ceil(getRichTextFieldHeight(data, result)), maxLogical);
  if (fieldW <= 0 || fieldH <= 0) return;

  const offCtx = getOffscreenCanvas(fieldW, fieldH, pixelRatio);
  offCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  offCtx.clearRect(0, 0, fieldW, fieldH);

  if (data.background) {
    offCtx.fillStyle = computeRGBHexString(data.backgroundColor);
    offCtx.fillRect(0, 0, fieldW, fieldH);
  }

  if (data.border) {
    offCtx.strokeStyle = computeRGBHexString(data.borderColor);
    offCtx.lineWidth = 1;
    offCtx.strokeRect(0, 0, fieldW, fieldH);
  }

  if (content.text.length > 0) {
    drawRichTextToCanvas(offCtx, source, result, fieldW, fieldH, content.text);
  }
  overlay?.(offCtx, source, result, fieldW, fieldH, content.text);

  internal.applyBlendMode?.(internal, renderProxy.blendMode);

  if (renderProxy.rendererData === null) return;
  const richData = renderProxy.rendererData as unknown as WebGPURichTextData;
  const pw = _offscreenCanvas!.width;
  const ph = _offscreenCanvas!.height;
  let entry = richData.entry;
  if (entry === null || richData.w !== pw || richData.h !== ph) {
    entry?.texture.destroy();
    entry = createWebGPUTextureEntry(internal, pw, ph, _offscreenCanvas!);
    richData.entry = entry;
    richData.w = pw;
    richData.h = ph;
  } else {
    updateWebGPUTextureEntry(internal, entry, _offscreenCanvas!);
  }

  drawWebGPUQuad(internal, renderProxy, entry, 0, 0, fieldW, fieldH, 0, 0, 1, 1);
}

export const defaultWebGPURichTextRenderer: DisplayObjectRenderer = {
  createData: createWebGPURichTextData,
  destroyData: destroyWebGPURichTextData,
  submit: drawWebGPURichText,
};

function drawRichTextToCanvas(
  context: CanvasRenderingContext2D,
  source: RichText,
  result: ReturnType<typeof getTextLayoutResult>,
  fieldW: number,
  fieldH: number,
  text: string,
): void {
  const data = source.data;
  const firstVisibleLine = data.scrollV - 1;
  const scrollYOffset = firstVisibleLine > 0 ? getRichTextScrollYOffset(result.lineHeights, firstVisibleLine) : 0;
  const scrollXOffset = data.scrollH;

  context.save();
  context.beginPath();
  context.rect(0, 0, fieldW, fieldH);
  context.clip();
  context.textBaseline = 'alphabetic';
  context.textAlign = 'start';

  for (const group of result.groups) {
    if (group.lineIndex < firstVisibleLine) continue;

    context.font = computeTextFormatFontString(group.format);
    context.fillStyle = computeRGBHexString(group.format.color ?? data.textColor);
    const slice = text.substring(group.startIndex, group.endIndex);
    const x = group.offsetX - scrollXOffset;
    const y = group.offsetY + group.ascent - scrollYOffset;
    context.fillText(slice, x, y);

    if (group.format.underline) {
      const lineY = y + group.descent;
      context.strokeStyle = computeRGBHexString(group.format.color ?? data.textColor);
      context.lineWidth = Math.max(1, (group.format.size ?? 12) / 16);
      context.beginPath();
      context.moveTo(x, lineY);
      context.lineTo(x + group.width, lineY);
      context.stroke();
    }
  }

  context.restore();
}

function getOffscreenCanvas(width: number, height: number, pixelRatio: number = 1): CanvasRenderingContext2D {
  if (!_offscreenCanvas) {
    _offscreenCanvas = document.createElement('canvas');
    _offscreenCtx = _offscreenCanvas.getContext('2d')!;
  }
  const pw = Math.ceil(width * pixelRatio);
  const ph = Math.ceil(height * pixelRatio);
  if (_offscreenCanvas.width !== pw) _offscreenCanvas.width = pw;
  if (_offscreenCanvas.height !== ph) _offscreenCanvas.height = ph;
  return _offscreenCtx!;
}

function layoutRichText(
  source: RichText,
  richTextRuntime: RichTextRuntime,
  text: string,
  formatRanges: Parameters<typeof computeTextLayout>[1]['formatRanges'],
  internal: WebGPURenderStateInternal,
): ReturnType<typeof getTextLayoutResult> {
  const data = source.data;
  const maxTexDim = internal.device.limits.maxTextureDimension2D;
  const maxLogical = Math.floor(maxTexDim / internal.pixelRatio);

  const measure = (value: string, format: TextFormat): number => {
    const context = getOffscreenCanvas(1, 1);
    context.font = computeTextFormatFontString(format);
    return context.measureText(value).width;
  };

  const result = getTextLayoutResult(richTextRuntime as TextRuntime);
  computeTextLayout(result, {
    formatRanges,
    height: Math.min(data.height, maxLogical),
    measure,
    multiline: data.multiline,
    text,
    width: Math.min(data.wordWrap ? data.width : 10000, maxLogical),
    wordWrap: data.wordWrap,
  });
  return result;
}
