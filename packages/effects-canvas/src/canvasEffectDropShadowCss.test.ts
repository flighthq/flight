import { createDropShadowEffect, createOuterGlowEffect } from '@flighthq/effects/contract';

import { computeDropShadowEffectCss, computeOuterGlowEffectCss } from './canvasEffectDropShadowCss';

describe('computeDropShadowEffectCss', () => {
  it('is a function', () => {
    expect(typeof computeDropShadowEffectCss).toBe('function');
  });

  it('emits the default drop-shadow string', () => {
    expect(computeDropShadowEffectCss(createDropShadowEffect())).toBe('drop-shadow(3px 3px 4px rgba(0,0,0,1.000))');
  });

  it('returns null for hide because CSS drop-shadow includes the source object', () => {
    expect(computeDropShadowEffectCss(createDropShadowEffect({ sourceMode: 'hide' }))).toBeNull();
  });

  it('returns null for knockout because CSS drop-shadow includes the source object', () => {
    expect(computeDropShadowEffectCss(createDropShadowEffect({ sourceMode: 'knockout' }))).toBeNull();
  });
});

// The channel order and the alpha fold are the migration. Under the 24-bit reading this path used to
// carry, 0x9d55ffff keeps its low three bytes and emits rgba(85,255,255,...) — a different color that
// still looks deliberate, which is the exact 0x44ffee failure shape this unification exists to remove.
it('reads the color as packed RGBA and multiplies its alpha into the separate alpha field', () => {
  expect(computeDropShadowEffectCss(createDropShadowEffect({ alpha: 0.5, color: 0x9d55ff80 }))).toBe(
    'drop-shadow(3px 3px 4px rgba(157,85,255,0.251))',
  );
});

it('defaults to opaque black, the same shadow the pre-migration default produced', () => {
  expect(computeDropShadowEffectCss(createDropShadowEffect())).toBe('drop-shadow(3px 3px 4px rgba(0,0,0,1.000))');
});

describe('computeOuterGlowEffectCss', () => {
  it('is a function', () => {
    expect(typeof computeOuterGlowEffectCss).toBe('function');
  });

  it('emits the default outer-glow string', () => {
    expect(computeOuterGlowEffectCss(createOuterGlowEffect())).toBe('drop-shadow(0px 0px 6px rgba(255,0,0,1.000))');
  });

  it('returns null for non-draw source modes', () => {
    expect(computeOuterGlowEffectCss(createOuterGlowEffect({ sourceMode: 'hide' }))).toBeNull();
    expect(computeOuterGlowEffectCss(createOuterGlowEffect({ sourceMode: 'knockout' }))).toBeNull();
  });
});
