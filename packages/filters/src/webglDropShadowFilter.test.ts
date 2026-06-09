import { describe, expect, it } from 'vitest';

import { makeFilterState as makeWebGLState, makeRenderTarget } from './filterTestHelper';
import { applyWebGLDropShadowFilter } from './webglDropShadowFilter';

describe('applyWebGLDropShadowFilter', () => {
  it('calls drawElements multiple times to composite shadow + source', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLDropShadowFilter(state, makeRenderTarget(), makeRenderTarget());
    // tint + blur passes + clear + blitOffset(shadow) + blit(source) → several draws
    expect((gl.drawElements as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('allocates and destroys internal render targets', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLDropShadowFilter(state, makeRenderTarget(), makeRenderTarget());
    expect(gl.createFramebuffer).toHaveBeenCalled();
    expect(gl.deleteFramebuffer).toHaveBeenCalled();
  });

  it('omits the source blit when hideObject is true', () => {
    const { state: s1, gl: gl1 } = makeWebGLState();
    const { state: s2, gl: gl2 } = makeWebGLState();
    applyWebGLDropShadowFilter(s1, makeRenderTarget(), makeRenderTarget(), { hideObject: false });
    applyWebGLDropShadowFilter(s2, makeRenderTarget(), makeRenderTarget(), { hideObject: true });
    const normalCount = (gl1.drawElements as ReturnType<typeof vi.fn>).mock.calls.length;
    const hiddenCount = (gl2.drawElements as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(hiddenCount).toBeLessThan(normalCount);
  });

  it('uses default options when none are provided', () => {
    const { state, gl } = makeWebGLState();
    expect(() => applyWebGLDropShadowFilter(state, makeRenderTarget(), makeRenderTarget())).not.toThrow();
    expect(gl.drawElements).toHaveBeenCalled();
  });
});
