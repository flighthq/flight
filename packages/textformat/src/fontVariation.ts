// Generated from crates/flight-textformat/src/font_variation.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * One readonly OpenType tag/value record. Custom tags remain strings, as in the source.
 */
export interface FontVariation {
  readonly axis: string;
  readonly value: number;
}

export const FontVariationItalic = 'ital' as const;

export const FontVariationOpticalSize = 'opsz' as const;

export const FontVariationSlant = 'slnt' as const;

export const FontVariationWeight = 'wght' as const;

export const FontVariationWidth = 'wdth' as const;
