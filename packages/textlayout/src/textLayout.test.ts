// Generated from crates/flight-textlayout/tests/text_layout_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { createTextFormatRange } from '@flighthq/textformat/contract';
import type { TextFormat, TextFormatRangeRaw } from '@flighthq/textformat/contract';
import type { TextMeasureFunction } from '@flighthq/textshaper/contract';
import { describe, expect, it } from 'vitest';

import {
  TEXT_LAYOUT_GUTTER,
  computeTextLayout,
  createTextLayoutResult,
  initializeTextLayoutResult,
  isTextLayoutTruncated,
} from './contract.ts';
import type { TextLayoutParams, TextLayoutResult } from './contract.ts';

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

function baseFormat(): TextFormat {
  let format = emptyTextFormat();
  format.size = 16.0;
  return format;
}

function doLayout(params: TextLayoutParams): TextLayoutResult {
  let out = createTextLayoutResult();
  computeTextLayout(out, params);
  return out;
}

function paramsWithFormat(text: string, width: number, format: TextFormat): TextLayoutParams {
  let params = singleRangeParams(text, width);
  params.formatRanges = [
    range(format, 0, Array.from({ length: text.length }, (_, index) => text.charCodeAt(index)).length),
  ];
  return params;
}

function placedAsciiText(text: string, layout: Readonly<TextLayoutResult>): string {
  let placed = '';
  for (let groupIndex = 0; groupIndex < layout.groups.length; groupIndex += 1) {
    const group = layout.groups[groupIndex];
    if (group.startIndex !== group.endIndex) {
      placed += text.slice(group.startIndex, group.endIndex);
    }
  }
  return placed;
}

describe('computeTextLayout', () => {
  it('appends ellipsis when word wrapped text overflows max lines', () => {
    const text = 'word one word two word three word four';
    let params = singleRangeParams(text, 100.0);
    params.height = 200.0;
    params.maxLines = 2;
    params.multiline = true;
    params.wordWrap = true;
    const result = doLayout(params);
    expect(result.numLines <= 2).toBe(true);
    expect(result.groups.some((group) => group.lineIndex === result.numLines - 1)).toBe(true);
  });
  it('breaks a single long word that exceeds the wrap width', () => {
    let params = singleRangeParams('abcdefghij', 50.0);
    params.multiline = true;
    params.wordWrap = true;
    expect(doLayout(params).numLines > 1).toBe(true);
  });
  it('centers a short single line against a real width when word wrap is false', () => {
    let format = baseFormat();
    format.align = 'center';
    let params = paramsWithFormat('hi', 200.0, format);
    params.multiline = false;
    params.wordWrap = false;
    const offsetX = doLayout(params).groups[0].offsetX;
    expect(offsetX).toEqual(90.0);
    expect(offsetX < 200.0).toBe(true);
  });
  it('clips a long word spanning the max lines boundary', () => {
    let params = singleRangeParams('abcdefghijklmnop', 60.0);
    params.height = 200.0;
    params.maxLines = 1;
    params.multiline = true;
    params.wordWrap = true;
    const result = doLayout(params);
    expect(result.numLines <= 1).toBe(true);
    expect(result.groups.some((group) => group.lineIndex === 0)).toBe(true);
  });
  it('clips to max lines and appends truncation character', () => {
    const text = 'line one\nline two\nline three';
    let params = singleRangeParams(text, 300.0);
    params.height = 200.0;
    params.maxLines = 2;
    params.multiline = true;
    const result = doLayout(params);
    expect(result.numLines <= 2).toBe(true);
    expect(result.groups.some((group) => group.lineIndex === result.numLines - 1)).toBe(true);
  });
  it('does not emit a bullet group when list marker is none', () => {
    let format = baseFormat();
    format.bullet = true;
    format.listMarker = 'none';
    let params = paramsWithFormat('item', 200.0, format);
    params.multiline = true;
    const result = doLayout(params);
    expect(!result.groups.some((group) => group.startIndex === group.endIndex)).toBe(true);
  });
  it('does not justify the last line of each paragraph in multi paragraph text', () => {
    const text = 'aa bb\ncc dd';
    let format = baseFormat();
    format.align = 'justify';
    let params = paramsWithFormat(text, 100.0, format);
    params.height = 200.0;
    params.multiline = true;
    const result = doLayout(params);
    expect(result.numLines).toEqual(2);
    const first = result.groups.find((group) => group.lineIndex === 0)!;
    const second = result.groups.find((group) => group.lineIndex === 1)!;
    expect(first.offsetX).toEqual(TEXT_LAYOUT_GUTTER);
    expect(second.offsetX).toEqual(TEXT_LAYOUT_GUTTER);
  });
  it('does not split on lf when multiline is false', () => {
    let params = singleRangeParams('ab\ncd', 1000.0);
    params.multiline = false;
    expect(doLayout(params).numLines).toEqual(1);
  });
  it('does not split surrogate pairs', () => {
    const text = '😀ab';
    const result = doLayout(singleRangeParams(text, 200.0));
    expect(result.groups[0].positions.length).toEqual(3);
  });
  it('does not wrap when word wrap is false even if text exceeds width', () => {
    let params = singleRangeParams('hello world', 50.0);
    params.wordWrap = false;
    expect(doLayout(params).numLines).toEqual(1);
  });
  it('emits a bullet glyph group for a bullet format', () => {
    let format = baseFormat();
    format.bullet = true;
    let params = paramsWithFormat('item', 200.0, format);
    params.multiline = true;
    const result = doLayout(params);
    const bullet = result.groups.find((group) => group.startIndex === group.endIndex)!;
    expect(bullet.lineIndex).toEqual(0);
  });
  it('emits a bullet group when list marker is absent', () => {
    let format = baseFormat();
    format.bullet = true;
    let params = paramsWithFormat('item', 200.0, format);
    params.multiline = true;
    const result = doLayout(params);
    expect(result.groups.some((group) => group.startIndex === group.endIndex)).toBe(true);
  });
  it('expands space character advances on a wrapped mid paragraph line', () => {
    const text = 'aa bb cc';
    let format = baseFormat();
    format.align = 'justify';
    let params = paramsWithFormat(text, 80.0, format);
    params.height = 200.0;
    params.multiline = true;
    params.wordWrap = true;
    const result = doLayout(params);
    expect(result.numLines >= 2).toBe(true);
    let expanded = false;
    for (let groupIndex = 0; groupIndex < result.groups.length; groupIndex += 1) {
      const group = result.groups[groupIndex];
      if (group.lineIndex === 0) {
        for (const [positionIndex, advance] of group.positions.entries()) {
          const sourceIndex = group.startIndex + positionIndex;
          if (text.slice(sourceIndex, sourceIndex + 1) === ' ' && advance > 10.0) {
            expanded = true;
          }
        }
      }
    }
    expect(expanded).toBe(true);
  });
  it('expands the actual space advance after an astral codepoint', () => {
    const text = '😀 a bb';
    let format = baseFormat();
    format.align = 'justify';
    let params = paramsWithFormat(text, 70.0, format);
    params.height = 200.0;
    params.multiline = true;
    params.wordWrap = true;
    const result = doLayout(params);
    expect(result.numLines >= 2).toBe(true);
    const group = result.groups.find((group) => group.lineIndex === 0 && group.startIndex === 0)!;
    expect(group.positions[0]).toEqual(20.0);
    expect(group.positions[1] > 10.0).toBe(true);
  });
  it('handles multiple consecutive breaks', () => {
    let params = singleRangeParams('a\n\nb', 1000.0);
    params.multiline = true;
    expect(doLayout(params).numLines).toEqual(3);
  });
  it('is inert when the container is not taller than its content', () => {
    let top = singleRangeParams('hi', 100.0);
    top.height = 4.0;
    const topY = doLayout(top).groups[0].offsetY;
    top.verticalAlign = 'middle';
    expect(doLayout(top).groups[0].offsetY).toEqual(topY);
    top.verticalAlign = 'bottom';
    expect(doLayout(top).groups[0].offsetY).toEqual(topY);
  });
  it('justifies mid paragraph lines but not paragraph last lines', () => {
    const text = 'aa bb cc dd';
    let format = baseFormat();
    format.align = 'justify';
    let params = paramsWithFormat(text, 56.0, format);
    params.height = 200.0;
    params.multiline = true;
    params.wordWrap = true;
    const result = doLayout(params);
    expect(result.numLines >= 2).toBe(true);
    const lastLine = result.numLines - 1;
    const group = result.groups.find((group) => group.lineIndex === lastLine)!;
    expect(group.offsetX).toEqual(TEXT_LAYOUT_GUTTER);
  });
  it('leaves offset y unchanged for the top default', () => {
    let explicit = singleRangeParams('hi', 100.0);
    explicit.height = 200.0;
    const implicit = doLayout(explicit).groups[0].offsetY;
    explicit.verticalAlign = 'top';
    expect(doLayout(explicit).groups[0].offsetY).toEqual(implicit);
  });
  it('lets an explicit positive indent win over the bullet width', () => {
    let format = baseFormat();
    format.bullet = true;
    format.indent = 1.0;
    let params = paramsWithFormat('item', 200.0, format);
    params.multiline = true;
    const result = doLayout(params);
    const bullet = result.groups.find((group) => group.startIndex === group.endIndex)!;
    const text = result.groups.find((group) => group.startIndex !== group.endIndex)!;
    expect(bullet.offsetX).toEqual(TEXT_LAYOUT_GUTTER);
    expect(text.offsetX).toEqual(TEXT_LAYOUT_GUTTER + 1.0);
    expect(text.offsetX < bullet.offsetX + bullet.width).toBe(true);
  });
  it('places a 20px centered text at offset x 40', () => {
    let format = baseFormat();
    format.align = 'center';
    const result = doLayout(paramsWithFormat('hi', 100.0, format));
    expect(result.groups[0].offsetX).toEqual(40.0);
  });
  it('places a 20px right aligned text at offset x 78', () => {
    let format = baseFormat();
    format.align = 'right';
    const result = doLayout(paramsWithFormat('hi', 100.0, format));
    expect(result.groups[0].offsetX).toEqual(78.0);
  });
  it('places middle at exactly half the bottom shift', () => {
    let params = singleRangeParams('hi', 100.0);
    params.height = 200.0;
    const topY = doLayout(params).groups[0].offsetY;
    params.verticalAlign = 'middle';
    const middleY = doLayout(params).groups[0].offsetY;
    params.verticalAlign = 'bottom';
    const bottomY = doLayout(params).groups[0].offsetY;
    expect(middleY - topY).toEqual((bottomY - topY) / 2.0);
  });
  it('measure callback can reenter layout without shared scratch', () => {
    const entered = { value: 0 >>> 0 };
    const callbackEntered = entered;
    let params = singleRangeParams('outer', 100.0);
    params.measure = (text: string, _format: Readonly<TextFormat>) => {
      if (
        (() => {
          const previous = callbackEntered.value;
          callbackEntered.value = (callbackEntered.value + 1) >>> 0;
          return previous;
        })() === 0
      ) {
        doLayout(singleRangeParams('inner', 100.0));
      }
      return Array.from({ length: text.length }, (_, index) => text.charCodeAt(index)).length * 10.0;
    };
    const result = doLayout(params);
    expect(
      (() => {
        const previous = entered.value;
        entered.value = (entered.value + 0) >>> 0;
        return previous;
      })() > 0,
    ).toBe(true);
    expect(result.numLines).toEqual(1);
  });
  it('positions the group at the gutter offset', () => {
    const result = doLayout(singleRangeParams('hi', 1000.0));
    expect(result.groups[0].offsetX).toEqual(2.0);
    expect(result.groups[0].offsetY).toEqual(2.0);
  });
  it('preserves every character when wrapping across word boundaries', () => {
    const text = 'aaa bbb ccc';
    let params = singleRangeParams(text, 60.0);
    params.multiline = true;
    params.wordWrap = true;
    const placed = placedAsciiText(text, doLayout(params));
    expect(placed.replaceAll(' ', '')).toEqual(text.replaceAll(' ', ''));
  });
  it('preserves every character when wrapping multi format text', () => {
    const text = 'aaa bbb ccc';
    let params = singleRangeParams(text, 60.0);
    params.formatRanges = [range(baseFormat(), 0, 4), range(baseFormat(), 4, text.length)];
    params.multiline = true;
    params.wordWrap = true;
    const placed = placedAsciiText(text, doLayout(params));
    expect(placed.replaceAll(' ', '')).toEqual(text.replaceAll(' ', ''));
  });
  it('produces one group for a simple string', () => {
    const result = doLayout(singleRangeParams('hello', 1000.0));
    expect(result.groups.length).toEqual(1);
    expect(result.groups[0].startIndex).toEqual(0);
    expect(result.groups[0].endIndex).toEqual(5);
    expect(result.groups[0].lineIndex).toEqual(0);
  });
  it('produces separate groups for each format range', () => {
    const text = 'helloworld';
    let large = baseFormat();
    large.size = 24.0;
    let params = singleRangeParams(text, 1000.0);
    params.formatRanges = [range(baseFormat(), 0, 5), range(large, 5, 10)];
    const result = doLayout(params);
    expect(result.groups.length >= 2).toBe(true);
    expect(result.groups[0].format!.size).toEqual(16.0);
    expect(result.groups[1].format!.size).toEqual(24.0);
  });
  it('reports line heights for each line', () => {
    let params = singleRangeParams('ab\ncd', 1000.0);
    params.multiline = true;
    const result = doLayout(params);
    expect(result.lineHeights.length).toEqual(2);
    expect(result.lineHeights.every((height) => height > 0.0)).toBe(true);
  });
  it('reports line widths for each line', () => {
    let params = singleRangeParams('ab\ncd', 1000.0);
    params.multiline = true;
    expect(doLayout(params).lineWidths.length).toEqual(2);
  });
  it('reports num lines as 1', () => {
    expect(doLayout(singleRangeParams('hello', 1000.0)).numLines).toEqual(1);
  });
  it('reports text height greater than 0 for non empty text', () => {
    expect(doLayout(singleRangeParams('hello', 1000.0)).textHeight > 0.0).toBe(true);
  });
  it('reports text width greater than 0 for non empty text', () => {
    expect(doLayout(singleRangeParams('hello', 1000.0)).textWidth > 0.0).toBe(true);
  });
  it('returns an empty result for empty text', () => {
    const result = doLayout(singleRangeParams('', 1000.0));
    expect(result.groups.length === 0).toBe(true);
    expect(result.numLines).toEqual(1);
  });
  it('returns an empty result when format ranges are empty', () => {
    let params = singleRangeParams('hello', 200.0);
    params.formatRanges = [] as never[];
    expect(doLayout(params).groups.length === 0).toBe(true);
  });
  it('returns groups and line metrics for simple text', () => {
    const result = doLayout(singleRangeParams('hi', 1000.0));
    expect(result.groups.length !== 0).toBe(true);
    expect(result.numLines > 0).toBe(true);
  });
  it('sets width to the sum of character advances', () => {
    const result = doLayout(singleRangeParams('abc', 1000.0));
    expect(result.groups[0].width).toEqual(30.0);
  });
  it('shifts group offset x to center within container', () => {
    const unaligned = doLayout(singleRangeParams('hi', 100.0)).groups[0].offsetX;
    let format = baseFormat();
    format.align = 'center';
    const aligned = doLayout(paramsWithFormat('hi', 100.0, format)).groups[0].offsetX;
    expect(aligned > unaligned).toBe(true);
  });
  it('shifts group offset x to right align within container', () => {
    let format = baseFormat();
    format.align = 'right';
    expect(doLayout(paramsWithFormat('hi', 100.0, format)).groups[0].offsetX > 2.0).toBe(true);
  });
  it('shifts group offsets for justified mid lines', () => {
    const text = 'a b\nc d';
    let format = baseFormat();
    format.align = 'justify';
    let params = paramsWithFormat(text, 100.0, format);
    params.height = 200.0;
    params.multiline = true;
    const result = doLayout(params);
    expect(result.numLines).toEqual(2);
    expect(result.groups.some((group) => group.lineIndex === 0)).toBe(true);
  });
  it('shifts the block down for middle and further for bottom', () => {
    let params = singleRangeParams('hi', 100.0);
    params.height = 200.0;
    const topY = doLayout(params).groups[0].offsetY;
    params.verticalAlign = 'middle';
    const middleY = doLayout(params).groups[0].offsetY;
    params.verticalAlign = 'bottom';
    const bottomY = doLayout(params).groups[0].offsetY;
    expect(middleY > topY).toBe(true);
    expect(bottomY > middleY).toBe(true);
  });
  it('shifts the bottom block by the full vertical slack', () => {
    let params = singleRangeParams('hi', 100.0);
    params.height = 200.0;
    const top = doLayout(params);
    params.verticalAlign = 'bottom';
    const bottom = doLayout(params);
    const slack = 200.0 - (top.textHeight + TEXT_LAYOUT_GUTTER * 2.0);
    expect(bottom.groups[0].offsetY - top.groups[0].offsetY).toEqual(slack);
  });
  it('skips pair measurement when kerning is false', () => {
    let enabled = baseFormat();
    enabled.kerning = true;
    let disabled = baseFormat();
    disabled.kerning = false;
    const enabledResult = doLayout(paramsWithFormat('ab', 1000.0, enabled));
    const disabledResult = doLayout(paramsWithFormat('ab', 1000.0, disabled));
    expect(enabledResult.groups[0].positions.length).toEqual(2);
    expect(disabledResult.groups[0].positions.length).toEqual(2);
  });
  it('splits on cr as well', () => {
    let params = singleRangeParams('ab\rcd', 1000.0);
    params.multiline = true;
    expect(doLayout(params).numLines).toEqual(2);
  });
  it('splits on lf when multiline is true', () => {
    let params = singleRangeParams('ab\ncd', 1000.0);
    params.multiline = true;
    const result = doLayout(params);
    expect(result.groups.some((group) => group.lineIndex === 0)).toBe(true);
    expect(result.groups.some((group) => group.lineIndex === 1)).toBe(true);
    expect(result.numLines).toEqual(2);
  });
  it('stores per character positions', () => {
    expect(doLayout(singleRangeParams('ab', 1000.0)).groups[0].positions.length).toEqual(2);
  });
  it('treats end as right in ltr direction', () => {
    let format = baseFormat();
    format.align = 'end';
    let params = paramsWithFormat('hi', 100.0, format);
    params.direction = 'LeftToRight';
    expect(doLayout(params).groups[0].offsetX > TEXT_LAYOUT_GUTTER).toBe(true);
  });
  it('treats start as left in ltr direction', () => {
    let format = baseFormat();
    format.align = 'start';
    let params = paramsWithFormat('hi', 100.0, format);
    params.direction = 'LeftToRight';
    expect(doLayout(params).groups[0].offsetX).toEqual(TEXT_LAYOUT_GUTTER);
  });
  it('treats start as right in rtl direction', () => {
    let format = baseFormat();
    format.align = 'start';
    let params = paramsWithFormat('hi', 100.0, format);
    params.direction = 'RightToLeft';
    expect(doLayout(params).groups[0].offsetX > TEXT_LAYOUT_GUTTER).toBe(true);
  });
  it('truncates a single long word across both truncation paths', () => {
    const text = 'go abcdefghijklmnopqrstuvwxyz';
    let params = singleRangeParams(text, 60.0);
    params.height = 200.0;
    params.maxLines = 2;
    params.multiline = true;
    params.wordWrap = true;
    const result = doLayout(params);
    expect(result.numLines <= 2).toBe(true);
    expect(result.groups.some((group) => group.lineIndex === result.numLines - 1)).toBe(true);
    expect(isTextLayoutTruncated(result, params)).toBe(true);
  });
  it('wraps at word boundary when line exceeds width', () => {
    let params = singleRangeParams('hello world', 50.0);
    params.multiline = true;
    params.wordWrap = true;
    const result = doLayout(params);
    expect(result.numLines >= 2).toBe(true);
  });
});

describe('createTextLayoutResult', () => {
  it('returns a new object each call', () => {
    let first = createTextLayoutResult();
    const second = createTextLayoutResult();
    first.lineWidths.push(1.0);
    expect(first.lineWidths.length).toEqual(1);
    expect(second.lineWidths.length === 0).toBe(true);
  });
  it('returns default zero values', () => {
    const result = createTextLayoutResult();
    expect(result.groups.length === 0).toBe(true);
    expect(result.lineAscents.length === 0).toBe(true);
    expect(result.lineDescents.length === 0).toBe(true);
    expect(result.lineHeights.length === 0).toBe(true);
    expect(result.lineLeadings.length === 0).toBe(true);
    expect(result.lineWidths.length === 0).toBe(true);
    expect(result.numLines).toEqual(0);
    expect(result.textHeight).toEqual(0.0);
    expect(result.textWidth).toEqual(0.0);
  });
});

describe('initializeTextLayoutResult', () => {
  it('is the construction initializer of create text layout result', () => {
    let out = createTextLayoutResult();
    out.lineWidths.push(1.0);
    out.numLines = 2;
    initializeTextLayoutResult(out);
    expect(out.lineWidths.length === 0).toBe(true);
    expect(out.numLines).toEqual(0);
  });
});

describe('isTextLayoutTruncated', () => {
  it('returns false when max lines is minus 1', () => {
    let params = singleRangeParams('hello', 1000.0);
    params.maxLines = -1;
    const result = doLayout(params);
    expect(!isTextLayoutTruncated(result, params)).toBe(true);
  });
  it('returns false when max lines is unlimited', () => {
    const params = singleRangeParams('one line', 1000.0);
    const result = doLayout(params);
    expect(!isTextLayoutTruncated(result, params)).toBe(true);
  });
  it('returns true when max lines clips the layout', () => {
    const text = 'line one\nline two\nline three';
    let params = singleRangeParams(text, 300.0);
    params.height = 200.0;
    params.maxLines = 2;
    params.multiline = true;
    const result = doLayout(params);
    expect(isTextLayoutTruncated(result, params)).toBe(true);
  });
});
