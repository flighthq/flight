// Generated from crates/flight-textlayout/tests/rich_text_query_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { createRectangle } from '@flighthq/geometry/contract';
import type { TextFormat, TextFormatRangeRaw } from '@flighthq/textformat/contract';
import type { TextMeasureFunction } from '@flighthq/textshaper/contract';
import { describe, expect, it } from 'vitest';

import {
  computeRichTextCharIndexAtPoint,
  computeRichTextLineMetrics,
  createTextFormatRange,
  createTextLayoutGroup,
  createTextLayoutResult,
  getRichTextCharBoundaries,
  getRichTextFirstCharInParagraph,
  getRichTextLineIndexAtPoint,
  getRichTextLineIndexOfChar,
  getRichTextLineLength,
  getRichTextLineOffset,
  getRichTextLineText,
  getRichTextLinkAtPoint,
  getRichTextParagraphLength,
  getRichTextSelectionRectangles,
} from './contract.ts';
import type { TextLayoutParams, TextLayoutResult, TextSelectionRectangle } from './contract.ts';

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

function fixedMeasure(): TextMeasureFunction {
  return (text, Format) => Array.from({ length: text.length }, (_, index) => text.charCodeAt(index)).length * 10.0;
}

function formatRef(format: TextFormat): TextFormat {
  return format;
}

function singleRangeParams(text: string, width: number): TextLayoutParams {
  let value = emptyTextFormat();
  value.size = 16.0;
  const format = formatRef(value);
  return {
    autoSize: undefined,
    border: undefined,
    direction: undefined,
    formatRanges: [
      createTextFormatRange(
        format,
        0,
        Array.from({ length: text.length }, (_, index) => text.charCodeAt(index)).length,
      ),
    ],
    height: 1000.0,
    justification: undefined,
    maxLines: undefined,
    measure: fixedMeasure(),
    multiline: undefined,
    text: String(text),
    truncationCharacter: undefined,
    verticalAlign: undefined,
    width: width,
    wordWrap: undefined,
  };
}

function range(format: TextFormat, start: number, end: number): TextFormatRangeRaw {
  return createTextFormatRange(formatRef(format), start, end);
}

function createLayout(): TextLayoutResult {
  const firstFormat = formatRef(emptyTextFormat());
  let linked = emptyTextFormat();
  linked.url = 'https://example.com';
  const secondFormat = formatRef(linked);
  let first = createTextLayoutGroup(firstFormat);
  first.startIndex = 0;
  first.endIndex = 3;
  first.ascent = 10.0;
  first.descent = 2.0;
  first.height = 12.0;
  first.lineIndex = 0;
  first.offsetX = 0.0;
  first.offsetY = 2.0;
  first.positions = [10.0, 10.0, 10.0];
  first.width = 30.0;
  let second = createTextLayoutGroup(secondFormat);
  second.startIndex = 3;
  second.endIndex = 7;
  second.ascent = 10.0;
  second.descent = 2.0;
  second.height = 12.0;
  second.lineIndex = 1;
  second.offsetX = 0.0;
  second.offsetY = 16.0;
  second.positions = [10.0, 10.0, 10.0, 10.0];
  second.width = 40.0;
  let layout = createTextLayoutResult();
  layout.groups = [first, second];
  layout.lineAscents = [10.0, 10.0];
  layout.lineDescents = [2.0, 2.0];
  layout.lineHeights = [14.0, 14.0];
  layout.lineLeadings = [0.0, 0.0];
  layout.lineWidths = [30.0, 40.0];
  layout.numLines = 2;
  layout.textHeight = 28.0;
  layout.textWidth = 40.0;
  return layout;
}

describe('computeRichTextCharIndexAtPoint', () => {
  it('returns the index at a point within a group', () => {
    expect(computeRichTextCharIndexAtPoint(createLayout(), 25.0, 5.0)).toEqual(2);
  });
  it('selects the closest line by y distance', () => {
    expect(computeRichTextCharIndexAtPoint(createLayout(), 5.0, 100.0)).toEqual(7);
  });
});

describe('computeRichTextLineMetrics', () => {
  it('returns metrics for a valid line', () => {
    const metrics = computeRichTextLineMetrics(createLayout(), 0)!;
    expect([metrics.ascent, metrics.descent, metrics.width]).toEqual([10.0, 2.0, 30.0]);
  });
  it('returns none for a non existent line', () => {
    expect(computeRichTextLineMetrics(createLayout(), 5)).toEqual(null);
  });
});

describe('getRichTextCharBoundaries', () => {
  it('fills out with the bounding box of the character', () => {
    let out = createRectangle(0.0, 0.0, 0.0, 0.0);
    expect(getRichTextCharBoundaries(out, createLayout(), 1)).toBe(true);
    expect([out.x, out.y, out.width, out.height]).toEqual([10.0, 2.0, 10.0, 12.0]);
  });
  it('returns false for an out of range index', () => {
    let out = createRectangle(0.0, 0.0, 0.0, 0.0);
    expect(!getRichTextCharBoundaries(out, createLayout(), 99)).toBe(true);
  });
});

describe('getRichTextFirstCharInParagraph', () => {
  it('returns 0 at the start of the first paragraph', () => {
    expect(getRichTextFirstCharInParagraph('hello\nworld', 3)).toEqual(0);
  });
  it('returns the position after the newline for a later paragraph', () => {
    expect(getRichTextFirstCharInParagraph('hello\nworld', 8)).toEqual(6);
  });
});

describe('getRichTextLineIndexAtPoint', () => {
  it('returns 0 for a y value within the first line', () => {
    expect(getRichTextLineIndexAtPoint(createLayout(), 5.0)).toEqual(0);
  });
  it('returns 1 for a y value within the second line', () => {
    expect(getRichTextLineIndexAtPoint(createLayout(), 18.0)).toEqual(1);
  });
});

describe('getRichTextLineIndexOfChar', () => {
  it('returns 0 for a character on the first line', () => {
    expect(getRichTextLineIndexOfChar(createLayout(), 1)).toEqual(0);
  });
  it('returns 1 for a character on the second line', () => {
    expect(getRichTextLineIndexOfChar(createLayout(), 5)).toEqual(1);
  });
});

describe('getRichTextLineLength', () => {
  it('returns 0 for a non existent line', () => {
    expect(getRichTextLineLength(createLayout(), 5)).toEqual(0);
  });
  it('returns the character count of the requested line', () => {
    expect(getRichTextLineLength(createLayout(), 0)).toEqual(3);
    expect(getRichTextLineLength(createLayout(), 1)).toEqual(4);
  });
});

describe('getRichTextLineOffset', () => {
  it('returns the start index of the requested line', () => {
    expect(getRichTextLineOffset(createLayout(), 0)).toEqual(0);
    expect(getRichTextLineOffset(createLayout(), 1)).toEqual(3);
  });
});

describe('getRichTextLineText', () => {
  it('returns empty string for a non existent line', () => {
    expect(getRichTextLineText('abcdefg', createLayout(), 5)).toEqual('');
  });
  it('returns the text slice for the requested line', () => {
    expect(getRichTextLineText('abcdefg', createLayout(), 0)).toEqual('abc');
    expect(getRichTextLineText('abcdefg', createLayout(), 1)).toEqual('defg');
  });
});

describe('getRichTextLinkAtPoint', () => {
  it('returns none when the point does not hit a linked group', () => {
    expect(getRichTextLinkAtPoint(createLayout(), 10.0, 5.0)).toEqual(null);
  });
  it('returns the url when the point hits a group with a url', () => {
    expect(getRichTextLinkAtPoint(createLayout(), 10.0, 18.0)).toEqual('https://example.com');
  });
});

describe('getRichTextParagraphLength', () => {
  it('returns the length including the newline', () => {
    expect(getRichTextParagraphLength('hello\nworld', 3)).toEqual(6);
  });
  it('returns to end of string when there is no trailing newline', () => {
    expect(getRichTextParagraphLength('hello\nworld', 8)).toEqual(5);
  });
});

describe('getRichTextSelectionRectangles', () => {
  it('fills out with one rectangle per intersected group', () => {
    let out: TextSelectionRectangle[] = [] as never[];
    getRichTextSelectionRectangles(out, 1, 5, createLayout());
    expect(out.length).toEqual(2);
    expect([out[0].lineIndex, out[1].lineIndex]).toEqual([0, 1]);
  });
  it('returns empty for a collapsed selection', () => {
    let out: TextSelectionRectangle[] = [] as never[];
    getRichTextSelectionRectangles(out, 2, 2, createLayout());
    expect(out.length === 0).toBe(true);
  });
});
