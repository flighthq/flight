import type { AnimatedNormalModifier } from './AnimatedNormalModifier';
import { AnimatedNormalModifierKind } from './AnimatedNormalModifier';
import type { Modifier } from './Modifier';

describe('AnimatedNormalModifier', () => {
  describe('AnimatedNormalModifierKind', () => {
    it('is the canonical PascalCase type name', () => {
      expect(AnimatedNormalModifierKind).toBe('AnimatedNormalModifier');
    });
  });

  describe('descriptor shape', () => {
    it('is assignable to the open Modifier base with slot Normal', () => {
      const ocean: AnimatedNormalModifier = {
        kind: 'AnimatedNormalModifier',
        slot: 'Normal',
        map: null,
        scroll: { x: 0.02, y: 0.01 },
        strength: 0.5,
      };
      const base: Modifier = ocean;
      expect(base.slot).toBe('Normal');
      expect(ocean.scroll.x).toBeCloseTo(0.02);
    });

    it('supports an optional dual-scroll second layer', () => {
      const water: AnimatedNormalModifier = {
        kind: 'AnimatedNormalModifier',
        slot: 'Normal',
        map: null,
        scroll: { x: 0.02, y: 0 },
        secondaryScroll: { x: -0.01, y: 0.03 },
      };
      expect(water.secondaryScroll?.y).toBeCloseTo(0.03);
    });
  });
});
