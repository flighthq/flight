import { createNullRendererData } from '@flighthq/render-core';
import type { DisplayObjectRenderer, DisplayObjectRenderTreeNode, RenderState, Video } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { createWebGLTexture, drawWebGLQuad, setWebGLBlendMode, useWebGLProgram } from './webglDraw';

export function drawWebGLVideo(state: RenderState, renderNode: DisplayObjectRenderTreeNode): void {
  const internal = state as WebGLRenderStateInternal;
  const source = renderNode.source as Video;
  const element = source.data.source?.element;
  if (element === undefined || element === null || element.readyState < 2) return;

  const vw = element.videoWidth;
  const vh = element.videoHeight;
  if (vw === 0 || vh === 0) return;

  const { gl, textureCache } = internal;

  useWebGLProgram(internal);
  setWebGLBlendMode(internal, renderNode.blendMode);

  let texture = textureCache.get(element);
  if (!texture) {
    texture = createWebGLTexture(internal);
    textureCache.set(element, texture);
  } else {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    internal.currentTexture = texture;
  }

  // Upload current frame every time — video content changes each frame.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, element);

  internal.defaultBitmapShader.bind(gl, internal, renderNode);
  drawWebGLQuad(internal, 0, 0, vw, vh, 0, 0, 1, 1);
}

export function drawWebGLVideoMask(_state: RenderState, _renderNode: DisplayObjectRenderTreeNode): void {
  drawWebGLVideo(_state, _renderNode);
}

export const defaultWebGLVideoRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawWebGLVideo,
  drawMask: drawWebGLVideoMask,
};
