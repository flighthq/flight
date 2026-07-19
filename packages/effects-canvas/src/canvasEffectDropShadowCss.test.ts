import { computeDropShadowEffectCss, computeOuterGlowEffectCss } from './canvasEffectDropShadowCss';

describe('computeDropShadowEffectCss', () => {
  it('is a function', () => {
    expect(typeof computeDropShadowEffectCss).toBe('function');
  });

  it('emits the default drop-shadow string', () => {
    expect(computeDropShadowEffectCss({ kind: 'DropShadowEffect' })).toBe('drop-shadow(3px 3px 4px rgba(0,0,0,1.000))');
  });

  it('returns null for hide because CSS drop-shadow includes the source object', () => {
    expect(computeDropShadowEffectCss({ kind: 'DropShadowEffect', sourceMode: 'hide' })).toBeNull();
  });

  it('returns null for knockout because CSS drop-shadow includes the source object', () => {
    expect(computeDropShadowEffectCss({ kind: 'DropShadowEffect', sourceMode: 'knockout' })).toBeNull();
  });
});

describe('computeOuterGlowEffectCss', () => {
  it('is a function', () => {
    expect(typeof computeOuterGlowEffectCss).toBe('function');
  });

  it('emits the default outer-glow string', () => {
    expect(computeOuterGlowEffectCss({ kind: 'OuterGlowEffect' })).toBe('drop-shadow(0px 0px 6px rgba(255,0,0,1.000))');
  });

  it('returns null for non-draw source modes', () => {
    expect(computeOuterGlowEffectCss({ kind: 'OuterGlowEffect', sourceMode: 'hide' })).toBeNull();
    expect(computeOuterGlowEffectCss({ kind: 'OuterGlowEffect', sourceMode: 'knockout' })).toBeNull();
  });
});
