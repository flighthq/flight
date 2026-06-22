import {
  computeBlurFilterCss,
  computeDropShadowFilterCss,
  computeOuterGlowFilterCss,
  getShadowFilterOffset,
} from './css';

describe('computeBlurFilterCss', () => {
  it('returns blur(Xpx) for isotropic blur', () => {
    expect(computeBlurFilterCss({ type: 'blur', blurX: 4, blurY: 4 })).toBe('blur(4px)');
  });

  it('returns null for anisotropic blur', () => {
    expect(computeBlurFilterCss({ type: 'blur', blurX: 4, blurY: 8 })).toBeNull();
  });

  it('returns null for zero blur', () => {
    expect(computeBlurFilterCss({ type: 'blur', blurX: 0, blurY: 0 })).toBeNull();
  });

  it('uses default blurX=4 blurY=4', () => {
    expect(computeBlurFilterCss({ type: 'blur' })).toBe('blur(4px)');
  });
});

describe('computeDropShadowFilterCss', () => {
  it('returns drop-shadow CSS for a basic shadow', () => {
    const result = computeDropShadowFilterCss({
      type: 'dropShadow',
      angle: 0,
      distance: 4,
      blurX: 2,
      blurY: 2,
      color: 0,
      alpha: 1,
    });
    expect(result).toBe('drop-shadow(4px 0px 2px rgba(0,0,0,1.000))');
  });

  it('returns null for anisotropic blur', () => {
    expect(computeDropShadowFilterCss({ type: 'dropShadow', blurX: 2, blurY: 8 })).toBeNull();
  });

  it('returns null when knockout is true', () => {
    expect(computeDropShadowFilterCss({ type: 'dropShadow', knockout: true })).toBeNull();
  });

  it('encodes color correctly', () => {
    const result = computeDropShadowFilterCss({
      type: 'dropShadow',
      angle: 0,
      distance: 0,
      color: 0xff8040,
      alpha: 0.5,
    });
    expect(result).toContain('rgba(255,128,64,0.500)');
  });
});

describe('computeOuterGlowFilterCss', () => {
  it('returns drop-shadow at 0,0 for basic glow', () => {
    const result = computeOuterGlowFilterCss({ type: 'outerGlow', blurX: 6, blurY: 6, color: 0xff0000, alpha: 1 });
    expect(result).toBe('drop-shadow(0px 0px 6px rgba(255,0,0,1.000))');
  });

  it('returns null for anisotropic blur', () => {
    expect(computeOuterGlowFilterCss({ type: 'outerGlow', blurX: 4, blurY: 8 })).toBeNull();
  });

  it('returns null when knockout is true', () => {
    expect(computeOuterGlowFilterCss({ type: 'outerGlow', knockout: true })).toBeNull();
  });

  it('uses default blurX=6 blurY=6', () => {
    const result = computeOuterGlowFilterCss({ type: 'outerGlow' });
    expect(result).toContain('drop-shadow(0px 0px 6px');
  });
});

describe('getShadowFilterOffset', () => {
  it('computes offset for angle 0 (pointing right)', () => {
    const { dx, dy } = getShadowFilterOffset({ type: 'dropShadow', angle: 0, distance: 10 });
    expect(dx).toBe(10);
    expect(dy).toBe(0);
  });

  it('computes offset for angle 90 (pointing down)', () => {
    const { dx, dy } = getShadowFilterOffset({ type: 'dropShadow', angle: 90, distance: 10 });
    expect(dx).toBe(0);
    expect(dy).toBe(10);
  });

  it('uses default angle 45 and distance 4', () => {
    const { dx, dy } = getShadowFilterOffset({ type: 'dropShadow' });
    const expected = Math.round(Math.cos((45 * Math.PI) / 180) * 4);
    expect(dx).toBe(expected);
    expect(dy).toBe(expected);
  });

  it('works with BevelFilter', () => {
    const { dx, dy } = getShadowFilterOffset({ type: 'bevel', angle: 0, distance: 5 });
    expect(dx).toBe(5);
    expect(dy).toBe(0);
  });

  it('works with InnerShadowFilter', () => {
    const { dx, dy } = getShadowFilterOffset({ type: 'innerShadow', angle: 0, distance: 3 });
    expect(dx).toBe(3);
    expect(dy).toBe(0);
  });
});
