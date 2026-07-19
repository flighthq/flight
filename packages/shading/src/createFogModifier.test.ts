import { FogModifierKind, FogModifierMode, ModifierSlot } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createFogModifier } from './createFogModifier';

describe('createFogModifier', () => {
  it('sets the kind and Effect slot', () => {
    const modifier = createFogModifier({ color: 0xaabbccff });
    expect(modifier.kind).toBe(FogModifierKind);
    expect(modifier.slot).toBe(ModifierSlot.Effect);
  });

  it('carries the packed RGBA color through', () => {
    const modifier = createFogModifier({ color: 0x1122ddff });
    expect(modifier.color).toBe(0x1122ddff);
  });

  it('defaults to a linear ramp from 0 to 1 with density 1', () => {
    const modifier = createFogModifier({ color: 0xffffffff });
    expect(modifier.mode).toBe(FogModifierMode.Linear);
    expect(modifier.near).toBe(0);
    expect(modifier.far).toBe(1);
    expect(modifier.density).toBe(1);
  });

  it('applies provided mode and scalars', () => {
    const modifier = createFogModifier({ color: 0xffffffff, mode: FogModifierMode.Exponential2, density: 0.05 });
    expect(modifier.mode).toBe(FogModifierMode.Exponential2);
    expect(modifier.density).toBe(0.05);
  });
});
