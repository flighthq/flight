import { createNullRendererData } from '@flighthq/render-core';
import { createTextFormatRange, createTextLayoutResult, layoutText } from '@flighthq/text-layout';
import type { DisplayObjectRenderer, DisplayObjectRenderNode, RenderState, Text, TextFormat } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { createWebGLTexture, drawWebGLQuad, updateWebGLTexture, useWebGLProgram } from './webglDraw';
import { setWebGLMatrixFromTransform } from './webglShader';
import { colorToHex, formatToCanvasFont } from './webglTextHelpers';

const LAYOUT_WIDTH = 10000;
const _textLayout = createTextLayoutResult();

// Offscreen canvas for rasterising text
let _offscreenCanvas: HTMLCanvasElement | null = null;
let _offscreenCtx: CanvasRenderingContext2D | null = null;

function getOffscreenCanvas(width: number, height: number): CanvasRenderingContext2D {
  if (!_offscreenCanvas) {
    _offscreenCanvas = document.createElement('canvas');
    _offscreenCtx = _offscreenCanvas.getContext('2d')!;
  }
  if (_offscreenCanvas.width !== width) _offscreenCanvas.width = width;
  if (_offscreenCanvas.height !== height) _offscreenCanvas.height = height;
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
    offCtx.font = formatToCanvasFont(format);
    return offCtx.measureText(t).width;
  };

  layoutText(_textLayout, {
    text,
    formatRanges: [createTextFormatRange(textFormat, 0, text.length)],
    width: LAYOUT_WIDTH,
    height: LAYOUT_WIDTH,
    measure,
  });

  const result = _textLayout;
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
  const offCtx = getOffscreenCanvas(w, h);
  offCtx.clearRect(0, 0, w, h);
  offCtx.textBaseline = 'alphabetic';
  offCtx.textAlign = 'start';

  for (const group of result.groups) {
    offCtx.font = formatToCanvasFont(group.format);
    offCtx.fillStyle = colorToHex(group.format.color ?? 0);
    const slice = text.substring(group.startIndex, group.endIndex);
    const x = group.offsetX;
    const y = group.offsetY + group.ascent;
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
