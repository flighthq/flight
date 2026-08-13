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

// The channel order and the alpha fold are the migration. Under the 24-bit reading this path used to
// carry, 0x9d55ffff keeps its low three bytes and emits rgba(85,255,255,...) — a different color that
// still looks deliberate, which is the exact 0x44ffee failure shape this unification exists to remove.
it('reads the color as packed RGBA and multiplies its alpha into the separate alpha field', () => {
  expect(computeDropShadowEffectCss({ alpha: 0.5, color: 0x9d55ff80, kind: 'DropShadowEffect' })).toBe(
    'drop-shadow(3px 3px 4px rgba(157,85,255,0.251))',
  );
});

it('defaults to opaque black, the same shadow the pre-migration default produced', () => {
  expect(computeDropShadowEffectCss({ kind: 'DropShadowEffect' })).toBe('drop-shadow(3px 3px 4px rgba(0,0,0,1.000))');
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
