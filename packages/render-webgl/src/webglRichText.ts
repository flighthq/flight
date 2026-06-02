import { computeTextFormatFontString, createNullRendererData, rgbaToHexString } from '@flighthq/render';
import { getRichTextRuntime } from '@flighthq/scene-display';
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
  DisplayObjectRenderTreeNode,
  RenderState,
  RichText,
  RichTextRuntime,
  TextFormat,
  TextLayoutResult,
  TextRuntime,
} from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { createWebGLTexture, drawWebGLQuad, updateWebGLTexture, useWebGLProgram } from './webglDraw';

let _offscreenCanvas: HTMLCanvasElement | null = null;
let _offscreenCtx: CanvasRenderingContext2D | null = null;

const _textureMap = new WeakMap<DisplayObjectRenderTreeNode, WebGLTexture>();

export type WebGLRichTextOverlay = (
  context: CanvasRenderingContext2D,
  source: RichText,
  result: TextLayoutResult,
  fieldW: number,
  fieldH: number,
  text: string,
) => void;

export function drawWebGLRichText(state: RenderState, renderNode: DisplayObjectRenderTreeNode): void {
  drawWebGLRichTextWithOverlay(state, renderNode);
}

export function drawWebGLRichTextMask(state: RenderState, data: DisplayObjectRenderTreeNode): void {
  drawWebGLRichText(state, data);
}

export function drawWebGLRichTextWithOverlay(
  state: RenderState,
  renderNode: DisplayObjectRenderTreeNode,
  overlay?: WebGLRichTextOverlay,
): void {
  const internal = state as WebGLRenderStateInternal;
  const source = renderNode.source as RichText;
  const data = source.data;
  const richTextRuntime = getRichTextRuntime(source) as RichTextRuntime;
  const content = getRichTextContent(richTextRuntime);
  computeRichTextContent(content, data);
  if (content.text.length === 0 && !data.background && !data.border) return;

  const result = layoutRichText(source, richTextRuntime, content.text, content.formatRanges);
  const fieldW = Math.ceil(getRichTextFieldWidth(data, result));
  const fieldH = Math.ceil(getRichTextFieldHeight(data, result));
  if (fieldW <= 0 || fieldH <= 0) return;

  const pixelRatio = internal.pixelRatio;
  const offCtx = getOffscreenCanvas(fieldW, fieldH, pixelRatio);
  offCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  offCtx.clearRect(0, 0, fieldW, fieldH);

  if (data.background) {
    offCtx.fillStyle = rgbaToHexString(data.backgroundColor);
    offCtx.fillRect(0, 0, fieldW, fieldH);
  }

  if (data.border) {
    offCtx.strokeStyle = rgbaToHexString(data.borderColor);
    offCtx.lineWidth = 1;
    offCtx.strokeRect(0, 0, fieldW, fieldH);
  }

  if (content.text.length > 0) {
    drawRichTextToCanvas(offCtx, source, result, fieldW, fieldH, content.text);
  }
  overlay?.(offCtx, source, result, fieldW, fieldH, content.text);

  useWebGLProgram(internal);

  let texture = _textureMap.get(renderNode);
  if (!texture) {
    texture = createWebGLTexture(internal);
    _textureMap.set(renderNode, texture);
  }
  updateWebGLTexture(internal, texture, _offscreenCanvas!);

  internal.defaultBitmapShader.bind(internal.gl, internal, renderNode);

  drawWebGLQuad(internal, 0, 0, fieldW, fieldH, 0, 0, 1, 1);
}

export const defaultWebGLRichTextRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawWebGLRichText,
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
    context.fillStyle = rgbaToHexString(group.format.color ?? data.textColor);
    const slice = text.substring(group.startIndex, group.endIndex);
    const x = group.offsetX - scrollXOffset;
    const y = group.offsetY + group.ascent - scrollYOffset;
    context.fillText(slice, x, y);

    if (group.format.underline) {
      const lineY = y + group.descent;
      context.strokeStyle = rgbaToHexString(group.format.color ?? data.textColor);
      context.lineWidth = Math.max(1, (group.format.size ?? 12) / 16);
      context.beginPath();
      context.moveTo(x, lineY);
      context.lineTo(x + group.width, lineY);
      context.stroke();
    }
  }

  context.restore();
}

function layoutRichText(
  source: RichText,
  richTextRuntime: RichTextRuntime,
  text: string,
  formatRanges: Parameters<typeof computeTextLayout>[1]['formatRanges'],
): ReturnType<typeof getTextLayoutResult> {
  const data = source.data;
  const measure = (value: string, format: TextFormat): number => {
    const context = getOffscreenCanvas(1, 1);
    context.font = computeTextFormatFontString(format);
    return context.measureText(value).width;
  };

  const result = getTextLayoutResult(richTextRuntime as TextRuntime);
  computeTextLayout(result, {
    text,
    formatRanges,
    width: data.wordWrap ? data.width : 10000,
    height: data.height,
    measure,
    multiline: data.multiline,
    wordWrap: data.wordWrap,
  });
  return result;
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
