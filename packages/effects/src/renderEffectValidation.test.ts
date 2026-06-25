import { createBloomEffect } from './bloomEffect';
import { createColorGradeEffect } from './colorGradeEffect';
import { validateRenderEffectList } from './renderEffectValidation';
import { createSsaoEffect } from './ssaoEffect';
import { createToneMapEffect } from './toneMapEffect';

describe('validateRenderEffectList', () => {
  it('returns null when all required inputs are available', () => {
    const effects = [createBloomEffect(), createSsaoEffect()];
    expect(validateRenderEffectList(effects, ['Hdr', 'Depth'])).toBeNull();
  });

  it('returns null for effects that need only the color buffer', () => {
    const effects = [createColorGradeEffect()];
    expect(validateRenderEffectList(effects, [])).toBeNull();
  });

  it('returns the missing input when Hdr is required but unavailable', () => {
    const effects = [createToneMapEffect()];
    expect(validateRenderEffectList(effects, [])).toBe('Hdr');
  });

  it('returns the missing input when Depth is required but unavailable', () => {
    const effects = [createSsaoEffect()];
    expect(validateRenderEffectList(effects, ['Hdr'])).toBe('Depth');
  });

  it('returns null for an empty effect list', () => {
    expect(validateRenderEffectList([], [])).toBeNull();
  });

  it('returns the first missing input in order', () => {
    const effects = [createBloomEffect(), createSsaoEffect()];
    // Only Hdr available — Bloom ok, Ssao fails.
    expect(validateRenderEffectList(effects, ['Hdr'])).toBe('Depth');
  });
});
