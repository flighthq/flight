// Generated from crates/flight-textformat/tests/text_format_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { TextFormat } from '@flighthq/textformat/contract';
import { describe, expect, it } from 'vitest';

import {
  FontVariationWeight,
  FontVariationWidth,
  getTextFormatAlignString,
  getTextFormatAscent,
  getTextFormatDescent,
  getTextFormatHeight,
  getTextFormatLeading,
  getTextFormatListMarkerString,
  mergeTextFormat,
  parseTextFormatAlign,
  parseTextFormatListMarker,
} from './contract.ts';
import type { FontVariation } from './contract.ts';

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

describe('getTextFormatAlignString', () => {
  it('returns each exact source literal', () => {
    expect(getTextFormatAlignString('center')).toEqual('center');
    expect(getTextFormatAlignString('end')).toEqual('end');
    expect(getTextFormatAlignString('justify')).toEqual('justify');
    expect(getTextFormatAlignString('left')).toEqual('left');
    expect(getTextFormatAlignString('right')).toEqual('right');
    expect(getTextFormatAlignString('start')).toEqual('start');
  });
});

describe('getTextFormatAscent', () => {
  it('returns 12 when size is absent', () => {
    expect(getTextFormatAscent(emptyTextFormat())).toEqual(12.0);
  });
  it('returns size when specified', () => {
    let format = emptyTextFormat();
    format.size = 24.0;
    expect(getTextFormatAscent(format)).toEqual(24.0);
  });
});

describe('getTextFormatDescent', () => {
  it('returns descent proportional to size', () => {
    let format = emptyTextFormat();
    format.size = 100.0;
    expect(getTextFormatDescent(format)).toEqual(18.5);
  });
  it('uses default size when absent', () => {
    expect(getTextFormatDescent(emptyTextFormat())).toEqual(12.0 * 0.185);
  });
});

describe('getTextFormatHeight', () => {
  it('sums ascent descent and leading', () => {
    let format = emptyTextFormat();
    format.size = 10.0;
    format.leading = 4.0;
    expect(getTextFormatHeight(format)).toEqual(10.0 + 10.0 * 0.185 + 4.0);
  });
  it('treats absent leading as zero', () => {
    let format = emptyTextFormat();
    format.size = 10.0;
    expect(getTextFormatHeight(format)).toEqual(10.0 + 10.0 * 0.185);
  });
});

describe('getTextFormatLeading', () => {
  it('returns 0 when absent', () => {
    expect(getTextFormatLeading(emptyTextFormat())).toEqual(0.0);
  });
  it('returns leading when specified', () => {
    let format = emptyTextFormat();
    format.leading = 6.0;
    expect(getTextFormatLeading(format)).toEqual(6.0);
  });
});

describe('getTextFormatListMarkerString', () => {
  it('returns each exact source literal', () => {
    expect(getTextFormatListMarkerString('circle')).toEqual('circle');
    expect(getTextFormatListMarkerString('decimal')).toEqual('decimal');
    expect(getTextFormatListMarkerString('disc')).toEqual('disc');
    expect(getTextFormatListMarkerString('none')).toEqual('none');
    expect(getTextFormatListMarkerString('square')).toEqual('square');
  });
});

describe('mergeTextFormat', () => {
  it('applies non null override fields onto base', () => {
    let base = emptyTextFormat();
    base.size = 12.0;
    base.bold = false;
    let overrides = emptyTextFormat();
    overrides.bold = true;
    overrides.color = 0xff0000ff;
    const result = mergeTextFormat(base, overrides);
    expect(result.size).toEqual(12.0);
    expect(result.bold).toEqual(true);
    expect(result.color).toEqual(0xff0000ff);
  });
  it('does not mutate the base object', () => {
    let base = emptyTextFormat();
    base.size = 12.0;
    let overrides = emptyTextFormat();
    overrides.size = 24.0;
    mergeTextFormat(base, overrides);
    expect(base.size).toEqual(12.0);
  });
  it('skips absent override fields', () => {
    let base = emptyTextFormat();
    base.size = 12.0;
    const result = mergeTextFormat(base, emptyTextFormat());
    expect(result.size).toEqual(12.0);
    expect(result.bold).toEqual(undefined);
  });
  it('clones tab stops from both base and override', () => {
    let base = emptyTextFormat();
    base.tabStops = [8.0];
    base.variations = [{ axis: String(FontVariationWeight), value: 400.0 }];
    let fromBase = mergeTextFormat(base, emptyTextFormat());
    fromBase.tabStops![0] = 12.0;
    expect(base.tabStops).toEqual([8.0]);
    expect(base.variations! === fromBase.variations!).toBe(true);
    let overrides = emptyTextFormat();
    overrides.tabStops = [16.0];
    let fromOverride = mergeTextFormat(base, overrides);
    fromOverride.tabStops![0] = 20.0;
    expect(overrides.tabStops).toEqual([16.0]);
  });
});

describe('parseTextFormatAlign', () => {
  it('accepts every literal and rejects non source spellings', () => {
    expect(parseTextFormatAlign('center')).toEqual('center');
    expect(parseTextFormatAlign('end')).toEqual('end');
    expect(parseTextFormatAlign('justify')).toEqual('justify');
    expect(parseTextFormatAlign('left')).toEqual('left');
    expect(parseTextFormatAlign('right')).toEqual('right');
    expect(parseTextFormatAlign('start')).toEqual('start');
    expect(parseTextFormatAlign('')).toEqual(undefined);
    expect(parseTextFormatAlign('CENTER')).toEqual(undefined);
    expect(parseTextFormatAlign(' center')).toEqual(undefined);
    expect(parseTextFormatAlign('start ')).toEqual(undefined);
    expect(parseTextFormatAlign('unknown')).toEqual(undefined);
  });
});

describe('parseTextFormatListMarker', () => {
  it('accepts every literal and rejects non source spellings', () => {
    expect(parseTextFormatListMarker('circle')).toEqual('circle');
    expect(parseTextFormatListMarker('decimal')).toEqual('decimal');
    expect(parseTextFormatListMarker('disc')).toEqual('disc');
    expect(parseTextFormatListMarker('none')).toEqual('none');
    expect(parseTextFormatListMarker('square')).toEqual('square');
    expect(parseTextFormatListMarker('')).toEqual(undefined);
    expect(parseTextFormatListMarker('CIRCLE')).toEqual(undefined);
    expect(parseTextFormatListMarker(' circle')).toEqual(undefined);
    expect(parseTextFormatListMarker('square ')).toEqual(undefined);
    expect(parseTextFormatListMarker('unknown')).toEqual(undefined);
  });
});

describe('textFormatFields', () => {
  it('preserves absence for every optional field', () => {
    const format = emptyTextFormat();
    expect(format.align === undefined).toBe(true);
    expect(format.blockIndent === undefined).toBe(true);
    expect(format.bold === undefined).toBe(true);
    expect(format.bullet === undefined).toBe(true);
    expect(format.color === undefined).toBe(true);
    expect(format.font === undefined).toBe(true);
    expect(format.indent === undefined).toBe(true);
    expect(format.italic === undefined).toBe(true);
    expect(format.kerning === undefined).toBe(true);
    expect(format.leading === undefined).toBe(true);
    expect(format.leftMargin === undefined).toBe(true);
    expect(format.letterSpacing === undefined).toBe(true);
    expect(format.listMarker === undefined).toBe(true);
    expect(format.rightMargin === undefined).toBe(true);
    expect(format.size === undefined).toBe(true);
    expect(format.strikethrough === undefined).toBe(true);
    expect(format.tabStops === undefined).toBe(true);
    expect(format.target === undefined).toBe(true);
    expect(format.underline === undefined).toBe(true);
    expect(format.url === undefined).toBe(true);
    expect(format.variations === undefined).toBe(true);
  });
  it('distinguishes absence from explicit false zero and empty values', () => {
    const absent = emptyTextFormat();
    let explicit = emptyTextFormat();
    explicit.bold = false;
    explicit.bullet = false;
    explicit.italic = false;
    explicit.kerning = false;
    explicit.strikethrough = false;
    explicit.underline = false;
    explicit.size = 0.0;
    explicit.blockIndent = 0.0;
    explicit.indent = 0.0;
    explicit.leading = 0.0;
    explicit.leftMargin = 0.0;
    explicit.rightMargin = 0.0;
    explicit.letterSpacing = 0.0;
    explicit.color = 0;
    explicit.font = '';
    explicit.target = '';
    explicit.url = '';
    explicit.tabStops = [];
    explicit.variations = [];
    explicit.align = 'start';
    explicit.listMarker = 'none';
    expect(explicit).not.toEqual(absent);
    expect(explicit.bold).toEqual(false);
    expect(explicit.kerning).toEqual(false);
    expect(explicit.size).toEqual(0.0);
    expect(explicit.color).toEqual(0);
    expect(explicit.font).toEqual('');
    expect(explicit.target).toEqual('');
    expect(explicit.url).toEqual('');
    expect(explicit.tabStops).toEqual([]);
    expect(explicit.variations).toEqual([]);
    expect(explicit.listMarker).toEqual('none');
  });
  it('keeps plain tab stop and variation order without deduplication', () => {
    let format = emptyTextFormat();
    format.tabStops = [24.0, 8.0, 24.0];
    format.variations = [
      { axis: String(FontVariationWeight), value: 400.0 },
      { axis: String(FontVariationWidth), value: 125.0 },
      { axis: String(FontVariationWeight), value: 450.0 },
    ];
    const stops: Readonly<number[]> = format.tabStops!;
    expect(stops).toEqual([24.0, 8.0, 24.0]);
    const variations = format.variations!;
    expect(variations[0].axis).toEqual('wght');
    expect(variations[1].axis).toEqual('wdth');
    expect(variations[2].axis).toEqual('wght');
    expect(variations[2].value).toEqual(450.0);
  });
  it('preserves the full packed rgba integer domain', () => {
    let format = emptyTextFormat();
    format.color = 0xf01020ff;
    const color: number = format.color!;
    expect(color >>> 24).toEqual(0xf0);
    expect(color & 0xff).toEqual(0xff);
    format.color = 0xffffffff;
    expect(format.color).toEqual(0xffff_ffff);
  });
});
