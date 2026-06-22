import { computeBlurFilterCss } from './cssBlurFilter';

describe('computeBlurFilterCss', () => {
  it('returns blur(Xpx) for isotropic blur', () => {
    expect(computeBlurFilterCss({ kind: 'BlurFilter', blurX: 4, blurY: 4 })).toBe('blur(4px)');
  });

  it('returns null for anisotropic blur', () => {
    expect(computeBlurFilterCss({ kind: 'BlurFilter', blurX: 4, blurY: 8 })).toBeNull();
  });

  it('returns null for zero blur', () => {
    expect(computeBlurFilterCss({ kind: 'BlurFilter', blurX: 0, blurY: 0 })).toBeNull();
  });

  it('uses default blurX=4 blurY=4', () => {
    expect(computeBlurFilterCss({ kind: 'BlurFilter' })).toBe('blur(4px)');
  });
});
