import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { HostTextSegmenterCapability } from '@flighthq/types/contract';
import { vi } from 'vitest';

import {
  getNextGraphemeBoundary,
  getNextSentenceBoundary,
  getNextWordBoundary,
  getPreviousGraphemeBoundary,
  getPreviousSentenceBoundary,
  getPreviousWordBoundary,
  getWordRangeAt,
} from './textSegmentBoundary';
import { createDefaultTextSegmenterBackend, webTextSegmenterBackend } from './textSegmenterBackend';

const backend = createDefaultTextSegmenterBackend();

// A ZWJ family emoji is a single grapheme cluster spanning several UTF-16 code units.
const FAMILY = '👨‍👩‍👧';
const EMOJI_TEXT = `a${FAMILY}b`;
const FAMILY_START = 1;
const B_START = FAMILY_START + FAMILY.length;
const EMOJI_LEN = EMOJI_TEXT.length;

describe('getNextGraphemeBoundary', () => {
  it('steps over an emoji cluster in a single move', () => {
    expect(getNextGraphemeBoundary(backend, EMOJI_TEXT, FAMILY_START)).toBe(B_START);
  });

  it('advances one plain grapheme from the start', () => {
    expect(getNextGraphemeBoundary(backend, EMOJI_TEXT, 0)).toBe(FAMILY_START);
  });

  it('clamps at text.length', () => {
    expect(getNextGraphemeBoundary(backend, EMOJI_TEXT, EMOJI_LEN)).toBe(EMOJI_LEN);
    expect(getNextGraphemeBoundary(backend, EMOJI_TEXT, 999)).toBe(EMOJI_LEN);
  });
});

describe('getNextSentenceBoundary', () => {
  it('advances to the next sentence start', () => {
    expect(getNextSentenceBoundary(backend, 'First. Second!', 0)).toBe(7);
  });

  it('clamps at text.length', () => {
    expect(getNextSentenceBoundary(backend, 'First.', 99)).toBe(6);
  });

  it('stops the bundled iterator without materializing backend TextSegment records', () => {
    const segment = vi.spyOn(webTextSegmenterBackend, 'segment');
    expect(getNextSentenceBoundary(backend, 'First. Second!', 0)).toBe(7);
    expect(segment).not.toHaveBeenCalled();
    segment.mockRestore();
  });
});

describe('getNextWordBoundary', () => {
  it('jumps to the end of the current word', () => {
    expect(getNextWordBoundary(backend, 'foo bar', 0)).toBe(3);
  });

  it('clamps at text.length', () => {
    expect(getNextWordBoundary(backend, 'foo bar', 7)).toBe(7);
    expect(getNextWordBoundary(backend, 'foo bar', 42)).toBe(7);
  });
});

describe('getPreviousGraphemeBoundary', () => {
  it('inverts a step over an emoji cluster', () => {
    expect(getPreviousGraphemeBoundary(backend, EMOJI_TEXT, B_START)).toBe(FAMILY_START);
  });

  it('clamps at 0', () => {
    expect(getPreviousGraphemeBoundary(backend, EMOJI_TEXT, 0)).toBe(0);
    expect(getPreviousGraphemeBoundary(backend, EMOJI_TEXT, -5)).toBe(0);
  });

  it('steps back from the end onto the last cluster start', () => {
    expect(getPreviousGraphemeBoundary(backend, EMOJI_TEXT, EMOJI_LEN)).toBe(B_START);
  });
});

describe('getPreviousSentenceBoundary', () => {
  it('steps back to the current sentence start', () => {
    expect(getPreviousSentenceBoundary(backend, 'First. Second!', 14)).toBe(7);
  });

  it('clamps at zero', () => {
    expect(getPreviousSentenceBoundary(backend, 'First.', -1)).toBe(0);
  });
});

describe('getPreviousWordBoundary', () => {
  it('jumps to the start of the current word', () => {
    expect(getPreviousWordBoundary(backend, 'foo bar', 7)).toBe(4);
  });

  it('clamps at 0', () => {
    expect(getPreviousWordBoundary(backend, 'foo bar', 0)).toBe(0);
  });
});

describe('getWordRangeAt', () => {
  it('threads an explicit host through the boundary helper', () => {
    const explicit = {} as HostTextSegmenterCapability;
    explicit.segment = (text: string) => [{ start: 0, end: text.length, text, isWordLike: true }];
    expect(getWordRangeAt(explicit, 'word', 1)).toEqual({ start: 0, end: 4 });
  });

  it('returns the word range under an index', () => {
    expect(getWordRangeAt(backend, 'foo bar', 1)).toEqual({ start: 0, end: 3 });
  });

  it('returns null in whitespace (double-click on a space selects no word)', () => {
    expect(getWordRangeAt(backend, 'foo bar', 3)).toBeNull();
  });

  it('resolves the final word from the trailing boundary', () => {
    expect(getWordRangeAt(backend, 'foo bar', 7)).toEqual({ start: 4, end: 7 });
  });

  it('returns null for empty text', () => {
    expect(getWordRangeAt(backend, '', 0)).toBeNull();
  });

  it('threads the locale to the active backend', () => {
    let seenLocale: string | undefined = 'unset';
    const localeBackend = {} as HostTextSegmenterCapability;
    localeBackend.segment = (text: string, _granularity: string, locale: string) => {
      seenLocale = locale;
      return [{ start: 0, end: text.length, text, isWordLike: true }];
    };
    getWordRangeAt(localeBackend, 'word', 1, 'ja-JP');
    expect(seenLocale).toBe('ja-JP');
  });
});
