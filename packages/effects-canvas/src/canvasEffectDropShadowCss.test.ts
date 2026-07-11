import { computeDropShadowEffectCss, computeOuterGlowEffectCss } from './canvasEffectDropShadowCss';

describe('computeDropShadowEffectCss', () => {
  it('is a function', () => {
    expect(typeof computeDropShadowEffectCss).toBe('function');
  });

  it('emits the default drop-shadow string', () => {
    expect(computeDropShadowEffectCss({ kind: 'DropShadowEffect' })).toBe('drop-shadow(3px 3px 4px rgba(0,0,0,1.000))');
  });
});

describe('computeOuterGlowEffectCss', () => {
  it('is a function', () => {
    expect(typeof computeOuterGlowEffectCss).toBe('function');
  });

  it('emits the default outer-glow string', () => {
    expect(computeOuterGlowEffectCss({ kind: 'OuterGlowEffect' })).toBe('drop-shadow(0px 0px 6px rgba(255,0,0,1.000))');
  });
});
