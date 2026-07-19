import type { Modifier } from './Modifier';
import { ToonModifierKind } from './ToonModifier';
import type { ToonModifier } from './ToonModifier';

describe('ToonModifier', () => {
  describe('ToonModifierKind', () => {
    it('is the canonical PascalCase type name', () => {
      expect(ToonModifierKind).toBe('ToonModifier');
    });
  });

  describe('descriptor shape', () => {
    it('is assignable to the open Modifier base with slot Effect', () => {
      const cel: ToonModifier = {
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
