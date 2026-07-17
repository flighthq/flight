import type { Texture } from '@flighthq/types';
import { EmissiveModifierFacing } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createAnimatedNormalModifier } from './createAnimatedNormalModifier';
import { createEmissiveModifier } from './createEmissiveModifier';
import { createRimModifier } from './createRimModifier';
import { getModifierDefineKey } from './getModifierDefineKey';
import { createModifierRegistry } from './modifierRegistry';
import { registerBuiltInModifiers } from './registerBuiltInModifiers';

describe('getModifierDefineKey', () => {
  const registry = createModifierRegistry();
  registerBuiltInModifiers(registry);

  it('returns the empty string for an empty stack', () => {
    expect(getModifierDefineKey([], registry)).toBe('');
  });

  it('joins slot-ordered kinds with the plus separator', () => {
    const normal = createAnimatedNormalModifier({ map: {} as Texture, scroll: { x: 0, y: 0 } });
    const emissive = createEmissiveModifier({ color: 0xffffffff });
    const rim = createRimModifier({ color: 0xffffffff });
    const key = getModifierDefineKey([rim, emissive, normal], registry);
    expect(key).toBe('AnimatedNormalModifier:1+EmissiveModifier+RimModifier');
  });

  it('is stable regardless of cross-slot authoring order', () => {
    const normal = createAnimatedNormalModifier({ map: {} as Texture, scroll: { x: 0, y: 0 } });
    const rim = createRimModifier({ color: 0xffffffff });
    expect(getModifierDefineKey([normal, rim], registry)).toBe(getModifierDefineKey([rim, normal], registry));
  });

  it('captures compile-time variants but not uniform-fed scalars', () => {
    const plain = createEmissiveModifier({ color: 0xffffffff });
    const strongerButSameProgram = createEmissiveModifier({ color: 0x00ff00ff, strength: 9 });
    const masked = createEmissiveModifier({ color: 0xffffffff, mask: {} as Texture });
    const gated = createEmissiveModifier({ color: 0xffffffff, facing: EmissiveModifierFacing.AwayFromLight });
    const maskedAndGated = createEmissiveModifier({
      color: 0xffffffff,
      mask: {} as Texture,
      facing: EmissiveModifierFacing.TowardLight,
    });
    expect(getModifierDefineKey([plain], registry)).toBe('EmissiveModifier');
    expect(getModifierDefineKey([strongerButSameProgram], registry)).toBe('EmissiveModifier');
    expect(getModifierDefineKey([masked], registry)).toBe('EmissiveModifier:m');
    expect(getModifierDefineKey([gated], registry)).toBe('EmissiveModifier:g');
    expect(getModifierDefineKey([maskedAndGated], registry)).toBe('EmissiveModifier:mg');
  });

  it('distinguishes single, dual, and disabled animated-normal variants', () => {
    const disabled = createAnimatedNormalModifier({ map: null, scroll: { x: 0, y: 0 } });
    const single = createAnimatedNormalModifier({ map: {} as Texture, scroll: { x: 0, y: 0 } });
    const dual = createAnimatedNormalModifier({
      map: {} as Texture,
      scroll: { x: 0, y: 0 },
      secondaryMap: {} as Texture,
    });
    expect(getModifierDefineKey([disabled], registry)).toBe('AnimatedNormalModifier:0');
    expect(getModifierDefineKey([single], registry)).toBe('AnimatedNormalModifier:1');
    expect(getModifierDefineKey([dual], registry)).toBe('AnimatedNormalModifier:2');
  });

  it('falls back to bare kinds without a registry', () => {
    const masked = createEmissiveModifier({ color: 0xffffffff, mask: {} as Texture });
    expect(getModifierDefineKey([masked])).toBe('EmissiveModifier');
  });

  it('reflects per-slot count and order in the key', () => {
    const rimA = createRimModifier({ color: 0x111111ff });
    const rimB = createRimModifier({ color: 0x222222ff });
    expect(getModifierDefineKey([rimA, rimB], registry)).toBe('RimModifier+RimModifier');
  });
});
