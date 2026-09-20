import type { Effect } from './Effect';
import { EntityRuntimeKey } from './Entity';

describe('Effect', () => {
  describe('open base contract', () => {
    it('accepts a foreign custom effect kind', () => {
      interface AcmeEffect extends Effect {
        kind: 'acme.Sparkle';
        density: number;
      }

      const effect: AcmeEffect = { [EntityRuntimeKey]: undefined, kind: 'acme.Sparkle', density: 10 };
      const base: Effect = effect;
      expect(base.kind).toBe('acme.Sparkle');
    });

    it('narrows on kind discriminant', () => {
      interface RedEffect extends Effect {
        kind: 'RedEffect';
        strength: number;
      }
      interface BlueEffect extends Effect {
        kind: 'BlueEffect';
        amount: number;
      }

      const eff: RedEffect | BlueEffect = { [EntityRuntimeKey]: undefined, kind: 'RedEffect', strength: 2 };
      if (eff.kind === 'RedEffect') {
        expectTypeOf(eff).toHaveProperty('strength');
      }
      expect(eff.kind).toBe('RedEffect');
    });

    it('accepts any string kind', () => {
      const effect: Effect = { [EntityRuntimeKey]: undefined, kind: 'SomeEffect' };
      expect(effect.kind).toBe('SomeEffect');
    });
  });
});
