// Generated from crates/flight-text/tests/text_format_font_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { createRichTextData } from '@flighthq/text/contract';
import type { RichTextData } from '@flighthq/text/contract';
import { createTextFormatRange } from '@flighthq/textformat/contract';
import type { TextFormat, TextFormatRangeRaw } from '@flighthq/textformat/contract';
import { createTextLayoutResult } from '@flighthq/textlayout/contract';
import type { TextLayoutResult } from '@flighthq/textlayout/contract';
import { describe, expect, it } from 'vitest';

import { computeTextFormatFontString } from './contract.ts';

function emptyTextFormat(): TextFormat {
  return {
    align: undefined,
    blockIndent: undefined,
    bold: undefined,
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

function formatRef(format: TextFormat): TextFormat {
  return format;
}

function formatRange(format: TextFormat, start: number, end: number): TextFormatRangeRaw {
  return createTextFormatRange(formatRef(format), start, end);
}

function richTextData(): RichTextData {
  return createRichTextData();
}

function textLayoutResult(): TextLayoutResult {
  return createTextLayoutResult();
}

describe('computeTextFormatFontString', () => {
  it('returns a css font string from format properties', () => {
    let format = emptyTextFormat();
    format.size = 16.0;
    format.font = 'Arial';
    format.bold = false;
    format.italic = false;
    expect(computeTextFormatFontString(format)).toEqual('normal normal 16px Arial');
  });
  it('includes bold and italic when set', () => {
    let format = emptyTextFormat();
    format.size = 12.0;
    format.font = 'sans-serif';
    format.bold = true;
    format.italic = true;
    expect(computeTextFormatFontString(format)).toEqual('italic bold 12px sans-serif');
  });
  it('uses defaults when size and font are omitted', () => {
    expect(computeTextFormatFontString(emptyTextFormat())).toEqual('normal normal 12px sans-serif');
  });
  it('uses italic style when italic is true', () => {
    let format = emptyTextFormat();
    format.italic = true;
    expect(computeTextFormatFontString(format).startsWith('italic ')).toBe(true);
  });
  it('uses bold weight when bold is true', () => {
    let format = emptyTextFormat();
    format.bold = true;
    expect(computeTextFormatFontString(format).includes(' bold ')).toBe(true);
  });
});
