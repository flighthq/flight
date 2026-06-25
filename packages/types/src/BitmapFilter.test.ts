import type { BitmapFilter } from './BitmapFilter';

describe('BitmapFilter', () => {
  describe('open base contract', () => {
    it('accepts a foreign custom filter kind', () => {
      interface AcmeFilter extends BitmapFilter {
        readonly kind: 'acme.Scanlines';
        lineWidth: number;
      }

      const filter: AcmeFilter = { kind: 'acme.Scanlines', lineWidth: 2 };
      // A custom filter is assignable to the open base
      const base: BitmapFilter = filter;
      expect(base.kind).toBe('acme.Scanlines');
    });

    it('narrows on kind discriminant', () => {
      interface BlurFilter extends BitmapFilter {
        readonly kind: 'BlurFilter';
        blurX: number;
        blurY: number;
      }
      interface GlowFilter extends BitmapFilter {
        readonly kind: 'GlowFilter';
        color: number;
      }

      const filter: BlurFilter | GlowFilter = { kind: 'BlurFilter', blurX: 4, blurY: 4 };
      if (filter.kind === 'BlurFilter') {
        expectTypeOf(filter).toHaveProperty('blurX');
        expectTypeOf(filter).toHaveProperty('blurY');
      }
      expect(filter.kind).toBe('BlurFilter');
    });

    it('accepts any string kind', () => {
      const filter: BitmapFilter = { kind: 'CustomFilter' };
      expect(filter.kind).toBe('CustomFilter');
    });
  });
});
