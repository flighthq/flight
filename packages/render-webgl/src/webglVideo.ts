import { noopRendererData } from '@flighthq/render';
import type { DisplayObjectRenderer, RenderProxy2D, RenderState, Video } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { createWebGLTexture, drawWebGLQuad, useWebGLProgram } from './webglDraw';
import { resolveWebGLShader } from './webglShaderBinding';
import { flushWebGLSpriteBatch } from './webglSpriteBatch';

export function drawWebGLVideo(state: RenderState, renderProxy: RenderProxy2D): void {
  const internal = state as WebGLRenderStateInternal;
  flushWebGLSpriteBatch(internal);
  const source = renderProxy.source as Video;
  const element = source.data.source?.element;
  if (element === undefined || element === null || element.readyState < 2) return;

  const vw = element.videoWidth;
  const vh = element.videoHeight;
  if (vw === 0 || vh === 0) return;

  const { gl, textureCache } = internal;

  const shader = resolveWebGLShader(internal, renderProxy);
  useWebGLProgram(internal, shader);
  internal.applyBlendMode?.(internal, renderProxy.blendMode);

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

  shader.bind(gl, internal, renderProxy);
  drawWebGLQuad(internal, 0, 0, vw, vh, 0, 0, 1, 1);
}

export function drawWebGLVideoMask(_state: RenderState, _renderProxy: RenderProxy2D): void {
  drawWebGLVideo(_state, _renderProxy);
}

export const defaultWebGLVideoRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawWebGLVideo,
};
