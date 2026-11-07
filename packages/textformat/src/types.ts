import type { EntityRaw } from '@flighthq/entity/contract';

/** One readonly OpenType tag/value record. Custom tags remain strings, as in the source. */
export interface FontVariation {
  readonly axis: string;
  readonly value: number;
}

export type TextFormatAlign = 'center' | 'end' | 'justify' | 'left' | 'right' | 'start';

export type TextFormatListMarker = 'circle' | 'decimal' | 'disc' | 'none' | 'square';

/** Source optional fields remain absent until a later layout consumer applies defaults. */
export interface TextFormat {
  align?: TextFormatAlign;
  blockIndent?: number;
  bold?: boolean;
  bullet?: boolean;
  /** Packed sRGB RGBA integer, 0xRRGGBBAA; alpha is linear coverage. */
  color?: number;
  font?: string;
  indent?: number;
  italic?: boolean;
  kerning?: boolean;
  leading?: number;
  leftMargin?: number;
  letterSpacing?: number;
  listMarker?: TextFormatListMarker;
  rightMargin?: number;
  size?: number;
  strikethrough?: boolean;
  /** Plain source number[], preserving its variable length and order. */
  tabStops?: number[];
  target?: string;
  underline?: boolean;
  url?: string;
  /** Readonly source record sequence, preserving order and repeated axis tags. */
  variations?: Readonly<FontVariation[]>;
}

/** Half-open UTF-16 code-unit offsets, with the same format object as the caller. */
export interface TextFormatRangeRaw extends EntityRaw {
  end: number;
  format: TextFormat;
  start: number;
}
