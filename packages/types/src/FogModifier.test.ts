import { EntityRuntimeKey } from './Entity.ts';
import { FogModifierKind, FogModifierMode } from './FogModifier.ts';
import type { FogModifier } from './FogModifier.ts';
import type { Modifier } from './Modifier.ts';

describe('FogModifier', () => {
  describe('FogModifierKind', () => {
    it('is the canonical PascalCase type name', () => {
      expect(FogModifierKind).toBe('FogModifier');
    });
  });

  describe('FogModifierMode', () => {
    it('names the distance-to-density curves as canonical PascalCase values', () => {
      expect(FogModifierMode.Linear).toBe('Linear');
      expect(FogModifierMode.Exponential).toBe('Exponential');
      expect(FogModifierMode.Exponential2).toBe('Exponential2');
    });
  });

  describe('descriptor shape', () => {
    it('is assignable to the open Modifier base with slot Effect', () => {
      const haze: FogModifier = {
        [EntityRuntimeKey]: undefined,
        kind: 'FogModifier',
        slot: 'Effect',
        color: 0xaabbccff,
        mode: FogModifierMode.Exponential2,
        density: 0.02,
      };
      const base: Modifier = haze;
      expect(base.slot).toBe('Effect');
      expect(haze.mode).toBe('Exponential2');
    });
  });
});
