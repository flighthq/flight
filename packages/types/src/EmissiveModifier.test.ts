import type { EmissiveModifier } from './EmissiveModifier';
import { EmissiveModifierFacing, EmissiveModifierKind } from './EmissiveModifier';
import type { Modifier } from './Modifier';

describe('EmissiveModifier', () => {
  describe('EmissiveModifierKind', () => {
    it('is the canonical PascalCase type name', () => {
      expect(EmissiveModifierKind).toBe('EmissiveModifier');
    });
  });

  describe('EmissiveModifierFacing', () => {
    it('names the facing gates as canonical PascalCase values', () => {
      expect(EmissiveModifierFacing.Ignore).toBe('Ignore');
      expect(EmissiveModifierFacing.AwayFromLight).toBe('AwayFromLight');
      expect(EmissiveModifierFacing.TowardLight).toBe('TowardLight');
    });
  });

  describe('descriptor shape', () => {
    it('is assignable to the open Modifier base with slot Emissive', () => {
      const nightSide: EmissiveModifier = {
        kind: 'EmissiveModifier',
        slot: 'Emissive',
        color: 0xffdd88ff,
        strength: 2,
        facing: EmissiveModifierFacing.AwayFromLight,
      };
      const base: Modifier = nightSide;
      expect(base.slot).toBe('Emissive');
      expect(nightSide.color).toBe(0xffdd88ff);
    });
  });
});
