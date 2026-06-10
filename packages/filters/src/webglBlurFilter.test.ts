import { describe, expect, it } from 'vitest';

import { makeFilterState as makeWebGLState, makeRenderTarget } from './filterTestHelper';
import { applyWebGLBlurFilter, boxRadiusForSigma } from './webglBlurFilter';

describe('applyWebGLBlurFilter', () => {
  it('calls drawElements for both H and V passes with a single quality level', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLBlurFilter(state, makeRenderTarget(), makeRenderTarget(), makeRenderTarget(), {
      blurX: 4,
      blurY: 4,
      quality: 1,
    });
    // quality=1: one H pass + one V pass + final blit
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('performs only a blit when both radii are zero', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLBlurFilter(state, makeRenderTarget(), makeRenderTarget(), makeRenderTarget(), { blurX: 0, blurY: 0 });
    expect(gl.drawElements).toHaveBeenCalledTimes(1);
  });

  it('does not allocate a render target (uses the caller-provided temp)', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLBlurFilter(state, makeRenderTarget(), makeRenderTarget(), makeRenderTarget(), { blurX: 4, blurY: 4 });
    expect(gl.createFramebuffer).not.toHaveBeenCalled();
    expect(gl.deleteFramebuffer).not.toHaveBeenCalled();
  });

  it('uses default blur options when none are provided', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLBlurFilter(state, makeRenderTarget(), makeRenderTarget(), makeRenderTarget());
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('multiplies draw calls with quality > 1', () => {
    const { state, gl } = makeWebGLState();
    applyWebGLBlurFilter(state, makeRenderTarget(), makeRenderTarget(), makeRenderTarget(), {
      blurX: 4,
      blurY: 4,
      quality: 2,
    });
    const { state: s2, gl: gl2 } = makeWebGLState();
    applyWebGLBlurFilter(s2, makeRenderTarget(), makeRenderTarget(), makeRenderTarget(), {
      blurX: 4,
      blurY: 4,
      quality: 1,
    });
    expect((gl.drawElements as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
      (gl2.drawElements as ReturnType<typeof vi.fn>).mock.calls.length,
    );
  });
});

describe('boxRadiusForSigma', () => {
  it('returns 0 for non-positive sigma', () => {
    expect(boxRadiusForSigma(0, 1)).toBe(0);
    expect(boxRadiusForSigma(-5, 1)).toBe(0);
  });

  it('produces a radius whose passes-fold box variance approximates sigma squared', () => {
    const sigma = 8;
    const passes = 3;
    const r = boxRadiusForSigma(sigma, passes);
    const effectiveSigma = Math.sqrt(passes * ((r * r + r) / 3));
    // The variance-matched box should land within ~1px sigma of the target Gaussian.
    expect(Math.abs(effectiveSigma - sigma)).toBeLessThan(1);
  });

  it('uses a smaller per-pass radius as the pass count increases', () => {
    expect(boxRadiusForSigma(8, 3)).toBeLessThan(boxRadiusForSigma(8, 1));
  });

  it('increases monotonically with sigma', () => {
    expect(boxRadiusForSigma(2, 1)).toBeLessThan(boxRadiusForSigma(8, 1));
  });
});
