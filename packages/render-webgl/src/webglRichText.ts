import { computeRGBHexString } from '@flighthq/materials';
import { computeTextFormatFontString } from '@flighthq/render';
import { getRichTextPasswordCharacter, getRichTextRuntime } from '@flighthq/text';
import {
  computeRichTextContent,
  computeTextBoundsHeight,
  computeTextBoundsOffsetX,
  computeTextBoundsWidth,
  computeTextLayout,
  getRichTextContent,
  getRichTextScrollYOffset,
  getTextLayoutResult,
} from '@flighthq/text-layout';
import type {
  DisplayObjectRenderer,
  Renderable,
  RendererData,
  RenderProxy2D,
  RichText,
  RichTextRuntime,
  TextFormat,
  TextLabelRuntime,
  TextLayoutResult,
  WebGLRenderState,
} from '@flighthq/types';

import { createWebGLTexture, drawWebGLQuad, updateWebGLTexture, useWebGLProgram } from './webglDraw';
import { resolveWebGLShader } from './webglShaderBinding';
import { flushWebGLSpriteBatch } from './webglSpriteBatch';

let _offscreenCanvas: HTMLCanvasElement | null = null;
let _offscreenCtx: CanvasRenderingContext2D | null = null;
let _webglTextInputOverlay: WebGLRichTextOverlay | null = null;

// Per-node GPU texture this rich text rasterizes into. Held on the node's RendererData (not a
// module-level map keyed by render proxy) so destroyWebGLRichTextData can free it on teardown.
interface WebGLRichTextData {
  texture: WebGLTexture | null;
}

export function createWebGLRichTextData(_state: WebGLRenderState, _source: Renderable): RendererData {
  return { texture: null } as unknown as RendererData;
}

// Frees the GPU texture this rich text node owns when it is torn down via disposeDisplayObjectRender.
export function destroyWebGLRichTextData(state: WebGLRenderState, data: RendererData): void {
  const { texture } = data as unknown as WebGLRichTextData;
  if (texture !== null) state.gl.deleteTexture(texture);
}

export type WebGLRichTextOverlay = (
  context: CanvasRenderingContext2D,
  source: RichText,
  result: TextLayoutResult,
  fieldW: number,
  fieldH: number,
  text: string,
) => void;

export function drawWebGLRichText(state: WebGLRenderState, renderProxy: RenderProxy2D): void {
  // The editable-input overlay rasterizes onto the offscreen field texture, so it is passed into the
  // rasterization pass — only when the input slot is present. registerWebGLTextInputOverlay
  // (enableWebGLTextInput) installs it; a static RichText leaves the slot null and pulls no text-input code.
  const overlay =
    _webglTextInputOverlay !== null && getRichTextRuntime(renderProxy.source as RichText).input !== null
      ? _webglTextInputOverlay
      : undefined;
  drawWebGLRichTextWithOverlay(state, renderProxy, overlay);
}

export function drawWebGLRichTextWithOverlay(
  state: WebGLRenderState,
  renderProxy: RenderProxy2D,
  overlay?: WebGLRichTextOverlay,
): void {
  flushWebGLSpriteBatch(state);
  const source = renderProxy.source as RichText;
  const data = source.data;
  const richTextRuntime = getRichTextRuntime(source) as RichTextRuntime;
  const content = getRichTextContent(richTextRuntime);
  computeRichTextContent(content, data, getRichTextPasswordCharacter(source));
  if (content.text.length === 0 && !data.background && !data.border) return;

  const result = layoutRichText(source, richTextRuntime, content.text, content.formatRanges);
  const fieldW = Math.ceil(computeTextBoundsWidth(data, result));
  const fieldH = Math.ceil(computeTextBoundsHeight(data, result));
  if (fieldW <= 0 || fieldH <= 0) return;

  const pixelRatio = state.pixelRatio;
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

  const shader = resolveWebGLShader(state, renderProxy);
  useWebGLProgram(state, shader);

  if (renderProxy.rendererData === null) return;
  const richTextData = renderProxy.rendererData as unknown as WebGLRichTextData;
  let texture = richTextData.texture;
  if (texture === null) {
    texture = createWebGLTexture(state);
    richTextData.texture = texture;
  }
  updateWebGLTexture(state, texture, _offscreenCanvas!);

  shader.bind(state.gl, state, renderProxy);

  // Anchor the field box for autoSize 'right'/'center' so the rendered quad lines up with the local
  // bounds (computeRichTextLocalBoundsRectangle applies the same offset). Zero for 'none'/'left'.
  const offsetX = computeTextBoundsOffsetX(data, result);
  drawWebGLQuad(state, offsetX, 0, offsetX + fieldW, fieldH, 0, 0, 1, 1);
}

export function registerWebGLTextInputOverlay(overlay: WebGLRichTextOverlay): void {
  _webglTextInputOverlay = overlay;
}

export const defaultWebGLRichTextRenderer: DisplayObjectRenderer = {
  createData: createWebGLRichTextData,
  destroyData: destroyWebGLRichTextData,
  submit: drawWebGLRichText,
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

  const result = getTextLayoutResult(richTextRuntime as TextLabelRuntime);
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
