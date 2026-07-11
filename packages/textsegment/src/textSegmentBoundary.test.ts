import {
  getNextGraphemeBoundary,
  getNextWordBoundary,
  getPreviousGraphemeBoundary,
  getPreviousWordBoundary,
  getWordRangeAt,
} from './textSegmentBoundary';
import { setTextSegmenterBackend } from './textSegmenterBackend';

afterEach(() => setTextSegmenterBackend(null));

// A ZWJ family emoji is a single grapheme cluster spanning several UTF-16 code units.
const FAMILY = '👨‍👩‍👧';
const EMOJI_TEXT = `a${FAMILY}b`;
const FAMILY_START = 1;
const B_START = FAMILY_START + FAMILY.length;
const EMOJI_LEN = EMOJI_TEXT.length;

describe('getNextGraphemeBoundary', () => {
  it('steps over an emoji cluster in a single move', () => {
    expect(getNextGraphemeBoundary(EMOJI_TEXT, FAMILY_START)).toBe(B_START);
  });

  it('advances one plain grapheme from the start', () => {
    expect(getNextGraphemeBoundary(EMOJI_TEXT, 0)).toBe(FAMILY_START);
  });

  it('clamps at text.length', () => {
    expect(getNextGraphemeBoundary(EMOJI_TEXT, EMOJI_LEN)).toBe(EMOJI_LEN);
    expect(getNextGraphemeBoundary(EMOJI_TEXT, 999)).toBe(EMOJI_LEN);
  });
});

describe('getNextWordBoundary', () => {
  it('jumps to the end of the current word', () => {
    expect(getNextWordBoundary('foo bar', 0)).toBe(3);
  });

  it('clamps at text.length', () => {
    expect(getNextWordBoundary('foo bar', 7)).toBe(7);
    expect(getNextWordBoundary('foo bar', 42)).toBe(7);
  });
});

describe('getPreviousGraphemeBoundary', () => {
  it('inverts a step over an emoji cluster', () => {
    expect(getPreviousGraphemeBoundary(EMOJI_TEXT, B_START)).toBe(FAMILY_START);
  });

  it('clamps at 0', () => {
    expect(getPreviousGraphemeBoundary(EMOJI_TEXT, 0)).toBe(0);
    expect(getPreviousGraphemeBoundary(EMOJI_TEXT, -5)).toBe(0);
  });

  it('steps back from the end onto the last cluster start', () => {
    expect(getPreviousGraphemeBoundary(EMOJI_TEXT, EMOJI_LEN)).toBe(B_START);
  });
});

describe('getPreviousWordBoundary', () => {
  it('jumps to the start of the current word', () => {
    expect(getPreviousWordBoundary('foo bar', 7)).toBe(4);
  });

  it('clamps at 0', () => {
    expect(getPreviousWordBoundary('foo bar', 0)).toBe(0);
  });
});

describe('getWordRangeAt', () => {
  it('returns the word range under an index', () => {
    expect(getWordRangeAt('foo bar', 1)).toEqual({ start: 0, end: 3 });
  });

  it('returns null in whitespace (double-click on a space selects no word)', () => {
    expect(getWordRangeAt('foo bar', 3)).toBeNull();
  });

  it('resolves the final word from the trailing boundary', () => {
    expect(getWordRangeAt('foo bar', 7)).toEqual({ start: 4, end: 7 });
  });

  it('returns null for empty text', () => {
    expect(getWordRangeAt('', 0)).toBeNull();
  });

  it('threads the locale to the active backend', () => {
    let seenLocale: string | undefined = 'unset';
    setTextSegmenterBackend({
      segment(text, _granularity, locale) {
        seenLocale = locale;
        return [{ start: 0, end: text.length, text, isWordLike: true }];
      },
    });
    getWordRangeAt('word', 1, 'ja-JP');
    expect(seenLocale).toBe('ja-JP');
  });
});
