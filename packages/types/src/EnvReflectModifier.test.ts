import { EntityRuntimeKey } from './Entity.ts';
import { EnvReflectModifierKind } from './EnvReflectModifier.ts';
import type { EnvReflectModifier } from './EnvReflectModifier.ts';
import type { Modifier } from './Modifier.ts';

describe('EnvReflectModifier', () => {
  describe('EnvReflectModifierKind', () => {
    it('is the canonical PascalCase type name', () => {
      expect(EnvReflectModifierKind).toBe('EnvReflectModifier');
    });
  });

  describe('descriptor shape', () => {
    it('is assignable to the open Modifier base with slot Effect', () => {
      const chrome: EnvReflectModifier = {
        [EntityRuntimeKey]: undefined,
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
