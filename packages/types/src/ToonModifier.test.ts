import { EntityRuntimeKey } from './Entity.ts';
import type { Modifier } from './Modifier.ts';
import { ToonModifierKind } from './ToonModifier.ts';
import type { ToonModifier } from './ToonModifier.ts';

describe('ToonModifier', () => {
  describe('ToonModifierKind', () => {
    it('is the canonical PascalCase type name', () => {
      expect(ToonModifierKind).toBe('ToonModifier');
    });
  });

  describe('descriptor shape', () => {
    it('is assignable to the open Modifier base with slot Effect', () => {
      const cel: ToonModifier = {
        [EntityRuntimeKey]: undefined,
        kind: 'ToonModifier',
        slot: 'Effect',
        steps: 3,
        smoothness: 0.1,
      };
      const base: Modifier = cel;
      expect(base.slot).toBe('Effect');
      expect(cel.steps).toBe(3);
    });
  });
});
