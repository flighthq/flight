// Generated from crates/flight-textformat/tests/font_variation_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  FontVariationItalic,
  FontVariationOpticalSize,
  FontVariationSlant,
  FontVariationWeight,
  FontVariationWidth,
} from './contract.ts';

describe('fontVariation', () => {
  it('preserves custom axis spelling and the given value', () => {
    const variation = { axis: String('XTRA'), value: -12.5 };
    expect(variation.axis).toEqual('XTRA');
    expect(variation.value).toEqual(-12.5);
  });
});

describe('fontVariationConstants', () => {
  it('uses all five exact source tags', () => {
    expect(FontVariationItalic).toEqual('ital');
    expect(FontVariationOpticalSize).toEqual('opsz');
    expect(FontVariationSlant).toEqual('slnt');
    expect(FontVariationWeight).toEqual('wght');
    expect(FontVariationWidth).toEqual('wdth');
  });
});
