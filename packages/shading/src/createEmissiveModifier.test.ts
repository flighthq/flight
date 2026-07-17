import type { Texture } from '@flighthq/types';
import { EmissiveModifierFacing, EmissiveModifierKind, ModifierSlot } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createEmissiveModifier } from './createEmissiveModifier';

describe('createEmissiveModifier', () => {
  it('sets the kind and Emissive slot', () => {
    const modifier = createEmissiveModifier({ color: 0xffaa00ff });
    expect(modifier.kind).toBe(EmissiveModifierKind);
    expect(modifier.slot).toBe(ModifierSlot.Emissive);
  });

  it('carries the packed RGBA color through', () => {
    const modifier = createEmissiveModifier({ color: 0x1234abff });
    expect(modifier.color).toBe(0x1234abff);
  });

  it('defaults strength to 1, facing to Ignore, softness to 0, and leaves the mask absent', () => {
    const modifier = createEmissiveModifier({ color: 0xffffffff });
    expect(modifier.strength).toBe(1);
    expect(modifier.facing).toBe(EmissiveModifierFacing.Ignore);
    expect(modifier.facingSoftness).toBe(0);
    expect(modifier.mask).toBeUndefined();
  });

  it('applies provided scalars and a facing gate', () => {
    const modifier = createEmissiveModifier({
      color: 0xffffffff,
      strength: 4,
      facing: EmissiveModifierFacing.AwayFromLight,
      facingSoftness: 0.25,
    });
    expect(modifier.strength).toBe(4);
    expect(modifier.facing).toBe(EmissiveModifierFacing.AwayFromLight);
    expect(modifier.facingSoftness).toBe(0.25);
  });

  it('keeps the mask by reference when provided', () => {
    const mask = {} as Texture;
    const modifier = createEmissiveModifier({ color: 0xffffffff, mask });
    expect(modifier.mask).toBe(mask);
  });
});
