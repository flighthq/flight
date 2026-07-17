import { ModifierSlot } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { isBuiltInModifierSlot } from './isBuiltInModifierSlot';

describe('isBuiltInModifierSlot', () => {
  it('accepts every built-in slot name', () => {
    expect(isBuiltInModifierSlot(ModifierSlot.Diffuse)).toBe(true);
    expect(isBuiltInModifierSlot(ModifierSlot.Specular)).toBe(true);
    expect(isBuiltInModifierSlot(ModifierSlot.Normal)).toBe(true);
    expect(isBuiltInModifierSlot(ModifierSlot.Emissive)).toBe(true);
    expect(isBuiltInModifierSlot(ModifierSlot.Effect)).toBe(true);
  });

  it('rejects reserved and vendor-prefixed slots', () => {
    expect(isBuiltInModifierSlot('Ambient')).toBe(false);
    expect(isBuiltInModifierSlot('Shadow')).toBe(false);
    expect(isBuiltInModifierSlot('acme.Weird')).toBe(false);
  });

  it('rejects arbitrary strings', () => {
    expect(isBuiltInModifierSlot('')).toBe(false);
    expect(isBuiltInModifierSlot('diffuse')).toBe(false);
  });
});
