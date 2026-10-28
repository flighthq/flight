// Generated from crates/flight-textformat/tests/text_format_range_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { createTextFormatRange, initializeTextFormatRange } from './contract.ts';

import type { TextFormat } from './contract.ts';

import * as flightEntity from '@flighthq/entity/contract';

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

describe('createTextFormatRange', () => {
  it('creates a range with the given fields', () => {
    let fields = emptyTextFormat();
    fields.size = 16.0;
    fields.bold = true;
    const format = fields;
    const range = createTextFormatRange(format, 0, 10);
    expect([range.start, range.end]).toEqual([0, 10]);
    expect(range.format === format).toBe(true);
    expect(range.format!.size).toEqual(16.0);
    expect(range.format!.bold).toEqual(true);
  });
  it('retains the callers format object and later edits', () => {
    const format = emptyTextFormat();
    const range = createTextFormatRange(format, 0, 1);
    format!.bold = false;
    expect(range.format!.bold).toEqual(false);
    expect(range.format === format).toBe(true);
  });
  it('preserves utf16 offsets across a surrogate pair', () => {
    const format = emptyTextFormat();
    const range = createTextFormatRange(format, 1, 3);
    const units: number[] = Array.from({ length: 'a😀b'.length }, (_, index) => 'a😀b'.charCodeAt(index));
    expect(units.slice(range.start, range.end)).toEqual([55357, 56832]);
    expect([range.start, range.end]).toEqual([1, 3]);
  });
  it('allocates independent range entity identities', () => {
    const format = emptyTextFormat();
    let first = createTextFormatRange(format, 0, 1);
    let second = createTextFormatRange(format, 0, 1);
    expect(flightEntity.getEntityUid(first)).not.toEqual(flightEntity.getEntityUid(second));
  });
});

describe('initializeTextFormatRange', () => {
  it('copies fields without normalizing', () => {
    const original = emptyTextFormat();
    let range = createTextFormatRange(original, 0, 10);
    const replacement = emptyTextFormat();
    initializeTextFormatRange(range, replacement, 9, 2);
    expect([range.start, range.end]).toEqual([9, 2]);
    expect(range.format === replacement).toBe(true);
  });
  it('preserves the entity slot', () => {
    const original = emptyTextFormat();
    let range = createTextFormatRange(original, 0, 10);
    flightEntity.setEntityUid(range, String('existing-range'));
    const replacement = emptyTextFormat();
    initializeTextFormatRange(range, replacement, 9, 2);
    expect(flightEntity.getEntityUid(range)).toEqual('existing-range');
  });
});
