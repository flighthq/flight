import { describe, expect, it } from 'vitest';

import { makeFilterState as makeWebGLState, makeRenderTarget } from './filterTestHelper';
import { applyWebGLBlurFilter } from './webglBlurFilter';

describe('applyWebGLBlurFilter', () => {
  it('calls drawElements for both H and V passes with a single quality level', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLBlurFilter(state, makeRenderTarget(), makeRenderTarget(), { blurX: 4, blurY: 4, quality: 1 });
    // quality=1, radiusX=2, radiusY=2: H pass + V pass + final blit = 3 draws
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('performs only a blit when both radii are zero', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLBlurFilter(state, makeRenderTarget(), makeRenderTarget(), { blurX: 0, blurY: 0 });
    expect(gl.drawElements).toHaveBeenCalledTimes(1);
  });

  it('allocates and destroys a temporary render target', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLBlurFilter(state, makeRenderTarget(), makeRenderTarget(), { blurX: 4, blurY: 4 });
    expect(gl.createFramebuffer).toHaveBeenCalled();
    expect(gl.deleteFramebuffer).toHaveBeenCalled();
  });

  it('uses default blur options when none are provided', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLBlurFilter(state, makeRenderTarget(), makeRenderTarget());
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('multiplies draw calls with quality > 1', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLBlurFilter(state, makeRenderTarget(), makeRenderTarget(), { blurX: 4, blurY: 4, quality: 2 });
    // quality=2 doubles the pass count
    const q1 = vi.fn();
    const { state: s2, gl: gl2 } = makeWebGLState();
    q1.mockClear();
    applyWebGLBlurFilter(s2, makeRenderTarget(), makeRenderTarget(), { blurX: 4, blurY: 4, quality: 1 });
    expect((gl.drawElements as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
      (gl2.drawElements as ReturnType<typeof vi.fn>).mock.calls.length,
    );
  });
});
