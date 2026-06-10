import { describe, expect, it } from 'vitest';

import { makeFilterState as makeWebGLState, makeRenderTarget, makeScratch } from './filterTestHelper';
import { applyWebGLGlowFilter } from './webglGlowFilter';

describe('applyWebGLGlowFilter', () => {
  it('calls drawElements multiple times to composite glow + source', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLGlowFilter(state, makeRenderTarget(), makeRenderTarget(), makeScratch());
    expect((gl.drawElements as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('does not allocate render targets (uses caller-provided scratch)', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLGlowFilter(state, makeRenderTarget(), makeRenderTarget(), makeScratch());
    expect(gl.createFramebuffer).not.toHaveBeenCalled();
    expect(gl.deleteFramebuffer).not.toHaveBeenCalled();
  });

  it('omits the source blit in knockout mode', () => {
    const { state: s1, gl: gl1 } = makeWebGLState();
    const { state: s2, gl: gl2 } = makeWebGLState();
    applyWebGLGlowFilter(s1, makeRenderTarget(), makeRenderTarget(), makeScratch(), { knockout: false });
    applyWebGLGlowFilter(s2, makeRenderTarget(), makeRenderTarget(), makeScratch(), { knockout: true });
    const normalCount = (gl1.drawElements as ReturnType<typeof vi.fn>).mock.calls.length;
    const knockoutCount = (gl2.drawElements as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(knockoutCount).toBeLessThan(normalCount);
  });

  it('uses default options when none are provided', () => {
    const { state } = makeWebGLState();
    expect(() => applyWebGLGlowFilter(state, makeRenderTarget(), makeRenderTarget(), makeScratch())).not.toThrow();
  });

  it('is a no-op when inner is true', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLGlowFilter(state, makeRenderTarget(), makeRenderTarget(), makeScratch(), { inner: true });
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('produces more composite passes for strength > 1', () => {
    const { state: s1, gl: gl1 } = makeWebGLState();
    const { state: s2, gl: gl2 } = makeWebGLState();
    applyWebGLGlowFilter(s1, makeRenderTarget(), makeRenderTarget(), makeScratch(), { strength: 1 });
    applyWebGLGlowFilter(s2, makeRenderTarget(), makeRenderTarget(), makeScratch(), { strength: 2 });
    expect((gl2.drawElements as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
      (gl1.drawElements as ReturnType<typeof vi.fn>).mock.calls.length,
    );
  });
});
