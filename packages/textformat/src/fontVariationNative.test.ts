import {
  FontVariationItalic,
  FontVariationOpticalSize,
  FontVariationSlant,
  FontVariationWeight,
  FontVariationWidth,
} from './contract.ts';

describe('FontVariation constant types', () => {
  it('preserves each Rust string literal in the public TypeScript type', () => {
    expectTypeOf(FontVariationItalic).toEqualTypeOf<'ital'>();
    expectTypeOf(FontVariationOpticalSize).toEqualTypeOf<'opsz'>();
    expectTypeOf(FontVariationSlant).toEqualTypeOf<'slnt'>();
    expectTypeOf(FontVariationWeight).toEqualTypeOf<'wght'>();
    expectTypeOf(FontVariationWidth).toEqualTypeOf<'wdth'>();
  });
});
