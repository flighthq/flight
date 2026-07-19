import {
  bindGlVideoTexture,
  drawGlQuad,
  getGlRenderStateRuntime,
  resolveGlShader,
  useGlProgram,
} from '@flighthq/render-gl';
import { advanceVideoTexture, createVideoTexture } from '@flighthq/texture';
import type {
  DisplayObjectRenderer,
  GlRenderState,
  Renderable,
  RendererData,
  RenderProxy2D,
  Video,
  VideoResource,
  VideoTexture,
} from '@flighthq/types';

import { flushGlSpriteBatch } from './glSpriteBatch';

// Holds the VideoTexture this node draws through, bound to the video stream it last saw. The
// VideoTexture carries the frameId dirty-gate the GPU uploader watches (bindGlVideoTexture), so a
// paused stream re-uploads nothing. `source` is the VideoResource the texture wraps — when the node's
// resource swaps, the texture is rebuilt so the new stream's frames upload.
interface GlVideoData {
  source: VideoResource | null;
  videoTexture: VideoTexture | null;
}

export function createGlVideoData(_state: GlRenderState, _source: Renderable): RendererData {
  return { source: null, videoTexture: null } as unknown as RendererData;
}

// Frees the GPU texture the VideoTexture uploaded through when the node is torn down via
// disposeDisplayObjectRender. The VideoTexture-keyed videoTextureCache entry would otherwise leak.
export function destroyGlVideoData(state: GlRenderState, data: RendererData): void {
  const runtime = getGlRenderStateRuntime(state);
  const { videoTexture } = data as unknown as GlVideoData;
  if (videoTexture === null) return;
  const cache = runtime.videoTextureCache;
  const entry = cache?.get(videoTexture);
  if (entry !== undefined) {
    state.gl.deleteTexture(entry.texture);
    cache!.delete(videoTexture);
  }
}

export function drawGlVideo(state: GlRenderState, renderProxy: RenderProxy2D): void {
  flushGlSpriteBatch(state);
  const source = renderProxy.source as Video;
  const resource = source.data.source ?? null;
  const element = resource?.element ?? null;
  if (resource === null || element === null || element.readyState < 2) return;

  const vw = element.videoWidth;
  const vh = element.videoHeight;
  if (vw === 0 || vh === 0) return;

  const data = renderProxy.rendererData as unknown as GlVideoData | null;
  // Rebuild the VideoTexture when the node's stream swaps (or on the first draw), so the new stream's
  // frameId gate starts fresh and its first frame uploads.
  let videoTexture: VideoTexture;
  if (data !== null && data.videoTexture !== null && data.source === resource) {
    videoTexture = data.videoTexture;
  } else {
    videoTexture = createVideoTexture(resource);
    if (data !== null) {
      data.source = resource;
      data.videoTexture = videoTexture;
    }
  }
  // The element decodes a new frame each rendered tick; bump the revision so bindGlVideoTexture's gate
  // re-uploads this frame. A frame that has not advanced (a driver that only bumps on a real decode)
  // would skip the upload — here the display node advances every draw to match the element's live pixels.
  advanceVideoTexture(videoTexture);

  const shader = resolveGlShader(state, renderProxy);
  useGlProgram(state, shader);
  state.applyBlendMode?.(state, renderProxy.blendMode);

  bindGlVideoTexture(state, videoTexture);

  shader.bind(state.gl, state, renderProxy);
  drawGlQuad(state, 0, 0, vw, vh, 0, 0, 1, 1);
}

export const defaultGlVideoRenderer: DisplayObjectRenderer = {
  createData: createGlVideoData,
  destroyData: destroyGlVideoData,
  submit: drawGlVideo,
};
