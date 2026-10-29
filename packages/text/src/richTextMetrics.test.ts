// Generated from crates/flight-text/tests/rich_text_metrics_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { createRichTextData } from '@flighthq/text/contract';
import type { RichTextData } from '@flighthq/text/contract';
import { createTextFormatRange } from '@flighthq/textformat/contract';
import type { TextFormat, TextFormatRangeRaw } from '@flighthq/textformat/contract';
import { createTextLayoutResult } from '@flighthq/textlayout/contract';
import type { TextLayoutResult } from '@flighthq/textlayout/contract';
import { describe, expect, it } from 'vitest';

import {
  computeRichTextBottomScrollV,
  computeRichTextLineCount,
  computeRichTextMaxScrollH,
  computeRichTextMaxScrollV,
  computeRichTextTextHeight,
  computeRichTextTextWidth,
  getRichTextScrollYOffset,
} from './contract.ts';

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

describe('computeRichTextBottomScrollV', () => {
  it('clamps to the total line count', () => {
    let data = richTextData();
    data.height = 80.0;
    data.scrollV = 2.0;
    let layout = textLayoutResult();
    layout.lineHeights = [10.0, 10.0, 10.0];
    layout.numLines = 3;
    expect(computeRichTextBottomScrollV(data, layout)).toEqual(3.0);
  });
  it('returns the last visible one based line', () => {
    let data = richTextData();
    data.height = 34.0;
    data.scrollV = 2.0;
    let layout = textLayoutResult();
    layout.lineHeights = [10.0, 10.0, 10.0, 10.0];
    layout.numLines = 4;
    expect(computeRichTextBottomScrollV(data, layout)).toEqual(4.0);
  });
});

describe('computeRichTextLineCount', () => {
  it('returns the layout line count', () => {
    let layout = textLayoutResult();
    layout.numLines = 3;
    expect(computeRichTextLineCount(layout)).toEqual(3);
  });
});

describe('computeRichTextMaxScrollH', () => {
  it('returns horizontal overflow beyond the visible field width', () => {
    let data = richTextData();
    data.width = 54.0;
    let layout = textLayoutResult();
    layout.textWidth = 80.0;
    expect(computeRichTextMaxScrollH(data, layout)).toEqual(30.0);
  });
  it('returns zero when text fits horizontally', () => {
    let data = richTextData();
    data.width = 100.0;
    let layout = textLayoutResult();
    layout.textWidth = 50.0;
    expect(computeRichTextMaxScrollH(data, layout)).toEqual(0.0);
  });
});

describe('computeRichTextMaxScrollV', () => {
  it('returns one for a single line', () => {
    const data = richTextData();
    let layout = textLayoutResult();
    layout.numLines = 1;
    expect(computeRichTextMaxScrollV(data, layout)).toEqual(1.0);
  });
  it('returns the first scroll v where the final line is visible', () => {
    let data = richTextData();
    data.height = 34.0;
    let layout = textLayoutResult();
    layout.lineHeights = [10.0, 10.0, 10.0, 10.0];
    layout.numLines = 4;
    expect(computeRichTextMaxScrollV(data, layout)).toEqual(2.0);
  });
});

describe('computeRichTextTextHeight', () => {
  it('returns the ceil text height', () => {
    let layout = textLayoutResult();
    layout.textHeight = 12.2;
    expect(computeRichTextTextHeight(layout)).toEqual(13.0);
  });
});

describe('computeRichTextTextWidth', () => {
  it('returns the ceil text width', () => {
    let layout = textLayoutResult();
    layout.textWidth = 21.1;
    expect(computeRichTextTextWidth(layout)).toEqual(22.0);
  });
});

describe('getRichTextScrollYOffset', () => {
  it('clamps to the available line count', () => {
    expect(getRichTextScrollYOffset([10.0, 12.0], 5)).toEqual(22.0);
  });
  it('returns the sum of the first n line heights', () => {
    expect(getRichTextScrollYOffset([10.0, 12.0, 14.0], 2)).toEqual(22.0);
  });
  it('returns zero when first visible line is zero', () => {
    expect(getRichTextScrollYOffset([10.0, 12.0, 14.0], 0)).toEqual(0.0);
  });
});
