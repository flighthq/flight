import type {
  DisplayObjectRenderer,
  Renderable,
  RendererData,
  RenderProxy2D,
  Video,
  WebGLRenderState,
} from '@flighthq/types';

import { createWebGLTexture, drawWebGLQuad, useWebGLProgram } from './webglDraw';
import { getWebGLRenderStateRuntime } from './webglRenderState';
import { resolveWebGLShader } from './webglShaderBinding';
import { flushWebGLSpriteBatch } from './webglSpriteBatch';

// Records the video element whose GPU texture (held in the shared textureCache, keyed by element)
// this node last uploaded, so destroyWebGLVideoData can free it on teardown.
interface WebGLVideoData {
  lastElement: HTMLVideoElement | null;
}

export function createWebGLVideoData(_state: WebGLRenderState, _source: Renderable): RendererData {
  return { lastElement: null } as unknown as RendererData;
}

// Frees the GPU texture uploaded for this video's element when the node is torn down via
// disposeDisplayObjectRender. The element-keyed textureCache entry would otherwise leak.
export function destroyWebGLVideoData(state: WebGLRenderState, data: RendererData): void {
  const runtime = getWebGLRenderStateRuntime(state);
  const { lastElement } = data as unknown as WebGLVideoData;
  if (lastElement === null) return;
  const texture = runtime.textureCache.get(lastElement);
  if (texture !== undefined) {
    state.gl.deleteTexture(texture);
    runtime.textureCache.delete(lastElement);
  }
}

export function drawWebGLVideo(state: WebGLRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getWebGLRenderStateRuntime(state);
  flushWebGLSpriteBatch(state);
  const source = renderProxy.source as Video;
  const element = source.data.source?.element;
  if (element === undefined || element === null || element.readyState < 2) return;

  const vw = element.videoWidth;
  const vh = element.videoHeight;
  if (vw === 0 || vh === 0) return;

  if (renderProxy.rendererData !== null) {
    (renderProxy.rendererData as unknown as WebGLVideoData).lastElement = element;
  }

  const gl = state.gl;
  const { textureCache } = runtime;

  const shader = resolveWebGLShader(state, renderProxy);
  useWebGLProgram(state, shader);
  state.applyBlendMode?.(state, renderProxy.blendMode);

  let texture = textureCache.get(element);
  if (!texture) {
    texture = createWebGLTexture(state);
    textureCache.set(element, texture);
  } else {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    runtime.currentTexture = texture;
  }

  // Upload current frame every time â€” video content changes each frame.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, element);

  shader.bind(gl, state, renderProxy);
  drawWebGLQuad(state, 0, 0, vw, vh, 0, 0, 1, 1);
}

export const defaultWebGLVideoRenderer: DisplayObjectRenderer = {
  createData: createWebGLVideoData,
  destroyData: destroyWebGLVideoData,
  submit: drawWebGLVideo,
};
