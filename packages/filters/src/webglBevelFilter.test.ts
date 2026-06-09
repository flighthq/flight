import { describe, expect, it } from 'vitest';

import { makeFilterState as makeWebGLState, makeRenderTarget } from './filterTestHelper';
import { applyWebGLBevelFilter } from './webglBevelFilter';

describe('applyWebGLBevelFilter', () => {
  it('calls drawElements multiple times for shadow, highlight, and source', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLBevelFilter(state, makeRenderTarget(), makeRenderTarget());
    // tint + blur + clear + shadow tint + shadow blit + highlight tint + highlight blit + source blit
    expect((gl.drawElements as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('allocates and destroys internal render targets', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLBevelFilter(state, makeRenderTarget(), makeRenderTarget());
    expect(gl.createFramebuffer).toHaveBeenCalled();
    expect(gl.deleteFramebuffer).toHaveBeenCalled();
  });

  it('omits the source blit in knockout mode', () => {
    const { state: s1, gl: gl1 } = makeWebGLState();
    const { state: s2, gl: gl2 } = makeWebGLState();
    applyWebGLBevelFilter(s1, makeRenderTarget(), makeRenderTarget(), { knockout: false });
    applyWebGLBevelFilter(s2, makeRenderTarget(), makeRenderTarget(), { knockout: true });
    const normalCount = (gl1.drawElements as ReturnType<typeof vi.fn>).mock.calls.length;
    const knockoutCount = (gl2.drawElements as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(knockoutCount).toBeLessThan(normalCount);
  });

  it('uses default options when none are provided', () => {
    const { state } = makeWebGLState();
    expect(() => applyWebGLBevelFilter(state, makeRenderTarget(), makeRenderTarget())).not.toThrow();
  });
});
