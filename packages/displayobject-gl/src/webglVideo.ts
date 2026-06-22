import { createGlTexture, drawGlQuad, useGlProgram } from '@flighthq/render-gl';
import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import { resolveGlShader } from '@flighthq/render-gl';
import type {
  DisplayObjectRenderer,
  GlRenderState,
  Renderable,
  RendererData,
  RenderProxy2D,
  Video,
} from '@flighthq/types';

import { flushGlSpriteBatch } from './webglSpriteBatch';

// Records the video element whose GPU texture (held in the shared textureCache, keyed by element)
// this node last uploaded, so destroyGlVideoData can free it on teardown.
interface GlVideoData {
  lastElement: HTMLVideoElement | null;
}

export function createGlVideoData(_state: GlRenderState, _source: Renderable): RendererData {
  return { lastElement: null } as unknown as RendererData;
}

// Frees the GPU texture uploaded for this video's element when the node is torn down via
// disposeDisplayObjectRender. The element-keyed textureCache entry would otherwise leak.
export function destroyGlVideoData(state: GlRenderState, data: RendererData): void {
  const runtime = getGlRenderStateRuntime(state);
  const { lastElement } = data as unknown as GlVideoData;
  if (lastElement === null) return;
  const texture = runtime.textureCache.get(lastElement);
  if (texture !== undefined) {
    state.gl.deleteTexture(texture);
    runtime.textureCache.delete(lastElement);
  }
}

export function drawGlVideo(state: GlRenderState, renderProxy: RenderProxy2D): void {
  const runtime = getGlRenderStateRuntime(state);
  flushGlSpriteBatch(state);
  const source = renderProxy.source as Video;
  const element = source.data.source?.element;
  if (element === undefined || element === null || element.readyState < 2) return;

  const vw = element.videoWidth;
  const vh = element.videoHeight;
  if (vw === 0 || vh === 0) return;

  if (renderProxy.rendererData !== null) {
    (renderProxy.rendererData as unknown as GlVideoData).lastElement = element;
  }

  const gl = state.gl;
  const { textureCache } = runtime;

  const shader = resolveGlShader(state, renderProxy);
  useGlProgram(state, shader);
  state.applyBlendMode?.(state, renderProxy.blendMode);

  let texture = textureCache.get(element);
  if (!texture) {
    texture = createGlTexture(state);
    textureCache.set(element, texture);
  } else {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    runtime.currentTexture = texture;
  }

  // Upload current frame every time â€” video content changes each frame.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, element);

  shader.bind(gl, state, renderProxy);
  drawGlQuad(state, 0, 0, vw, vh, 0, 0, 1, 1);
}

export const defaultGlVideoRenderer: DisplayObjectRenderer = {
  createData: createGlVideoData,
  destroyData: destroyGlVideoData,
  submit: drawGlVideo,
};
