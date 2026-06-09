import { createNullRendererData } from '@flighthq/render';
import type { DisplayObjectRenderer, DisplayObjectRenderNode, RenderState, Video } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
<<<<<<< HEAD
import { createWebGLTexture, drawWebGLQuad, useWebGLProgram } from './webglDraw';
=======
import { createWebGLTexture, drawWebGLQuad, setWebGLBlendMode, useWebGLProgram } from './webglDraw';
>>>>>>> 316a391 (render-webgl: Add wiring for custom shader)
import { selectWebGLShader } from './webglShaderBinding';

export function drawWebGLVideo(state: RenderState, renderNode: DisplayObjectRenderNode): void {
  const internal = state as WebGLRenderStateInternal;
  const source = renderNode.source as Video;
  const element = source.data.source?.element;
  if (element === undefined || element === null || element.readyState < 2) return;

  const vw = element.videoWidth;
  const vh = element.videoHeight;
  if (vw === 0 || vh === 0) return;

  const { gl, textureCache } = internal;

  const shader = selectWebGLShader(internal, renderNode);
  useWebGLProgram(internal, shader);
<<<<<<< HEAD
  internal.applyBlendMode?.(internal, renderNode.blendMode);
=======
  setWebGLBlendMode(internal, renderNode.blendMode);
>>>>>>> 316a391 (render-webgl: Add wiring for custom shader)

  let texture = textureCache.get(element);
  if (!texture) {
    texture = createWebGLTexture(internal);
    textureCache.set(element, texture);
  } else {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    internal.currentTexture = texture;
  }

  // Upload current frame every time â€” video content changes each frame.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, element);

  shader.bind(gl, internal, renderNode);
  drawWebGLQuad(internal, 0, 0, vw, vh, 0, 0, 1, 1);
}

export function drawWebGLVideoMask(_state: RenderState, _renderNode: DisplayObjectRenderNode): void {
  drawWebGLVideo(_state, _renderNode);
}

export const defaultWebGLVideoRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawWebGLVideo,
};
