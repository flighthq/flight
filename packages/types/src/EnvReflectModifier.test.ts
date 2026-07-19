import { EnvReflectModifierKind } from './EnvReflectModifier';
import type { EnvReflectModifier } from './EnvReflectModifier';
import type { Modifier } from './Modifier';

describe('EnvReflectModifier', () => {
  describe('EnvReflectModifierKind', () => {
    it('is the canonical PascalCase type name', () => {
      expect(EnvReflectModifierKind).toBe('EnvReflectModifier');
    });
  });

  describe('descriptor shape', () => {
    it('is assignable to the open Modifier base with slot Effect', () => {
      const chrome: EnvReflectModifier = {
        kind: 'EnvReflectModifier',
        slot: 'Effect',
        tint: 0xffffffff,
        intensity: 0.8,
        fresnelBias: 0.04,
        roughness: 0,
      };
      const base: Modifier = chrome;
      expect(base.slot).toBe('Effect');
      expect(chrome.intensity).toBe(0.8);
    });
  });
});
