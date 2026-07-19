import { EnvReflectModifierKind, ModifierSlot } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createEnvReflectModifier } from './createEnvReflectModifier';

describe('createEnvReflectModifier', () => {
  it('sets the kind and Effect slot', () => {
    const modifier = createEnvReflectModifier();
    expect(modifier.kind).toBe(EnvReflectModifierKind);
    expect(modifier.slot).toBe(ModifierSlot.Effect);
  });

  it('defaults to a mirror-sharp opaque-white dielectric reflection', () => {
    const modifier = createEnvReflectModifier();
    expect(modifier.tint).toBe(0xffffffff);
    expect(modifier.intensity).toBe(1);
    expect(modifier.fresnelBias).toBe(0.04);
    expect(modifier.roughness).toBe(0);
  });

  it('applies provided scalars', () => {
    const modifier = createEnvReflectModifier({ tint: 0x88ccffff, intensity: 0.5, fresnelBias: 0.1, roughness: 0.6 });
    expect(modifier.tint).toBe(0x88ccffff);
    expect(modifier.intensity).toBe(0.5);
    expect(modifier.fresnelBias).toBe(0.1);
    expect(modifier.roughness).toBe(0.6);
  });
});
