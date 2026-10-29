// Generated from crates/flight-text-markup/tests/normalize_markup_tag_result_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { TextFormat } from '@flighthq/textformat/contract';
import { describe, expect, it } from 'vitest';

import { normalizeMarkupTagResult } from './contract.ts';
import type { MarkupTagEffect } from './contract.ts';

function boldTextFormat(): TextFormat {
  return {
    align: undefined,
    blockIndent: undefined,
    bold: true,
    bullet: undefined,
    color: undefined,
    font: undefined,
    indent: undefined,
    italic: undefined,
    kerning: undefined,
    leading: undefined,
    leftMargin: undefined,
    letterSpacing: undefined,
    listMarker: undefined,
    rightMargin: undefined,
    size: undefined,
    strikethrough: undefined,
    tabStops: undefined,
    target: undefined,
    underline: undefined,
    url: undefined,
    variations: undefined,
  };
}

describe('normalizeMarkupTagResult', () => {
  it('preserves effects and wraps bare formats', () => {
    const effect: MarkupTagEffect = { breakBefore: true, format: undefined, text: '\n' };
    expect(normalizeMarkupTagResult(effect)).toEqual(effect);
    const format = boldTextFormat();
    const normalized = normalizeMarkupTagResult(format);
    expect(normalized.breakBefore).toEqual(undefined);
    expect(normalized.format).toEqual(format);
    expect(normalized.text).toEqual(undefined);
  });
});
