import { computeTextFormatFontString, createNullRendererData, rgbaToHexString } from '@flighthq/render-core';
import { getTextRuntime } from '@flighthq/scenegraph-display';
import { computeTextLayout, createTextFormatRange, getTextLayoutResult } from '@flighthq/text-layout';
import type {
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  RenderState,
  Text,
  TextFormat,
  TextRuntime,
} from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { createWebGLTexture, drawWebGLQuad, updateWebGLTexture, useWebGLProgram } from './webglDraw';
import { setWebGLMatrixFromTransform } from './webglShader';

const LAYOUT_WIDTH = 10000;

// Offscreen canvas for rasterising text
let _offscreenCanvas: HTMLCanvasElement | null = null;
let _offscreenCtx: CanvasRenderingContext2D | null = null;

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

// Per-render-node WebGL texture for text
const _textureMap = new WeakMap<DisplayObjectRenderNode, WebGLTexture>();

export function drawWebGLText(state: RenderState, renderNode: DisplayObjectRenderNode): void {
  const internal = state as WebGLRenderStateInternal;
  const source = renderNode.source as Text;
  const { text, textFormat } = source.data;
  if (text.length === 0) return;

  // Layout text to get total bounds
  const measure = (t: string, format: TextFormat): number => {
    const offCtx = getOffscreenCanvas(1, 1);
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

  // Determine canvas size from laid-out groups
  let maxX = 0;
  let maxY = 0;
  for (const group of result.groups) {
    const right = group.offsetX + group.width;
    const bottom = group.offsetY + group.ascent + group.descent;
    if (right > maxX) maxX = right;
    if (bottom > maxY) maxY = bottom;
  }
  if (maxX <= 0 || maxY <= 0) return;

  const w = Math.ceil(maxX);
  const h = Math.ceil(maxY);
  const pixelRatio = internal.pixelRatio;
  const offCtx = getOffscreenCanvas(w, h, pixelRatio);
  offCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  offCtx.clearRect(0, 0, w, h);
  offCtx.textBaseline = 'alphabetic';
  offCtx.textAlign = 'start';

  for (const group of result.groups) {
    offCtx.font = computeTextFormatFontString(group.format);
    offCtx.fillStyle = rgbaToHexString(group.format.color ?? 0);
    const slice = text.substring(group.startIndex, group.endIndex);
    const x = group.offsetX;
    // group.ascent = font-size; CSS places the alphabetic baseline at ~80% of the em-size.
    // Subtract 20% so the rasterised texture aligns with the DOM renderer's natural baseline.
    const y = group.offsetY + group.ascent * 0.815;
    offCtx.fillText(slice, x, y);
  }

  useWebGLProgram(internal);

  // Get or create a texture for this render node
  let texture = _textureMap.get(renderNode);
  if (!texture) {
    texture = createWebGLTexture(internal);
    _textureMap.set(renderNode, texture);
  }
  updateWebGLTexture(internal, texture, _offscreenCanvas!);

  const gl = internal.gl;
  const { shaderLoc, matrixArray } = internal;
  gl.uniform1f(shaderLoc.locAlpha, renderNode.alpha);
  gl.uniform1i(shaderLoc.locTexture, 0);
  setWebGLMatrixFromTransform(gl, shaderLoc, matrixArray, renderNode.transform2D, internal.canvas);

  drawWebGLQuad(internal, 0, 0, w, h, 0, 0, 1, 1);
}

export function drawWebGLTextMask(_state: RenderState, _data: DisplayObjectRenderNode): void {}

export const defaultWebGLTextRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawWebGLText,
  drawMask: drawWebGLTextMask,
};
