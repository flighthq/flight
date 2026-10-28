// Generated from crates/flight-textformat/src/text_format.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { FontVariation } from './fontVariation.ts';

export type TextFormatAlign = 'center' | 'end' | 'justify' | 'left' | 'right' | 'start';

export type TextFormatListMarker = 'circle' | 'decimal' | 'disc' | 'none' | 'square';

/**
 * Source optional fields remain absent until a later layout consumer applies defaults.
 */
export interface TextFormat {
  align?: TextFormatAlign;
  blockIndent?: number;
  bold?: boolean;
  bullet?: boolean;
  /**
   * Packed sRGB RGBA integer, 0xRRGGBBAA; alpha is linear coverage.
   */
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
  /**
   * Plain source number[], preserving its variable length and order.
   */
  tabStops?: number[];
  target?: string;
  underline?: boolean;
  url?: string;
  /**
   * Readonly source record sequence, preserving order and repeated axis tags.
   */
  variations?: Readonly<FontVariation[]>;
}

const DEFAULT_SIZE: number = 12.0;

export function getTextFormatAlignString(value: TextFormatAlign): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'center':
        return 'center';
      case 'end':
        return 'end';
      case 'justify':
        return 'justify';
      case 'left':
        return 'left';
      case 'right':
        return 'right';
      case 'start':
        return 'start';
    }
  })();
}

export function getTextFormatAscent(format: Readonly<TextFormat>): number {
  return format.size ?? DEFAULT_SIZE;
}

export function getTextFormatDescent(format: Readonly<TextFormat>): number {
  return (format.size ?? DEFAULT_SIZE) * 0.185;
}

export function getTextFormatHeight(format: Readonly<TextFormat>): number {
  return getTextFormatAscent(format) + getTextFormatDescent(format) + getTextFormatLeading(format);
}

export function getTextFormatLeading(format: Readonly<TextFormat>): number {
  return format.leading ?? 0.0;
}

export function getTextFormatListMarkerString(value: TextFormatListMarker): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'circle':
        return 'circle';
      case 'decimal':
        return 'decimal';
      case 'disc':
        return 'disc';
      case 'none':
        return 'none';
      case 'square':
        return 'square';
    }
  })();
}

export function mergeTextFormat(base: Readonly<TextFormat>, override: Readonly<TextFormat>): TextFormat {
  let result = { ...base, tabStops: base.tabStops?.slice() };
  if (override.align !== undefined) {
    result.align = override.align;
  }
  if (override.blockIndent !== undefined) {
    result.blockIndent = override.blockIndent;
  }
  if (override.bold !== undefined) {
    result.bold = override.bold;
  }
  if (override.bullet !== undefined) {
    result.bullet = override.bullet;
  }
  if (override.color !== undefined) {
    result.color = override.color;
  }
  if (override.font !== undefined) {
    result.font = override.font;
  }
  if (override.indent !== undefined) {
    result.indent = override.indent;
  }
  if (override.italic !== undefined) {
    result.italic = override.italic;
  }
  if (override.kerning !== undefined) {
    result.kerning = override.kerning;
  }
  if (override.leading !== undefined) {
    result.leading = override.leading;
  }
  if (override.leftMargin !== undefined) {
    result.leftMargin = override.leftMargin;
  }
  if (override.letterSpacing !== undefined) {
    result.letterSpacing = override.letterSpacing;
  }
  if (override.listMarker !== undefined) {
    result.listMarker = override.listMarker;
  }
  if (override.rightMargin !== undefined) {
    result.rightMargin = override.rightMargin;
  }
  if (override.size !== undefined) {
    result.size = override.size;
  }
  if (override.strikethrough !== undefined) {
    result.strikethrough = override.strikethrough;
  }
  if (override.tabStops !== undefined) {
    result.tabStops = override.tabStops?.slice();
  }
  if (override.target !== undefined) {
    result.target = override.target;
  }
  if (override.underline !== undefined) {
    result.underline = override.underline;
  }
  if (override.url !== undefined) {
    result.url = override.url;
  }
  if (override.variations !== undefined) {
    result.variations = override.variations;
  }
  return result;
}

export function parseTextFormatAlign(value: string): TextFormatAlign | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'center':
        return 'center';
      case 'end':
        return 'end';
      case 'justify':
        return 'justify';
      case 'left':
        return 'left';
      case 'right':
        return 'right';
      case 'start':
        return 'start';
      default:
        return undefined;
    }
  })();
}

export function parseTextFormatListMarker(value: string): TextFormatListMarker | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'circle':
        return 'circle';
      case 'decimal':
        return 'decimal';
      case 'disc':
        return 'disc';
      case 'none':
        return 'none';
      case 'square':
        return 'square';
      default:
        return undefined;
    }
  })();
}
