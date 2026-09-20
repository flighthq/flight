import { allocateEntity, finishEntity } from '@flighthq/entity/contract';

import { createBloomEffect } from './bloomEffect';
import { createBokehDepthOfFieldEffect } from './bokehDepthOfFieldEffect';
import { getEffectInputs, getEffectKinds, EFFECT_KINDS } from './effectInputs';
import { createSsaoEffect } from './ssaoEffect';
import { createTaaEffect } from './taaEffect';
import { createToneMapEffect } from './toneMapEffect';
import { createVignetteEffect } from './vignetteEffect';

describe('getEffectInputs', () => {
  it('returns Hdr for BloomEffect', () => {
    expect(getEffectInputs(createBloomEffect())).toEqual(['Hdr']);
  });

  it('returns Hdr for ToneMapEffect', () => {
    expect(getEffectInputs(createToneMapEffect())).toEqual(['Hdr']);
  });

  it('returns Depth for SsaoEffect', () => {
    expect(getEffectInputs(createSsaoEffect())).toEqual(['Depth']);
  });

  it('returns Depth for BokehDepthOfFieldEffect', () => {
    expect(getEffectInputs(createBokehDepthOfFieldEffect())).toEqual(['Depth']);
  });

  it('returns Temporal for TaaEffect', () => {
    expect(getEffectInputs(createTaaEffect())).toEqual(['Temporal']);
  });

  it('returns empty array for effects that need only the color buffer', () => {
    expect(getEffectInputs(createVignetteEffect())).toEqual([]);
  });

  it('returns empty array for unknown kind', () => {
    expect(
      getEffectInputs(
        (() => {
          const out = allocateEntity<any>();
          out.kind = 'acme.UnknownEffect';
          return finishEntity(out) as never;
        })(),
      ),
    ).toEqual([]);
  });
});

describe('getEffectKinds', () => {
  it('returns an array containing known effect kinds', () => {
    const kinds = getEffectKinds();
    expect(kinds).toContain('BloomEffect');
    expect(kinds).toContain('ToneMapEffect');
    expect(kinds).toContain('SsaoEffect');
    expect(kinds).toContain('VignetteEffect');
  });

  it('returns the same reference as EFFECT_KINDS', () => {
    expect(getEffectKinds()).toBe(EFFECT_KINDS);
  });

  it('kinds are in alphabetical order', () => {
    const kinds = getEffectKinds();
    for (let i = 1; i < kinds.length; i++) {
      expect(kinds[i - 1].localeCompare(kinds[i])).toBeLessThan(0);
    }
  });
});
