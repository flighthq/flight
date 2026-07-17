import { ModifierSlot } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { isModifierSlot } from './isModifierSlot';

describe('isModifierSlot', () => {
  it('accepts every built-in slot name', () => {
    expect(isModifierSlot(ModifierSlot.Diffuse)).toBe(true);
    expect(isModifierSlot(ModifierSlot.Specular)).toBe(true);
    expect(isModifierSlot(ModifierSlot.Normal)).toBe(true);
    expect(isModifierSlot(ModifierSlot.Emissive)).toBe(true);
    expect(isModifierSlot(ModifierSlot.Effect)).toBe(true);
  });

  it('rejects reserved and vendor-prefixed slots', () => {
    expect(isModifierSlot('Ambient')).toBe(false);
    expect(isModifierSlot('Shadow')).toBe(false);
    expect(isModifierSlot('acme.Weird')).toBe(false);
  });

  it('rejects arbitrary strings', () => {
    expect(isModifierSlot('')).toBe(false);
    expect(isModifierSlot('diffuse')).toBe(false);
  });
});
