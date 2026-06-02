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

  drawWebGLQuad(internal, 0, 0, imageSource.width, imageSource.height, 0, 0, 1, 1);
}

export function drawWebGLBitmapMask(_state: RenderState, _data: DisplayObjectRenderTreeNode): void {
  drawWebGLBitmap(_state, _data);
}

export const defaultWebGLBitmapRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawWebGLBitmap,
};
