// Generated from crates/flight-textsegment/tests/types_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import {
  getTextSegmentGranularityString,
  getTextSegmenterKindString,
  parseTextSegmentGranularity,
  parseTextSegmenterKind,
} from '@flighthq/textsegment/contract';
import { describe, expect, it } from 'vitest';

import { TextSegmentGranularity, TextSegmenterKind } from './contract.ts';

describe('getTextSegmenterKindString', () => {
  it('returns the exact ts strings', () => {
    expect(getTextSegmenterKindString(TextSegmenterKind.Custom)).toEqual('custom');
    expect(getTextSegmenterKindString(TextSegmenterKind.WebIntl)).toEqual('web-intl');
  });
});

describe('getTextSegmentGranularityString', () => {
  it('returns the exact ts strings', () => {
    expect(getTextSegmentGranularityString(TextSegmentGranularity.Grapheme)).toEqual('grapheme');
    expect(getTextSegmentGranularityString(TextSegmentGranularity.Word)).toEqual('word');
    expect(getTextSegmentGranularityString(TextSegmentGranularity.Sentence)).toEqual('sentence');
  });
});

describe('parseTextSegmenterKind', () => {
  it('parses the exact ts strings', () => {
    expect(parseTextSegmenterKind('custom')).toEqual(TextSegmenterKind.Custom);
    expect(parseTextSegmenterKind('web-intl')).toEqual(TextSegmenterKind.WebIntl);
  });
  it('rejects other text and wrong casing', () => {
    expect(parseTextSegmenterKind('Custom')).toEqual(undefined);
    expect(parseTextSegmenterKind('web_intl')).toEqual(undefined);
    expect(parseTextSegmenterKind('')).toEqual(undefined);
  });
});

describe('parseTextSegmentGranularity', () => {
  it('parses the exact ts strings', () => {
    expect(parseTextSegmentGranularity('grapheme')).toEqual(TextSegmentGranularity.Grapheme);
    expect(parseTextSegmentGranularity('word')).toEqual(TextSegmentGranularity.Word);
    expect(parseTextSegmentGranularity('sentence')).toEqual(TextSegmentGranularity.Sentence);
  });
  it('rejects other text and wrong casing', () => {
    expect(parseTextSegmentGranularity('Grapheme')).toEqual(undefined);
    expect(parseTextSegmentGranularity('line')).toEqual(undefined);
    expect(parseTextSegmentGranularity('')).toEqual(undefined);
  });
});
