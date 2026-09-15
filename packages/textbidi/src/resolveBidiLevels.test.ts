import type { HostBidiClassProvider } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createDefaultBidiClassBackend } from './bidiClassBackend';
import { resolveBidiLevels } from './resolveBidiLevels';

const backend = createDefaultBidiClassBackend();

const LEFT_TO_RIGHT_BACKEND: HostBidiClassProvider = { [EntityRuntimeKey]: undefined, getBidiClass: () => 'L' };
const RIGHT_TO_LEFT_BACKEND: HostBidiClassProvider = { [EntityRuntimeKey]: undefined, getBidiClass: () => 'R' };

// "שלום" — the Hebrew word (four strong-R letters).
const HEBREW = 'שלום';

// Arabic letters (bidi class AL): U+0627 Alef, U+0628 Ba, U+062A Ta, U+062B Tha, U+062C Jeem.
const ARABIC = 'ابتثج';

// Arabic-Indic digits (bidi class AN): U+0660-U+0662 (٠١٢).
const ARABIC_DIGITS = '٠١٢';

// Bidi control characters.
const LRE = '‪';
const RLE = '‫';
const PDF = '‬';
const LRO = '‭';
const RLO = '‮';
const LRI = '⁦';
const RLI = '⁧';
const FSI = '⁨';
const PDI = '⁩';

describe('resolveBidiLevels', () => {
  it('routes class lookups through an explicit backend', () => {
    expect(Array.from(resolveBidiLevels(RIGHT_TO_LEFT_BACKEND, 'abc', 'ltr'))).toEqual([1, 1, 1]);
  });

  it('isolates interleaved callers that pass different backends', () => {
    expect(Array.from(resolveBidiLevels(RIGHT_TO_LEFT_BACKEND, 'abc', 'ltr'))).toEqual([1, 1, 1]);
    expect(Array.from(resolveBidiLevels(LEFT_TO_RIGHT_BACKEND, 'abc', 'ltr'))).toEqual([0, 0, 0]);
    expect(Array.from(resolveBidiLevels(RIGHT_TO_LEFT_BACKEND, 'abc', 'ltr'))).toEqual([1, 1, 1]);
  });

  it('assigns level 0 to a pure-LTR string', () => {
    expect(Array.from(resolveBidiLevels(backend, 'hello', 'auto'))).toEqual([0, 0, 0, 0, 0]);
  });

  it('assigns level 1 to a pure-RTL (Hebrew) string under auto base', () => {
    expect(Array.from(resolveBidiLevels(backend, HEBREW, 'auto'))).toEqual([1, 1, 1, 1]);
  });

  it('converts Arabic-Indic digits to AN and keeps them at level 1 in an RTL paragraph (W2 bypass)', () => {
    const levels = Array.from(resolveBidiLevels(backend, `${ARABIC}${ARABIC_DIGITS}`, 'auto'));
    expect(levels).toEqual([1, 1, 1, 1, 1, 2, 2, 2]);
  });

  it('converts EN after AL to AN via W2 in an RTL paragraph', () => {
    const levels = Array.from(resolveBidiLevels(backend, `${ARABIC}123`, 'auto'));
    expect(levels).toEqual([1, 1, 1, 1, 1, 2, 2, 2]);
  });

  it('derives an rtl paragraph from a leading strong-R character under auto', () => {
    const levels = Array.from(resolveBidiLevels(backend, `${HEBREW} ab`, 'auto'));
    expect(levels).toEqual([1, 1, 1, 1, 1, 2, 2]);
  });

  it('embeds an RTL run at an odd level inside an LTR paragraph', () => {
    const levels = Array.from(resolveBidiLevels(backend, `hello ${HEBREW} world`, 'auto'));
    expect(levels).toEqual([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0]);
  });

  it('gives European numbers in an RTL context an even (LTR) level above the RTL text', () => {
    const levels = Array.from(resolveBidiLevels(backend, `${HEBREW} 123`, 'auto'));
    expect(levels).toEqual([1, 1, 1, 1, 1, 2, 2, 2]);
  });

  it('keeps an explicit ltr base at level 0 for pure-LTR text even with a leading number', () => {
    expect(Array.from(resolveBidiLevels(backend, '12ab', 'ltr'))).toEqual([0, 0, 0, 0]);
  });

  it('keeps EN as level 0 after L via W7 in an LTR paragraph', () => {
    const levels = Array.from(resolveBidiLevels(backend, 'abc 123 def', 'auto'));
    expect(levels).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('pushes an LRE embedding to level 2 inside an RTL paragraph (X3)', () => {
    const text = `${HEBREW}${LRE}ab${PDF}${HEBREW}`;
    const levels = Array.from(resolveBidiLevels(backend, text, 'auto'));
    expect(levels).toEqual([1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1]);
  });

  it('pushes an RLE embedding to level 1 inside an LTR paragraph (X2)', () => {
    const text = `ab${RLE}${HEBREW}${PDF}cd`;
    const levels = Array.from(resolveBidiLevels(backend, text, 'auto'));
    expect(levels).toEqual([0, 0, 0, 1, 1, 1, 1, 0, 0, 0]);
  });

  it('raises the paragraph level for an explicit rtl base', () => {
    const levels = Array.from(resolveBidiLevels(backend, `hello ${HEBREW} world`, 'rtl'));
    expect(levels).toEqual([2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
  });

  it('resets trailing whitespace to the paragraph level via L1', () => {
    const levels = Array.from(resolveBidiLevels(backend, `abc ${HEBREW}   `, 'auto'));
    expect(levels).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0]);
  });

  it('resolves an LRI isolate to an even level inside an RTL paragraph (X5b)', () => {
    const text = `${HEBREW}${LRI}ab${PDI}${HEBREW}`;
    const levels = Array.from(resolveBidiLevels(backend, text, 'auto'));
    expect(levels).toEqual([1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1]);
  });

  it('resolves an RLI isolate to an odd level inside an LTR paragraph (X5a)', () => {
    const text = `ab${RLI}${HEBREW}${PDI}cd`;
    const levels = Array.from(resolveBidiLevels(backend, text, 'auto'));
    expect(levels).toEqual([0, 0, 0, 1, 1, 1, 1, 0, 0, 0]);
  });

  it('resolves an FSI isolate by scoring its content (X5c)', () => {
    const text = `ab${FSI}${HEBREW}${PDI}cd`;
    const levels = Array.from(resolveBidiLevels(backend, text, 'auto'));
    expect(levels).toEqual([0, 0, 0, 1, 1, 1, 1, 0, 0, 0]);
  });

  it('resolves an FSI with LTR content as LRI (X5c)', () => {
    const text = `${HEBREW}${FSI}ab${PDI}${HEBREW}`;
    const levels = Array.from(resolveBidiLevels(backend, text, 'auto'));
    expect(levels).toEqual([1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1]);
  });

  it('resolves mixed neutrals between same-direction strong types via N1', () => {
    const levels = Array.from(resolveBidiLevels(backend, 'abc!?@def', 'auto'));
    expect(levels).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('resolves neutrals between R and R to R via N1 in an RTL paragraph', () => {
    const levels = Array.from(resolveBidiLevels(backend, `${HEBREW}!?${HEBREW}`, 'auto'));
    expect(levels).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('resolves neutrals between opposite strong types to the embedding direction via N2', () => {
    const levels = Array.from(resolveBidiLevels(backend, `abc!${HEBREW}`, 'auto'));
    expect(levels).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
  });

  it('resolves both brackets from enclosed opposite-direction text via N0', () => {
    const levels = Array.from(resolveBidiLevels(backend, `${HEBREW}(${HEBREW})abc`, 'ltr'));
    expect(levels).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0]);
  });

  it('pairs nested brackets within one isolating run sequence', () => {
    const levels = Array.from(resolveBidiLevels(backend, `${HEBREW}([abc])${HEBREW}`, 'rtl'));
    expect(levels).toEqual([1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1]);
  });

  it('resolves an LRO override forcing all content to L (X6)', () => {
    const text = `a${LRO}${HEBREW}${PDF}b`;
    const levels = Array.from(resolveBidiLevels(backend, text, 'auto'));
    expect(levels).toEqual([0, 0, 2, 2, 2, 2, 0, 0]);
  });

  it('resolves an RLO override forcing all content to R (X6)', () => {
    const text = `${HEBREW}${RLO}ab${PDF}${HEBREW}`;
    const levels = Array.from(resolveBidiLevels(backend, text, 'auto'));
    expect(levels).toEqual([1, 1, 1, 1, 1, 3, 3, 1, 1, 1, 1, 1]);
  });

  it('returns an empty array for empty text', () => {
    expect(resolveBidiLevels(backend, '', 'auto')).toEqual(new Uint8Array(0));
  });
});
