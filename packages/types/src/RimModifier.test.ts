import { EntityRuntimeKey } from './Entity.ts';
import type { Modifier } from './Modifier.ts';
import type { RimModifier } from './RimModifier.ts';
import { RimModifierKind } from './RimModifier.ts';

describe('RimModifier', () => {
  describe('RimModifierKind', () => {
    it('is the canonical PascalCase type name', () => {
      expect(RimModifierKind).toBe('RimModifier');
    });
  });

  describe('descriptor shape', () => {
    it('is assignable to the open Modifier base with slot Effect', () => {
      const atmosphere: RimModifier = {
        [EntityRuntimeKey]: undefined,
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
      const minimal: RimModifier = {
        [EntityRuntimeKey]: undefined,
        kind: 'RimModifier',
        slot: 'Effect',
        color: 0xffffffff,
      };
      expect(minimal.power).toBeUndefined();
    });
  });
});
