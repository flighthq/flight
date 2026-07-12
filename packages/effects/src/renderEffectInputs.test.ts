import { createBloomEffect } from './bloomEffect';
import { createBokehDepthOfFieldEffect } from './bokehDepthOfFieldEffect';
import { createColorGradeEffect } from './colorGradeEffect';
import { getRenderEffectInputs, getRenderEffectKinds, RENDER_EFFECT_KINDS } from './renderEffectInputs';
import { createSsaoEffect } from './ssaoEffect';
import { createTaaEffect } from './taaEffect';
import { createToneMapEffect } from './toneMapEffect';

describe('getRenderEffectInputs', () => {
  it('returns Hdr for BloomEffect', () => {
    expect(getRenderEffectInputs(createBloomEffect())).toEqual(['Hdr']);
  });

  it('returns Hdr for ToneMapEffect', () => {
    expect(getRenderEffectInputs(createToneMapEffect())).toEqual(['Hdr']);
  });

  it('returns Depth for SsaoEffect', () => {
    expect(getRenderEffectInputs(createSsaoEffect())).toEqual(['Depth']);
  });

  it('returns Depth for BokehDepthOfFieldEffect', () => {
    expect(getRenderEffectInputs(createBokehDepthOfFieldEffect())).toEqual(['Depth']);
  });

  it('returns Temporal for TaaEffect', () => {
    expect(getRenderEffectInputs(createTaaEffect())).toEqual(['Temporal']);
  });

  it('returns empty array for effects that need only the color buffer', () => {
    expect(getRenderEffectInputs(createColorGradeEffect())).toEqual([]);
  });

  it('returns empty array for unknown kind', () => {
    expect(getRenderEffectInputs({ kind: 'acme.UnknownEffect' } as never)).toEqual([]);
  });
});

describe('getRenderEffectKinds', () => {
  it('returns an array containing known effect kinds', () => {
    const kinds = getRenderEffectKinds();
    expect(kinds).toContain('BloomEffect');
    expect(kinds).toContain('ToneMapEffect');
    expect(kinds).toContain('SsaoEffect');
    expect(kinds).toContain('ColorGradeEffect');
  });

  it('returns the same reference as RENDER_EFFECT_KINDS', () => {
    expect(getRenderEffectKinds()).toBe(RENDER_EFFECT_KINDS);
  });

  it('kinds are in alphabetical order', () => {
    const kinds = getRenderEffectKinds();
    for (let i = 1; i < kinds.length; i++) {
      expect(kinds[i - 1].localeCompare(kinds[i])).toBeLessThan(0);
    }
  });
});
