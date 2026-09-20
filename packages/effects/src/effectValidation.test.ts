import { createBloomEffect } from './bloomEffect';
import { validateEffectList } from './effectValidation';
import { createSsaoEffect } from './ssaoEffect';
import { createToneMapEffect } from './toneMapEffect';
import { createVignetteEffect } from './vignetteEffect';

describe('validateEffectList', () => {
  it('returns null when all required inputs are available', () => {
    const effects = [createBloomEffect(), createSsaoEffect()];
    expect(validateEffectList(effects, ['Hdr', 'Depth'])).toBeNull();
  });

  it('returns null for effects that need only the color buffer', () => {
    const effects = [createVignetteEffect()];
    expect(validateEffectList(effects, [])).toBeNull();
  });

  it('returns the missing input when Hdr is required but unavailable', () => {
    const effects = [createToneMapEffect()];
    expect(validateEffectList(effects, [])).toBe('Hdr');
  });

  it('returns the missing input when Depth is required but unavailable', () => {
    const effects = [createSsaoEffect()];
    expect(validateEffectList(effects, ['Hdr'])).toBe('Depth');
  });

  it('returns null for an empty effect list', () => {
    expect(validateEffectList([], [])).toBeNull();
  });

  it('returns the first missing input in order', () => {
    const effects = [createBloomEffect(), createSsaoEffect()];
    // Only Hdr available — Bloom ok, Ssao fails.
    expect(validateEffectList(effects, ['Hdr'])).toBe('Depth');
  });
});
