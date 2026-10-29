// Generated from crates/flight-textlayout/tests/text_layout_group_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { TextFormat, TextFormatRangeRaw } from '@flighthq/textformat/contract';
import type { TextMeasureFunction } from '@flighthq/textshaper/contract';
import { describe, expect, it } from 'vitest';

import { createTextFormatRange, createTextLayoutGroup, initializeTextLayoutGroup } from './contract.ts';
import type { TextLayoutParams } from './contract.ts';

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
  return (text: string, _format: Readonly<TextFormat>) =>
    Array.from({ length: text.length }, (_, index) => text.charCodeAt(index)).length * 10.0;
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

describe('createTextLayoutGroup', () => {
  it('initializes with zero metrics', () => {
    const group = createTextLayoutGroup(formatRef(emptyTextFormat()));
    expect([group.startIndex, group.endIndex]).toEqual([0, 0]);
    expect(group.ascent).toEqual(0.0);
    expect(group.descent).toEqual(0.0);
    expect(group.height).toEqual(0.0);
    expect(group.leading).toEqual(0.0);
    expect(group.lineIndex).toEqual(0);
    expect(group.offsetX).toEqual(0.0);
    expect(group.offsetY).toEqual(0.0);
    expect(group.width).toEqual(0.0);
    expect(group.positions.length === 0).toBe(true);
  });
  it('returns a new object each call', () => {
    const format = formatRef(emptyTextFormat());
    const first = createTextLayoutGroup(format);
    let second = createTextLayoutGroup(format);
    second.width = 1.0;
    expect(first.width).toEqual(0.0);
    expect(second.width).toEqual(1.0);
  });
  it('retains the required format and accepts assigned indices without replacing identity', () => {
    const format = formatRef(emptyTextFormat());
    let group = createTextLayoutGroup(format);
    group.startIndex = 3;
    group.endIndex = 10;
    expect(group.format === format).toBe(true);
    expect(group.startIndex).toEqual(3);
    expect(group.endIndex).toEqual(10);
  });
});

describe('initializeTextLayoutGroup', () => {
  it('is the construction initializer of create text layout group', () => {
    const second = formatRef(emptyTextFormat());
    let out = createTextLayoutGroup(formatRef(emptyTextFormat()));
    out.positions.push(3.0);
    initializeTextLayoutGroup(out, second);
    expect([out.startIndex, out.endIndex]).toEqual([0, 0]);
    out.startIndex = 4;
    out.endIndex = 9;
    expect([out.startIndex, out.endIndex]).toEqual([4, 9]);
    expect(out.format === second).toBe(true);
    expect(out.positions.length === 0).toBe(true);
  });
});
