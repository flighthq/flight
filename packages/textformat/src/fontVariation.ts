// Generated from crates/flight-textformat/src/font_variation.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * One readonly OpenType tag/value record. Custom tags remain strings, as in the source.
 */
export interface FontVariation {
  readonly axis: string;
  readonly value: number;
}

export const FontVariationItalic: string = 'ital';

export const FontVariationOpticalSize: string = 'opsz';

export const FontVariationSlant: string = 'slnt';

export const FontVariationWeight: string = 'wght';

export const FontVariationWidth: string = 'wdth';
