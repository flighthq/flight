// Generated from crates/flight-textlayout/tests/type_strings_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  getTextAutoSizeString,
  getTextJustificationString,
  getTextVerticalAlignString,
  parseTextAutoSize,
  parseTextJustification,
  parseTextVerticalAlign,
} from './contract.ts';

describe('getTextAutoSizeString', () => {
  it('returns every exact source literal', () => {
    expect(getTextAutoSizeString('center')).toEqual('center');
    expect(getTextAutoSizeString('left')).toEqual('left');
    expect(getTextAutoSizeString('none')).toEqual('none');
    expect(getTextAutoSizeString('right')).toEqual('right');
  });
});

describe('getTextJustificationString', () => {
  it('returns every exact source literal', () => {
    expect(getTextJustificationString('interCharacter')).toEqual('interCharacter');
    expect(getTextJustificationString('interWord')).toEqual('interWord');
    expect(getTextJustificationString('none')).toEqual('none');
  });
});

describe('getTextVerticalAlignString', () => {
  it('returns every current exact source literal', () => {
    expect(getTextVerticalAlignString('bottom')).toEqual('bottom');
    expect(getTextVerticalAlignString('middle')).toEqual('middle');
    expect(getTextVerticalAlignString('top')).toEqual('top');
  });
});

describe('parseTextAutoSize', () => {
  it('accepts every literal and rejects non source spellings', () => {
    expect(parseTextAutoSize('center')).toEqual('center');
    expect(parseTextAutoSize('left')).toEqual('left');
    expect(parseTextAutoSize('none')).toEqual('none');
    expect(parseTextAutoSize('right')).toEqual('right');
    expect(parseTextAutoSize('Center')).toEqual(undefined);
    expect(parseTextAutoSize('')).toEqual(undefined);
  });
});

describe('parseTextJustification', () => {
  it('accepts every literal and rejects non source spellings', () => {
    expect(parseTextJustification('interCharacter')).toEqual('interCharacter');
    expect(parseTextJustification('interWord')).toEqual('interWord');
    expect(parseTextJustification('none')).toEqual('none');
    expect(parseTextJustification('inter-word')).toEqual(undefined);
    expect(parseTextJustification('')).toEqual(undefined);
  });
});

describe('parseTextVerticalAlign', () => {
  it('accepts current literals and rejects reserved future values', () => {
    expect(parseTextVerticalAlign('bottom')).toEqual('bottom');
    expect(parseTextVerticalAlign('middle')).toEqual('middle');
    expect(parseTextVerticalAlign('top')).toEqual('top');
    expect(parseTextVerticalAlign('baseline')).toEqual(undefined);
    expect(parseTextVerticalAlign('justify')).toEqual(undefined);
  });
});
