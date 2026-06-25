import type { BloomEffect, GrayscaleEffect, RenderEffect, ToneMapEffect, VignetteEffect } from '@flighthq/types';

import { createBloomEffect } from './bloomEffect';
import { createGrayscaleEffect } from './grayscaleEffect';
import { getRenderEffectDefaults, normalizeRenderEffect } from './renderEffectDefaults';
import { createToneMapEffect } from './toneMapEffect';
import { createVignetteEffect } from './vignetteEffect';

describe('getRenderEffectDefaults', () => {
  it('returns documented defaults for BloomEffect', () => {
    const d = getRenderEffectDefaults('BloomEffect');
    expect(d.brightness).toBe(1);
    expect(d.threshold).toBe(0.8);
    expect(d.thresholdKnee).toBe(0.5);
    expect(d.radius).toBe(8);
    expect(d.passes).toBe(1);
  });
  it('returns documented defaults for ToneMapEffect', () => {
    const d = getRenderEffectDefaults('ToneMapEffect');
    expect(d.operator).toBe('aces');
    expect(d.exposure).toBe(0);
  });
  it('returns a fresh copy each call (mutations do not persist)', () => {
    const d1 = getRenderEffectDefaults('BloomEffect');
    const d2 = getRenderEffectDefaults('BloomEffect');
    d1.threshold = 99;
    expect(d2.threshold).toBe(0.8);
  });
  it('returns empty object for unknown kind', () => {
    expect(getRenderEffectDefaults('acme.UnknownEffect')).toEqual({});
  });
});

describe('normalizeRenderEffect', () => {
  it('fills in missing fields from defaults', () => {
    const effect = createBloomEffect({ threshold: 0.9 });
    const out = { kind: 'BloomEffect' } as BloomEffect;
    const ok = normalizeRenderEffect(effect, out);
    expect(ok).toBe(true);
    expect(out.threshold).toBe(0.9); // preserved
    expect((out as unknown as Record<string, unknown>).brightness).toBe(1); // filled from defaults
    expect(out.radius).toBe(8); // filled from defaults
  });
  it('preserves explicitly set zero and false', () => {
    const effect = createGrayscaleEffect({ intensity: 0 });
    const out = { kind: 'GrayscaleEffect' } as GrayscaleEffect;
    normalizeRenderEffect(effect, out);
    expect(out.intensity).toBe(0); // 0 is explicit, should not be replaced by default 1
  });
  it('carries over fields not in the defaults table', () => {
    const effect = createVignetteEffect({ intensity: 0.3 });
    const out = { kind: 'VignetteEffect' } as VignetteEffect;
    normalizeRenderEffect(effect, out);
    expect(out.intensity).toBe(0.3);
    expect(out.radius).toBe(1);
    expect(out.softness).toBe(0.5);
  });
  it('returns false for unknown kind', () => {
    const effect = { kind: 'acme.UnknownEffect' } as RenderEffect;
    const out = { kind: 'acme.UnknownEffect' } as RenderEffect;
    expect(normalizeRenderEffect(effect, out)).toBe(false);
  });
  it('is alias-safe when out === effect', () => {
    const effect = createToneMapEffect({ exposure: 1 }) as ToneMapEffect;
    const ok = normalizeRenderEffect(effect, effect);
    expect(ok).toBe(true);
    expect(effect.exposure).toBe(1);
    expect(effect.operator).toBe('aces');
  });
});
