// Generated from crates/flight-path-boolean/tests/path_boolean_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  getPathBooleanExplanationOperationString,
  getPathBooleanExplanationReasonString,
  getPathOffsetEndString,
  getPathOffsetJoinString,
  parsePathBooleanExplanationOperation,
  parsePathBooleanExplanationReason,
  parsePathOffsetEnd,
  parsePathOffsetJoin,
} from './contract.ts';

describe('getPathBooleanExplanationOperationString', () => {
  it('returns the exact ts strings', () => {
    expect(getPathBooleanExplanationOperationString('offset')).toEqual('offset');
    expect(getPathBooleanExplanationOperationString('simplify')).toEqual('simplify');
  });
});

describe('getPathBooleanExplanationReasonString', () => {
  it('returns the exact ts strings', () => {
    expect(getPathBooleanExplanationReasonString('collapsed-or-degenerate')).toEqual('collapsed-or-degenerate');
    expect(getPathBooleanExplanationReasonString('empty-input')).toEqual('empty-input');
    expect(getPathBooleanExplanationReasonString('non-finite-delta')).toEqual('non-finite-delta');
  });
});

describe('getPathOffsetEndString', () => {
  it('returns the exact ts strings', () => {
    expect(getPathOffsetEndString('butt')).toEqual('butt');
    expect(getPathOffsetEndString('round')).toEqual('round');
    expect(getPathOffsetEndString('square')).toEqual('square');
  });
});

describe('getPathOffsetJoinString', () => {
  it('returns the exact ts strings', () => {
    expect(getPathOffsetJoinString('bevel')).toEqual('bevel');
    expect(getPathOffsetJoinString('miter')).toEqual('miter');
    expect(getPathOffsetJoinString('round')).toEqual('round');
    expect(getPathOffsetJoinString('square')).toEqual('square');
  });
});

describe('parsePathBooleanExplanationOperation', () => {
  it('parses the exact ts strings', () => {
    expect(parsePathBooleanExplanationOperation('offset')).toEqual('offset');
    expect(parsePathBooleanExplanationOperation('simplify')).toEqual('simplify');
  });
  it('rejects other text and wrong casing', () => {
    expect(parsePathBooleanExplanationOperation('OFFSET')).toEqual(undefined);
    expect(parsePathBooleanExplanationOperation('')).toEqual(undefined);
  });
});

describe('parsePathBooleanExplanationReason', () => {
  it('parses the exact ts strings', () => {
    expect(parsePathBooleanExplanationReason('collapsed-or-degenerate')).toEqual('collapsed-or-degenerate');
    expect(parsePathBooleanExplanationReason('empty-input')).toEqual('empty-input');
    expect(parsePathBooleanExplanationReason('non-finite-delta')).toEqual('non-finite-delta');
  });
  it('rejects other text and wrong casing', () => {
    expect(parsePathBooleanExplanationReason('COLLAPSED-OR-DEGENERATE')).toEqual(undefined);
    expect(parsePathBooleanExplanationReason('')).toEqual(undefined);
  });
});

describe('parsePathOffsetEnd', () => {
  it('parses the exact ts strings', () => {
    expect(parsePathOffsetEnd('butt')).toEqual('butt');
    expect(parsePathOffsetEnd('round')).toEqual('round');
    expect(parsePathOffsetEnd('square')).toEqual('square');
  });
  it('rejects other text and wrong casing', () => {
    expect(parsePathOffsetEnd('BUTT')).toEqual(undefined);
    expect(parsePathOffsetEnd('')).toEqual(undefined);
  });
});

describe('parsePathOffsetJoin', () => {
  it('parses the exact ts strings', () => {
    expect(parsePathOffsetJoin('bevel')).toEqual('bevel');
    expect(parsePathOffsetJoin('miter')).toEqual('miter');
    expect(parsePathOffsetJoin('round')).toEqual('round');
    expect(parsePathOffsetJoin('square')).toEqual('square');
  });
  it('rejects other text and wrong casing', () => {
    expect(parsePathOffsetJoin('BEVEL')).toEqual(undefined);
    expect(parsePathOffsetJoin('')).toEqual(undefined);
  });
});
