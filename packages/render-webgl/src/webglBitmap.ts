import { createNullRendererData } from '@flighthq/render';
import type { Bitmap, DisplayObjectRenderer, DisplayObjectRenderTreeNode, RenderState } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { bindWebGLTexture, drawWebGLQuad, setWebGLBlendMode, useWebGLProgram } from './webglDraw';

export function drawWebGLBitmap(state: RenderState, renderNode: DisplayObjectRenderTreeNode): void {
  const internal = state as WebGLRenderStateInternal;
  const source = renderNode.source as Bitmap;
  const imageSource = source.data.image;
  if (imageSource === null || imageSource.src === null) return;

  useWebGLProgram(internal);
  setWebGLBlendMode(internal, renderNode.blendMode);
  bindWebGLTexture(internal, imageSource.src);

  internal.defaultBitmapShader.bind(internal.gl, internal, renderNode);

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

export function drawWebGLBitmapMask(_state: RenderState, _data: DisplayObjectRenderTreeNode): void {
  drawWebGLBitmap(_state, _data);
}

export const defaultWebGLBitmapRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawWebGLBitmap,
};
