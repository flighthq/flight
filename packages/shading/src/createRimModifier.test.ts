import { ModifierSlot, RimModifierKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createRimModifier, initializeRimModifier } from './createRimModifier';

describe('createRimModifier', () => {
  it('sets the kind and Effect slot', () => {
    const modifier = createRimModifier({ color: 0x88ccffff });
    expect(modifier.kind).toBe(RimModifierKind);
    expect(modifier.slot).toBe(ModifierSlot.Effect);
  });

  it('carries the packed RGBA color through', () => {
    const modifier = createRimModifier({ color: 0x010203ff });
    expect(modifier.color).toBe(0x010203ff);
  });

  it('defaults power to 3, intensity to 1, bias to 0', () => {
    const modifier = createRimModifier({ color: 0xffffffff });
    expect(modifier.power).toBe(3);
    expect(modifier.intensity).toBe(1);
    expect(modifier.bias).toBe(0);
  });

  it('applies provided falloff scalars', () => {
    const modifier = createRimModifier({ color: 0xffffffff, power: 5, intensity: 2, bias: 0.1 });
    expect(modifier.power).toBe(5);
    expect(modifier.intensity).toBe(2);
    expect(modifier.bias).toBe(0.1);
  });
});
describe('initializeRimModifier', () => {
  it('is the construction initializer of createRimModifier', () => {
    expect(typeof initializeRimModifier).toBe('function');
  });
});
