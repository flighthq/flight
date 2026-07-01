import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type { RendererData, RenderProxy2D } from '@flighthq/types';

import { createGlState } from './glTestHelper';
import { createGlVideoData, defaultGlVideoRenderer, destroyGlVideoData, drawGlVideo } from './glVideo';

function makeVideoNode(element: HTMLVideoElement | null = null): RenderProxy2D {
  return {
    source: { data: { source: element !== null ? { element } : null } },
    blendMode: 0,
    alpha: 1,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    rendererData: { lastElement: null },
  } as unknown as RenderProxy2D;
}

describe('createGlVideoData', () => {
  it('allocates per-node data with no element recorded yet', () => {
    const { state } = createGlState();
    const data = createGlVideoData(state, {} as never) as unknown as { lastElement: HTMLVideoElement | null };
    expect(data.lastElement).toBeNull();
  });
});

describe('defaultGlVideoRenderer', () => {
  it('has submit, and createData functions', () => {
    expect(typeof defaultGlVideoRenderer.submit).toBe('function');
    expect(typeof defaultGlVideoRenderer.createData).toBe('function');
  });
});

describe('destroyGlVideoData', () => {
  it('deletes the cached GPU texture for the recorded element', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const element = document.createElement('video');
    const texture = gl.createTexture();
    runtime.textureCache.set(element, texture as WebGLTexture);
    const deleteSpy = vi.spyOn(gl, 'deleteTexture');
    destroyGlVideoData(state, { lastElement: element } as unknown as RendererData);
    expect(deleteSpy).toHaveBeenCalledWith(texture);
    expect(runtime.textureCache.has(element)).toBe(false);
  });

  it('is a no-op when no element was recorded', () => {
    const { state, gl } = createGlState();
    const deleteSpy = vi.spyOn(gl, 'deleteTexture');
    destroyGlVideoData(state, { lastElement: null } as unknown as RendererData);
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
});
