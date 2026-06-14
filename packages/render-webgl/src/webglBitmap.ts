import { noopRendererData } from '@flighthq/render';
import type { Bitmap, DisplayObjectRenderer, DisplayObjectRenderNode, RenderState } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { bindWebGLTexture, drawWebGLQuad, useWebGLProgram } from './webglDraw';
import { resolveWebGLShader } from './webglShaderBinding';

export function drawWebGLBitmap(state: RenderState, renderNode: DisplayObjectRenderNode): void {
  const internal = state as WebGLRenderStateInternal;
  const source = renderNode.source as Bitmap;
  const imageSource = source.data.image;
  if (imageSource === null || imageSource.src === null) return;

  const shader = resolveWebGLShader(internal, renderNode);
  useWebGLProgram(internal, shader);
  internal.applyBlendMode?.(internal, renderNode.blendMode);
  bindWebGLTexture(internal, imageSource.src);

  shader.bind(internal.gl, internal, renderNode);

  const sr = source.data.sourceRectangle ?? null;
  if (sr === null) {
    drawWebGLQuad(internal, 0, 0, imageSource.width, imageSource.height, 0, 0, 1, 1);
  } else {
    const u0 = sr.x / imageSource.width;
    const v0 = sr.y / imageSource.height;
    const u1 = (sr.x + sr.width) / imageSource.width;
    const v1 = (sr.y + sr.height) / imageSource.height;
    drawWebGLQuad(internal, 0, 0, sr.width, sr.height, u0, v0, u1, v1);
  }
}

export function drawWebGLBitmapMask(_state: RenderState, _data: DisplayObjectRenderNode): void {
  drawWebGLBitmap(_state, _data);
}

export const defaultWebGLBitmapRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  draw: drawWebGLBitmap,
};
