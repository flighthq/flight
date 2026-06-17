import type { RenderNode2D } from '@flighthq/types';

import { makeWebGLState } from './webglTestHelper';
import { defaultWebGLVideoRenderer, drawWebGLVideo, drawWebGLVideoMask } from './webglVideo';

function makeVideoNode(element: HTMLVideoElement | null = null): RenderNode2D {
  return {
    source: { data: { source: element !== null ? { element } : null } },
    blendMode: 0,
    alpha: 1,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    rendererData: null,
  } as unknown as RenderNode2D;
}

describe('defaultWebGLVideoRenderer', () => {
  it('has submit, and createData functions', () => {
    expect(typeof defaultWebGLVideoRenderer.submit).toBe('function');
    expect(typeof defaultWebGLVideoRenderer.createData).toBe('function');
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
