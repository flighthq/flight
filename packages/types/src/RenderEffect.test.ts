import type { RenderEffect } from './RenderEffect';

describe('RenderEffect', () => {
  describe('open base contract', () => {
    it('accepts a foreign custom effect kind', () => {
      interface AcmeEffect extends RenderEffect {
        kind: 'acme.Sparkle';
        density: number;
      }

      const effect: AcmeEffect = { kind: 'acme.Sparkle', density: 10 };
      // A custom effect is assignable to the open base
      const base: RenderEffect = effect;
      expect(base.kind).toBe('acme.Sparkle');
    });

    it('narrows on kind discriminant', () => {
      interface RedEffect extends RenderEffect {
        kind: 'RedEffect';
        strength: number;
      }
      interface BlueEffect extends RenderEffect {
        kind: 'BlueEffect';
        amount: number;
      }

      const eff: RedEffect | BlueEffect = { kind: 'RedEffect', strength: 2 };
      if (eff.kind === 'RedEffect') {
        expectTypeOf(eff).toHaveProperty('strength');
      }
      expect(eff.kind).toBe('RedEffect');
    });

    it('accepts any string kind', () => {
      const effect: RenderEffect = { kind: 'SomeEffect' };
      expect(effect.kind).toBe('SomeEffect');
    });
  });
});
