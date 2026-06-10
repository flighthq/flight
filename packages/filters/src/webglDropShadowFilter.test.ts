import { describe, expect, it } from 'vitest';

import { makeFilterState as makeWebGLState, makeRenderTarget, makeScratch } from './filterTestHelper';
import { applyWebGLDropShadowFilter } from './webglDropShadowFilter';

describe('applyWebGLDropShadowFilter', () => {
  it('calls drawElements multiple times to composite shadow + source', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLDropShadowFilter(state, makeRenderTarget(), makeRenderTarget(), makeScratch());
    // tint + blur passes + clear + blitOffset(shadow) + blit(source) → several draws
    expect((gl.drawElements as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('does not allocate render targets (uses caller-provided scratch)', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLDropShadowFilter(state, makeRenderTarget(), makeRenderTarget(), makeScratch());
    expect(gl.createFramebuffer).not.toHaveBeenCalled();
    expect(gl.deleteFramebuffer).not.toHaveBeenCalled();
  });

  it('omits the source blit when hideObject is true', () => {
    const { state: s1, gl: gl1 } = makeWebGLState();
    const { state: s2, gl: gl2 } = makeWebGLState();
    applyWebGLDropShadowFilter(s1, makeRenderTarget(), makeRenderTarget(), makeScratch(), { hideObject: false });
    applyWebGLDropShadowFilter(s2, makeRenderTarget(), makeRenderTarget(), makeScratch(), { hideObject: true });
    const normalCount = (gl1.drawElements as ReturnType<typeof vi.fn>).mock.calls.length;
    const hiddenCount = (gl2.drawElements as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(hiddenCount).toBeLessThan(normalCount);
  });

  it('uses default options when none are provided', () => {
    const { state, gl } = makeWebGLState();
    expect(() =>
      applyWebGLDropShadowFilter(state, makeRenderTarget(), makeRenderTarget(), makeScratch()),
    ).not.toThrow();
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('is a no-op when inner is true', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLDropShadowFilter(state, makeRenderTarget(), makeRenderTarget(), makeScratch(), { inner: true });
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('is a no-op when knockout is true', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLDropShadowFilter(state, makeRenderTarget(), makeRenderTarget(), makeScratch(), { knockout: true });
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('produces more composite passes for strength > 1', () => {
    const { state: s1, gl: gl1 } = makeWebGLState();
    const { state: s2, gl: gl2 } = makeWebGLState();
    applyWebGLDropShadowFilter(s1, makeRenderTarget(), makeRenderTarget(), makeScratch(), { strength: 1 });
    applyWebGLDropShadowFilter(s2, makeRenderTarget(), makeRenderTarget(), makeScratch(), { strength: 2 });
    expect((gl2.drawElements as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
      (gl1.drawElements as ReturnType<typeof vi.fn>).mock.calls.length,
    );
  });
});
