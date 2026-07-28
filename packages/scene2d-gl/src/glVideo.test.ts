import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type { ImageResource, RendererData, RenderProxy2D, Texture } from '@flighthq/types/contract';

import { createGlState } from './glTestHelper';
import { createGlVideoData, defaultGlVideoRenderer, destroyGlVideoData, drawGlVideo } from './glVideo';

function makeVideoNode(element: HTMLVideoElement | null = null): RenderProxy2D {
  return {
    source: { data: { source: element !== null ? { element } : null } },
    blendMode: 0,
    alpha: 1,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    rendererData: { source: null, videoTexture: null },
  } as unknown as RenderProxy2D;
}

function makeReadyElement(): HTMLVideoElement {
  const element = document.createElement('video');
  Object.defineProperty(element, 'readyState', { value: 4, configurable: true });
  Object.defineProperty(element, 'videoWidth', { value: 320, configurable: true });
  Object.defineProperty(element, 'videoHeight', { value: 240, configurable: true });
  return element;
}

describe('createGlVideoData', () => {
  it('allocates per-node data with no stream or texture recorded yet', () => {
    const { state } = createGlState();
    const data = createGlVideoData(state, {} as never) as unknown as {
      source: unknown;
      videoTexture: Texture | null;
    };
    expect(data.source).toBeNull();
    expect(data.videoTexture).toBeNull();
  });
});

describe('defaultGlVideoRenderer', () => {
  it('has submit, and createData functions', () => {
    expect(typeof defaultGlVideoRenderer.submit).toBe('function');
    expect(typeof defaultGlVideoRenderer.createData).toBe('function');
  });
});

describe('destroyGlVideoData', () => {
  it('deletes the cached GPU texture for the recorded video-backed Texture', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const backing = {} as ImageResource;
    const videoTexture = { storage: { dimension: '2d', image: backing } } as Texture;
    const texture = gl.createTexture() as WebGLTexture;
    runtime.videoTextureCache = new WeakMap();
    runtime.videoTextureCache.set(backing, { texture, uploadedVersion: -1 });
    const deleteSpy = vi.spyOn(gl, 'deleteTexture');
    destroyGlVideoData(state, { source: null, videoTexture } as unknown as RendererData);
    expect(deleteSpy).toHaveBeenCalledWith(texture);
    expect(runtime.videoTextureCache.has(backing)).toBe(false);
  });

  it('is a no-op when no video-backed Texture was recorded', () => {
    const { state, gl } = createGlState();
    const deleteSpy = vi.spyOn(gl, 'deleteTexture');
    destroyGlVideoData(state, { source: null, videoTexture: null } as unknown as RendererData);
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});

describe('drawGlVideo', () => {
  it('returns early when source is null', () => {
    const { state, gl } = createGlState();
    drawGlVideo(state, makeVideoNode(null));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early when element has not loaded', () => {
    const { state, gl } = createGlState();
    drawGlVideo(state, makeVideoNode(document.createElement('video')));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('builds a Texture and uploads the ready frame through the gated bind', () => {
    const { state, gl } = createGlState();
    const node = makeVideoNode(makeReadyElement());
    drawGlVideo(state, node);
    const data = node.rendererData as unknown as { videoTexture: Texture | null };
    expect(data.videoTexture).not.toBeNull();
    expect(gl.texImage2D).toHaveBeenCalled();
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('reuses the Texture across draws of the same stream', () => {
    const { state } = createGlState();
    const node = makeVideoNode(makeReadyElement());
    drawGlVideo(state, node);
    const first = (node.rendererData as unknown as { videoTexture: Texture | null }).videoTexture;
    drawGlVideo(state, node);
    const second = (node.rendererData as unknown as { videoTexture: Texture | null }).videoTexture;
    expect(second).toBe(first);
  });
});
