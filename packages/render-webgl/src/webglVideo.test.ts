import type { RendererData, RenderProxy2D } from '@flighthq/types';

import { makeWebGLState } from './webglTestHelper';
import {
  createWebGLVideoData,
  defaultWebGLVideoRenderer,
  destroyWebGLVideoData,
  drawWebGLVideo,
  drawWebGLVideoMask,
} from './webglVideo';

function makeVideoNode(element: HTMLVideoElement | null = null): RenderProxy2D {
  return {
    source: { data: { source: element !== null ? { element } : null } },
    blendMode: 0,
    alpha: 1,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    rendererData: { lastElement: null },
  } as unknown as RenderProxy2D;
}

describe('createWebGLVideoData', () => {
  it('allocates per-node data with no element recorded yet', () => {
    const { state } = makeWebGLState();
    const data = createWebGLVideoData(state, {} as never) as unknown as { lastElement: HTMLVideoElement | null };
    expect(data.lastElement).toBeNull();
  });
});

describe('defaultWebGLVideoRenderer', () => {
  it('has submit, and createData functions', () => {
    expect(typeof defaultWebGLVideoRenderer.submit).toBe('function');
    expect(typeof defaultWebGLVideoRenderer.createData).toBe('function');
  });
});

describe('destroyWebGLVideoData', () => {
  it('deletes the cached GPU texture for the recorded element', () => {
    const { state, gl } = makeWebGLState();
    const element = document.createElement('video');
    const texture = gl.createTexture();
    state.textureCache.set(element, texture as WebGLTexture);
    const deleteSpy = vi.spyOn(gl, 'deleteTexture');
    destroyWebGLVideoData(state, { lastElement: element } as unknown as RendererData);
    expect(deleteSpy).toHaveBeenCalledWith(texture);
    expect(state.textureCache.has(element)).toBe(false);
  });

  it('is a no-op when no element was recorded', () => {
    const { state, gl } = makeWebGLState();
    const deleteSpy = vi.spyOn(gl, 'deleteTexture');
    destroyWebGLVideoData(state, { lastElement: null } as unknown as RendererData);
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});

describe('drawWebGLVideo', () => {
  it('returns early when source is null', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLVideo(state, makeVideoNode(null));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early when element has not loaded', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLVideo(state, makeVideoNode(document.createElement('video')));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });
});

describe('drawWebGLVideoMask', () => {
  it('uses the video draw path', () => {
    const { state, gl } = makeWebGLState();
    expect(() => drawWebGLVideoMask(state, makeVideoNode(null))).not.toThrow();
    expect(gl.drawElements).not.toHaveBeenCalled();
  });
});
