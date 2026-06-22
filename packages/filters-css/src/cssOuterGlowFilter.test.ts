import { computeOuterGlowFilterCss } from './cssOuterGlowFilter';

describe('computeOuterGlowFilterCss', () => {
  it('returns drop-shadow at 0,0 for basic glow', () => {
    const result = computeOuterGlowFilterCss({
      kind: 'OuterGlowFilter',
      blurX: 6,
      blurY: 6,
      color: 0xff0000,
      alpha: 1,
    });
    expect(result).toBe('drop-shadow(0px 0px 6px rgba(255,0,0,1.000))');
  });

  it('returns null for anisotropic blur', () => {
    expect(computeOuterGlowFilterCss({ kind: 'OuterGlowFilter', blurX: 4, blurY: 8 })).toBeNull();
  });

  it('returns null when knockout is true', () => {
    expect(computeOuterGlowFilterCss({ kind: 'OuterGlowFilter', knockout: true })).toBeNull();
  });

  it('uses default blurX=6 blurY=6', () => {
    const result = computeOuterGlowFilterCss({ kind: 'OuterGlowFilter' });
    expect(result).toContain('drop-shadow(0px 0px 6px');
  });
});
