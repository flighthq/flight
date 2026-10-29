// Generated from crates/flight-textlayout/src/type_strings.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { TextAutoSize, TextJustification, TextVerticalAlign } from './types.ts';

export function getTextAutoSizeString(value: TextAutoSize): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'center':
        return 'center';
      case 'left':
        return 'left';
      case 'none':
        return 'none';
      case 'right':
        return 'right';
    }
  })();
}

export function getTextJustificationString(value: TextJustification): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'interCharacter':
        return 'interCharacter';
      case 'interWord':
        return 'interWord';
      case 'none':
        return 'none';
    }
  })();
}

export function getTextVerticalAlignString(value: TextVerticalAlign): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'bottom':
        return 'bottom';
      case 'middle':
        return 'middle';
      case 'top':
        return 'top';
    }
  })();
}

export function parseTextAutoSize(value: string): TextAutoSize | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'center':
        return 'center';
      case 'left':
        return 'left';
      case 'none':
        return 'none';
      case 'right':
        return 'right';
      default:
        return undefined;
    }
  })();
}

export function parseTextJustification(value: string): TextJustification | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'interCharacter':
        return 'interCharacter';
      case 'interWord':
        return 'interWord';
      case 'none':
        return 'none';
      default:
        return undefined;
    }
  })();
}

export function parseTextVerticalAlign(value: string): TextVerticalAlign | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'bottom':
        return 'bottom';
      case 'middle':
        return 'middle';
      case 'top':
        return 'top';
      default:
        return undefined;
    }
  })();
}
