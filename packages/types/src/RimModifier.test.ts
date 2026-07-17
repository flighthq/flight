import type { Modifier } from './Modifier';
import type { RimModifier } from './RimModifier';
import { RimModifierKind } from './RimModifier';

describe('RimModifier', () => {
  describe('RimModifierKind', () => {
    it('is the canonical PascalCase type name', () => {
      expect(RimModifierKind).toBe('RimModifier');
    });
  });

  describe('descriptor shape', () => {
    it('is assignable to the open Modifier base with slot Effect', () => {
      const atmosphere: RimModifier = {
        kind: 'RimModifier',
        slot: 'Effect',
        color: 0x88bbffff,
        power: 4,
        intensity: 1.5,
      };
      const base: Modifier = atmosphere;
      expect(base.slot).toBe('Effect');
      expect(atmosphere.color).toBe(0x88bbffff);
    });

    it('allows the falloff params to be omitted (defaults live in the constructor)', () => {
      const minimal: RimModifier = { kind: 'RimModifier', slot: 'Effect', color: 0xffffffff };
      expect(minimal.power).toBeUndefined();
    });
  });
});
