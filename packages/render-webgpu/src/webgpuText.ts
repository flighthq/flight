import { getTextRuntime } from '@flighthq/displayobject';
import { computeTextFormatFontString, noopRendererData, rgb24ToHexString } from '@flighthq/render';
import { computeTextLayout, createTextFormatRange, getTextLayoutResult } from '@flighthq/text-layout';
import type {
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  RenderState,
  Text,
  TextFormat,
  TextRuntime,
} from '@flighthq/types';

import type { WebGPURenderStateInternal, WebGPUTextureEntry } from './internal';
import { createWebGPUTextureEntry, drawWebGPUQuad, updateWebGPUTextureEntry } from './webgpuDraw';

const LAYOUT_WIDTH = 10_000;

let _offscreenCanvas: HTMLCanvasElement | null = null;
let _offscreenCtx: CanvasRenderingContext2D | null = null;

function getOffscreenCanvas(width: number, height: number, pixelRatio: number): CanvasRenderingContext2D {
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

const _textureMap = new WeakMap<DisplayObjectRenderNode, WebGPUTextureEntry>();

export function drawWebGPUText(state: RenderState, renderNode: DisplayObjectRenderNode): void {
  const internal = state as WebGPURenderStateInternal;
  if (internal.renderPass === null) return;

  const source = renderNode.source as Text;
  const { text, textFormat } = source.data;
  if (text.length === 0) return;

  const measure = (t: string, format: TextFormat): number => {
    const offCtx = getOffscreenCanvas(1, 1, 1);
    offCtx.font = computeTextFormatFontString(format);
    return offCtx.measureText(t).width;
  };

  const result = getTextLayoutResult(getTextRuntime(source) as TextRuntime);
  computeTextLayout(result, {
    text,
    formatRanges: [createTextFormatRange(textFormat, 0, text.length)],
    width: LAYOUT_WIDTH,
    height: LAYOUT_WIDTH,
    measure,
  });

  if (result.groups.length === 0) return;

  let maxX = 0;
  let maxY = 0;
  for (const group of result.groups) {
    const right = group.offsetX + group.width;
    const bottom = group.offsetY + group.ascent + group.descent;
    if (right > maxX) maxX = right;
    if (bottom > maxY) maxY = bottom;
  }
  if (maxX <= 0 || maxY <= 0) return;

  const maxTexDim = internal.device.limits.maxTextureDimension2D;
  const pixelRatio = internal.pixelRatio;
  const maxLogical = Math.floor(maxTexDim / pixelRatio);
  const w = Math.min(Math.ceil(maxX), maxLogical);
  const h = Math.min(Math.ceil(maxY), maxLogical);
  const offCtx = getOffscreenCanvas(w, h, pixelRatio);
  offCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  offCtx.clearRect(0, 0, w, h);
  offCtx.textBaseline = 'alphabetic';
  offCtx.textAlign = 'start';

  for (const group of result.groups) {
    offCtx.font = computeTextFormatFontString(group.format);
    offCtx.fillStyle = rgb24ToHexString(group.format.color ?? 0);
    const slice = text.substring(group.startIndex, group.endIndex);
    offCtx.fillText(slice, group.offsetX, group.offsetY + group.ascent * 0.815);
  }

  internal.applyBlendMode?.(internal, renderNode.blendMode);

  let entry = _textureMap.get(renderNode);
  if (!entry) {
    entry = createWebGPUTextureEntry(internal, _offscreenCanvas!.width, _offscreenCanvas!.height, _offscreenCanvas!);
    _textureMap.set(renderNode, entry);
  } else {
    updateWebGPUTextureEntry(internal, entry, _offscreenCanvas!);
  }

  drawWebGPUQuad(internal, renderNode, entry, 0, 0, w, h, 0, 0, 1, 1);
}

export function drawWebGPUTextMask(state: RenderState, data: DisplayObjectRenderNode): void {
  drawWebGPUText(state, data);
}

export const defaultWebGPUTextRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  draw: drawWebGPUText,
};
