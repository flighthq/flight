import type { Modifier } from './Modifier';
import { ModifierSlot } from './ModifierSlot';

describe('Modifier', () => {
  describe('open base contract', () => {
    it('accepts a foreign custom modifier kind', () => {
      interface AcmeModifier extends Modifier {
        kind: 'acme.Dissolve';
        threshold: number;
      }

      const modifier: AcmeModifier = {
        kind: 'acme.Dissolve',
        slot: ModifierSlot.Effect,
        threshold: 0.5,
      };
      const base: Modifier = modifier;
      expect(base.kind).toBe('acme.Dissolve');
      expect(base.slot).toBe('Effect');
    });

    it('narrows on the kind discriminant', () => {
      interface RedModifier extends Modifier {
        kind: 'RedModifier';
        strength: number;
      }
      interface BlueModifier extends Modifier {
        kind: 'BlueModifier';
        amount: number;
      }

      const mod: RedModifier | BlueModifier = {
        kind: 'RedModifier',
        slot: ModifierSlot.Diffuse,
        strength: 2,
      };
      if (mod.kind === 'RedModifier') {
        expectTypeOf(mod).toHaveProperty('strength');
      }
      expect(mod.kind).toBe('RedModifier');
    });

    it('accepts any string kind and slot', () => {
      const modifier: Modifier = { kind: 'SomeModifier', slot: 'SomeSlot' };
      expect(modifier.kind).toBe('SomeModifier');
    });
  });
});
