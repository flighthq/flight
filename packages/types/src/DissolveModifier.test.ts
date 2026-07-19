import { DissolveModifierKind } from './DissolveModifier';
import type { DissolveModifier } from './DissolveModifier';
import type { Modifier } from './Modifier';

describe('DissolveModifier', () => {
  describe('DissolveModifierKind', () => {
    it('is the canonical PascalCase type name', () => {
      expect(DissolveModifierKind).toBe('DissolveModifier');
    });
  });

  describe('descriptor shape', () => {
    it('is assignable to the open Modifier base with slot Effect', () => {
      const burn: DissolveModifier = {
        kind: 'DissolveModifier',
        slot: 'Effect',
        threshold: 0.4,
        edgeColor: 0xff6600ff,
        edgeWidth: 0.05,
        scale: 8,
      };
      const base: Modifier = burn;
      expect(base.slot).toBe('Effect');
      expect(burn.threshold).toBe(0.4);
    });
  });
});
