import { describe, expect, it } from 'vitest';

import {
  captureAfter,
  captureAfterWhitespace,
  charsOf,
  contains,
  containsAny,
  containsThenOnLine,
  isAsciiDigit,
  isDigitOrDot,
  isDigitOrUnderscore,
  isDigitUnderscoreOrDot,
  isJsLineTerminator,
  isJsWhitespace,
  isNotJsWhitespace,
  matchesAt,
  positions,
  runLen,
  underscoresToDots,
} from './jsPattern.ts';

describe('captureAfter', () => {
  it('captures the first matching ASCII run', () => {
    expect(captureAfter(charsOf('Chrome/x Chrome/120.1'), 'chrome/', isDigitOrDot)).toBe('120.1');
  });
});

describe('captureAfterWhitespace', () => {
  it('requires JavaScript whitespace between the prefix and capture', () => {
    expect(captureAfterWhitespace(charsOf('Android\u00a014.0'), 'android', isDigitOrDot)).toBe('14.0');
    expect(captureAfterWhitespace(charsOf('Android14.0'), 'android', isDigitOrDot)).toBeUndefined();
  });
});

describe('charsOf', () => {
  it('returns JavaScript UTF-16 code units', () => {
    expect(charsOf('A😀')).toEqual([0x0041, 0xd83d, 0xde00]);
  });
});

describe('contains', () => {
  it('matches ASCII case-insensitively', () => {
    expect(contains(charsOf('Mozilla Chrome'), 'chrome')).toBe(true);
  });
});

describe('containsAny', () => {
  it('matches when any candidate occurs', () => {
    expect(containsAny(charsOf('Mozilla Firefox'), ['chrome', 'firefox'])).toBe(true);
  });
});

describe('containsThenOnLine', () => {
  it('does not cross a JavaScript line terminator', () => {
    expect(containsThenOnLine(charsOf('webOS panel tv'), 'webos', 'tv')).toBe(true);
    expect(containsThenOnLine(charsOf('webOS\ntv'), 'webos', 'tv')).toBe(false);
  });
});

describe('isAsciiDigit', () => {
  it('accepts only ASCII digit code units', () => {
    expect(isAsciiDigit(0x0030)).toBe(true);
    expect(isAsciiDigit(0x0660)).toBe(false);
  });
});

describe('isDigitOrDot', () => {
  it('accepts ASCII digits and a dot', () => {
    expect(isDigitOrDot(0x0039)).toBe(true);
    expect(isDigitOrDot(0x002e)).toBe(true);
    expect(isDigitOrDot(0x005f)).toBe(false);
  });
});

describe('isDigitOrUnderscore', () => {
  it('accepts ASCII digits and an underscore', () => {
    expect(isDigitOrUnderscore(0x0039)).toBe(true);
    expect(isDigitOrUnderscore(0x005f)).toBe(true);
    expect(isDigitOrUnderscore(0x002e)).toBe(false);
  });
});

describe('isDigitUnderscoreOrDot', () => {
  it('accepts every OS-version capture code unit', () => {
    expect([0x0039, 0x005f, 0x002e].every(isDigitUnderscoreOrDot)).toBe(true);
    expect(isDigitUnderscoreOrDot(0x0041)).toBe(false);
  });
});

describe('isJsLineTerminator', () => {
  it('recognizes all four JavaScript line terminators', () => {
    expect([0x000a, 0x000d, 0x2028, 0x2029].every(isJsLineTerminator)).toBe(true);
    expect(isJsLineTerminator(0x0020)).toBe(false);
  });
});

describe('isJsWhitespace', () => {
  it('matches JavaScript whitespace rather than Unicode whitespace', () => {
    expect(isJsWhitespace(0xfeff)).toBe(true);
    expect(isJsWhitespace(0x0085)).toBe(false);
  });
});

describe('isNotJsWhitespace', () => {
  it('is the inverse of JavaScript whitespace', () => {
    expect(isNotJsWhitespace(0x0041)).toBe(true);
    expect(isNotJsWhitespace(0x0020)).toBe(false);
  });
});

describe('matchesAt', () => {
  it('matches at the requested UTF-16 position', () => {
    const text = charsOf('xxChrome');
    expect(matchesAt(text, 2, 'chrome')).toBe(true);
    expect(matchesAt(text, 1, 'chrome')).toBe(false);
  });
});

describe('positions', () => {
  it('returns every overlapping match position in order', () => {
    expect(positions(charsOf('aaa'), 'aa')).toEqual([0, 1]);
  });
});

describe('runLen', () => {
  it('counts a consecutive predicate run', () => {
    expect(runLen(charsOf('x12.3z'), 1, isDigitOrDot)).toBe(4);
  });
});

describe('underscoresToDots', () => {
  it('normalizes OS-version separators', () => {
    expect(underscoresToDots('17_4.1')).toBe('17.4.1');
  });
});
