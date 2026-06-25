import { getWgpuFilterScratchCount } from './wgpuFilterScratch';

describe('getWgpuFilterScratchCount', () => {
  it('returns 0 for single-pass filters that need no scratch', () => {
    expect(getWgpuFilterScratchCount({ kind: 'ColorMatrixFilter' })).toBe(0);
    expect(getWgpuFilterScratchCount({ kind: 'ConvolutionFilter' })).toBe(0);
    expect(getWgpuFilterScratchCount({ kind: 'DisplacementMapFilter' })).toBe(0);
    expect(getWgpuFilterScratchCount({ kind: 'MedianFilter' })).toBe(0);
    expect(getWgpuFilterScratchCount({ kind: 'PixelateFilter' })).toBe(0);
  });

  it('returns 1 for BlurFilter (one ping-pong temp target)', () => {
    expect(getWgpuFilterScratchCount({ kind: 'BlurFilter' })).toBe(1);
  });

  it('returns 2 for SharpenFilter (blurred copy + blur ping-pong)', () => {
    expect(getWgpuFilterScratchCount({ kind: 'SharpenFilter' })).toBe(2);
  });

  it('returns 3 for blur-derived effects (tint/mask, blurred output, blur ping-pong)', () => {
    expect(getWgpuFilterScratchCount({ kind: 'BevelFilter' })).toBe(3);
    expect(getWgpuFilterScratchCount({ kind: 'DropShadowFilter' })).toBe(3);
    expect(getWgpuFilterScratchCount({ kind: 'GradientBevelFilter' })).toBe(3);
    expect(getWgpuFilterScratchCount({ kind: 'GradientGlowFilter' })).toBe(3);
    expect(getWgpuFilterScratchCount({ kind: 'InnerGlowFilter' })).toBe(3);
    expect(getWgpuFilterScratchCount({ kind: 'InnerShadowFilter' })).toBe(3);
    expect(getWgpuFilterScratchCount({ kind: 'OuterGlowFilter' })).toBe(3);
  });

  it('returns 0 for unknown kinds', () => {
    expect(getWgpuFilterScratchCount({ kind: 'acme.CustomFilter' })).toBe(0);
  });
});
