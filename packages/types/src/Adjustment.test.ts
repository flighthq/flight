import type { Adjustment } from './Adjustment';
import { EntityRuntimeKey } from './Entity';

describe('Adjustment', () => {
  describe('open base contract', () => {
    it('accepts a foreign custom adjustment kind', () => {
      interface AcmeDuotone extends Adjustment {
        kind: 'acme.Duotone';
        shadow: number;
      }

      const adjustment: AcmeDuotone = { [EntityRuntimeKey]: undefined, kind: 'acme.Duotone', shadow: 0x000000ff };
      // A custom adjustment is assignable to the open base
      const base: Adjustment = adjustment;
      expect(base.kind).toBe('acme.Duotone');
    });

    it('narrows on kind discriminant', () => {
      interface BrightnessAdjustment extends Adjustment {
        kind: 'Brightness';
        amount: number;
      }
      interface ContrastAdjustment extends Adjustment {
        kind: 'Contrast';
        amount: number;
      }

      const adjustment: BrightnessAdjustment | ContrastAdjustment = {
        [EntityRuntimeKey]: undefined,
        kind: 'Brightness',
        amount: 0.2,
      };
      if (adjustment.kind === 'Brightness') {
        expectTypeOf(adjustment).toHaveProperty('amount');
      }
      expect(adjustment.kind).toBe('Brightness');
    });

    it('accepts any string kind', () => {
      const adjustment: Adjustment = { [EntityRuntimeKey]: undefined, kind: 'ColorScaleBiasAdjustment' };
      expect(adjustment.kind).toBe('ColorScaleBiasAdjustment');
    });
  });
});
