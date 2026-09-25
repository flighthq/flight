import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { BloomEffect, Effect, ToneMapEffect, VignetteEffect } from '@flighthq/types/contract';

import { createBloomEffect } from './bloomEffect.ts';
import { getEffectDefaults, normalizeEffect } from './effectDefaults.ts';
import { createToneMapEffect } from './toneMapEffect.ts';
import { createVignetteEffect } from './vignetteEffect.ts';

describe('getEffectDefaults', () => {
  it('returns documented defaults for BloomEffect', () => {
    const d = getEffectDefaults('BloomEffect');
    expect(d.brightness).toBe(1);
    expect(d.threshold).toBe(0.8);
    expect(d.thresholdKnee).toBe(0.5);
    expect(d.radius).toBe(8);
    expect(d.passes).toBe(1);
  });
  it('returns documented defaults for ToneMapEffect', () => {
    const d = getEffectDefaults('ToneMapEffect');
    expect(d.operator).toBe('aces');
    expect(d.exposure).toBe(0);
  });
  it('returns sourceMode draw for composite source-mode effects', () => {
    expect(getEffectDefaults('DropShadowEffect').sourceMode).toBe('draw');
    expect(getEffectDefaults('OuterGlowEffect').sourceMode).toBe('draw');
    expect(getEffectDefaults('InnerGlowEffect').sourceMode).toBe('draw');
    expect(getEffectDefaults('InnerShadowEffect').sourceMode).toBe('draw');
    expect(getEffectDefaults('BevelEffect').sourceMode).toBe('draw');
    expect(getEffectDefaults('GradientGlowEffect').sourceMode).toBe('draw');
    expect(getEffectDefaults('GradientBevelEffect').sourceMode).toBe('draw');
  });
  it('returns a fresh copy each call (mutations do not persist)', () => {
    const d1 = getEffectDefaults('BloomEffect');
    const d2 = getEffectDefaults('BloomEffect');
    d1.threshold = 99;
    expect(d2.threshold).toBe(0.8);
  });
  it('returns empty object for unknown kind', () => {
    expect(getEffectDefaults('acme.UnknownEffect')).toEqual({});
  });
});

describe('normalizeEffect', () => {
  it('fills in missing fields from defaults', () => {
    const effect = createBloomEffect({ threshold: 0.9 });
    const out = (() => {
      const out = allocateEntity<any>();
      out.kind = 'BloomEffect';
      return finishEntity(out) as BloomEffect;
    })();
    const ok = normalizeEffect(effect, out);
    expect(ok).toBe(true);
    expect(out.threshold).toBe(0.9); // preserved
    expect((out as unknown as Record<string, unknown>).brightness).toBe(1); // filled from defaults
    expect(out.radius).toBe(8); // filled from defaults
  });
  it('preserves explicitly set zero and false', () => {
    const effect = createBloomEffect({ threshold: 0 });
    const out = (() => {
      const out = allocateEntity<any>();
      out.kind = 'BloomEffect';
      return finishEntity(out) as BloomEffect;
    })();
    normalizeEffect(effect, out);
    expect(out.threshold).toBe(0); // 0 is explicit, should not be replaced by default 0.8
  });
  it('carries over fields not in the defaults table', () => {
    const effect = createVignetteEffect({ intensity: 0.3 });
    const out = (() => {
      const out = allocateEntity<any>();
      out.kind = 'VignetteEffect';
      return finishEntity(out) as VignetteEffect;
    })();
    normalizeEffect(effect, out);
    expect(out.intensity).toBe(0.3);
    expect(out.radius).toBe(1);
    expect(out.softness).toBe(0.5);
  });
  it('returns false for unknown kind', () => {
    const effect = (() => {
      const e = allocateEntity<any>();
      e.kind = 'acme.UnknownEffect';
      return finishEntity(e) as Effect;
    })();
    const out = (() => {
      const o = allocateEntity<any>();
      o.kind = 'acme.UnknownEffect';
      return finishEntity(o) as Effect;
    })();
    expect(normalizeEffect(effect, out)).toBe(false);
  });
  it('is alias-safe when out === effect', () => {
    const effect = createToneMapEffect({ exposure: 1 }) as ToneMapEffect;
    const ok = normalizeEffect(effect, effect);
    expect(ok).toBe(true);
    expect(effect.exposure).toBe(1);
    expect(effect.operator).toBe('aces');
  });
});
