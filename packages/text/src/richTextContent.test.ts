// Generated from crates/flight-text/tests/rich_text_content_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { createRichTextData } from '@flighthq/text/contract';
import type { RichTextData } from '@flighthq/text/contract';
import { createTextFormatRange } from '@flighthq/textformat/contract';
import type { TextFormat, TextFormatRangeRaw } from '@flighthq/textformat/contract';
import { createRichTextContent, createTextLayoutResult } from '@flighthq/textlayout/contract';
import type { TextLayoutResult } from '@flighthq/textlayout/contract';
import { describe, expect, it } from 'vitest';

import { clearRichTextContent, computeRichTextContent, createRichTextRuntime, getRichTextContent } from './contract.ts';

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

describe('clearRichTextContent', () => {
  it('clears the attached content', () => {
    let runtime = createRichTextRuntime();
    getRichTextContent(runtime);
    clearRichTextContent(runtime);
    expect(runtime.richTextContent === undefined).toBe(true);
  });
});

describe('computeRichTextContent', () => {
  it('applies serialized text format ranges over plain text', () => {
    let content = createRichTextContent();
    let data = richTextData();
    data.text = 'hello';
    let italic = emptyTextFormat();
    italic.italic = true;
    data.textFormatRanges = [formatRange(italic, 1, 4)];
    computeRichTextContent(content, data, undefined);
    const ranges: Array<readonly [number, number, boolean | undefined]> = content.formatRanges.map((range) => [
      range.start,
      range.end,
      range.format!.italic,
    ]);
    expect(ranges).toEqual([
      [0, 1, undefined],
      [1, 4, true],
      [4, 5, undefined],
    ]);
  });
  it('condenses whitespace', () => {
    let content = createRichTextContent();
    let data = richTextData();
    data.condenseWhite = true;
    data.text = '  A \n\t B  ';
    computeRichTextContent(content, data, undefined);
    expect(content.text).toEqual('A B ');
  });
  it('decodes entities in plain text', () => {
    let content = createRichTextContent();
    let data = richTextData();
    data.text = 'A&amp;B';
    computeRichTextContent(content, data, undefined);
    expect(content.text).toEqual('A&B');
  });
  it('falls back to the bullet mask when the password character is empty', () => {
    let content = createRichTextContent();
    let data = richTextData();
    data.text = 'ab';
    computeRichTextContent(content, data, '');
    expect(content.text).toEqual('••');
  });
  it('honors max chars', () => {
    let content = createRichTextContent();
    let data = richTextData();
    data.maxChars = 7;
    data.text = 'Hello world';
    computeRichTextContent(content, data, undefined);
    expect(content.text).toEqual('Hello w');
    const lastRangeIndex = content.formatRanges.length - 1;
    expect(content.formatRanges[lastRangeIndex].end).toEqual(7);
  });
  it('masks every character when a password character is supplied', () => {
    let content = createRichTextContent();
    let data = richTextData();
    data.text = 'secret';
    computeRichTextContent(content, data, '*');
    expect(content.text).toEqual('******');
  });
  it('merges serialized text format ranges over the base format', () => {
    let content = createRichTextContent();
    let data = richTextData();
    data.text = 'hello';
    data.textColor = 0x0000_00ff;
    let color = emptyTextFormat();
    color.color = 0xff00_00ff;
    data.textFormatRanges = [formatRange(color, 1, 4)];
    computeRichTextContent(content, data, undefined);
    expect(content.formatRanges[1].format!.color).toEqual(0xff00_00ff);
  });
  it('renders plain text under the base format', () => {
    let content = createRichTextContent();
    let data = richTextData();
    data.text = 'hello';
    data.textColor = 0x3366_99ff;
    computeRichTextContent(content, data, undefined);
    expect(content.text).toEqual('hello');
    expect(content.formatRanges.length).toEqual(1);
    expect(content.formatRanges[0].format!.color).toEqual(0x3366_99ff);
  });
});

describe('getRichTextContent', () => {
  it('attaches reusable content to runtime state', () => {
    let runtime = createRichTextRuntime();
    const content = getRichTextContent(runtime);
    expect(runtime.richTextContent! === content).toBe(true);
    expect(getRichTextContent(runtime) === content).toBe(true);
  });
});
