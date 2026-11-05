// Generated from crates/flight-useragent/src/js_pattern.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

function asciiLower(value: number): number {
  if (value >= 0x0041 && value <= 0x005a) {
    return value + 0x0020;
  }
  return value;
}

function asciiSliceToString(text: Readonly<number[]>, start: number, end: number): string {
  let out = '';
  for (let i = start; i < end; i++) {
    let value;
    switch (text[i]) {
      case 0x002e:
        value = '.';
        break;
      case 0x0030:
        value = '0';
        break;
      case 0x0031:
        value = '1';
        break;
      case 0x0032:
        value = '2';
        break;
      case 0x0033:
        value = '3';
        break;
      case 0x0034:
        value = '4';
        break;
      case 0x0035:
        value = '5';
        break;
      case 0x0036:
        value = '6';
        break;
      case 0x0037:
        value = '7';
        break;
      case 0x0038:
        value = '8';
        break;
      case 0x0039:
        value = '9';
        break;
      case 0x005f:
        value = '_';
        break;
      default:
        value = '';
        break;
    }
    out = `${out}${value}`;
  }
  return out;
}

/**
 * JS `/prefix(class+)/i.exec(text)?.[1]`: the first occurrence of `prefix` followed by at least
 * one `class` char, capturing that greedy run.
 */
function captureAfter(
  text: Readonly<number[]>,
  prefix: string,
  predicate: (arg0: number) => boolean,
): string | undefined {
  const prefixLen = utf16Len(prefix);
  for (const at of positions(text, prefix)) {
    const start = at + prefixLen;
    const len = runLen(text, start, predicate);
    if (len > 0) {
      return asciiSliceToString(text, start, start + len);
    }
  }
  return undefined;
}

/**
 * JS `/prefix\s+(class+)/i`: `prefix`, at least one JS whitespace, then at least one `class` char.
 */
function captureAfterWhitespace(
  text: Readonly<number[]>,
  prefix: string,
  predicate: (arg0: number) => boolean,
): string | undefined {
  const prefixLen = utf16Len(prefix);
  for (const at of positions(text, prefix)) {
    const ws = runLen(text, at + prefixLen, isJsWhitespace);
    if (ws === 0) {
      continue;
    }
    const start = at + prefixLen + ws;
    const len = runLen(text, start, predicate);
    if (len > 0) {
      return asciiSliceToString(text, start, start + len);
    }
  }
  return undefined;
}

/**
 * The UA as JavaScript UTF-16 code units, for position-based matching.
 */
function charsOf(text: string): number[] {
  return Array.from({ length: text.length }, (_, index) => text.charCodeAt(index));
}

/**
 * JS `/needle/i.test(text)`.
 */
function contains(text: Readonly<number[]>, needle: string): boolean {
  return findFrom(text, 0, needle) !== undefined;
}

/**
 * JS `/a|b|.../i.test(text)`.
 */
function containsAny(text: Readonly<number[]>, needles: Readonly<string[]>): boolean {
  return needles.some((needle) => contains(text, needle));
}

/**
 * JS `/first.*second/i.test(text)`: `second` follows some `first` on the same line.
 */
function containsThenOnLine(text: Readonly<number[]>, first: string, second: string): boolean {
  const firstLen = utf16Len(first);
  return positions(text, first).some((at) => {
    let k = at + firstLen;
    for (;;) {
      if (matchesAt(text, k, second)) {
        return true;
      }
      if (k >= text.length || isJsLineTerminator(text[k])) {
        return false;
      }
      k++;
    }
  });
}

/**
 * The first position at or after `from` where `needle` matches.
 */
function findFrom(text: Readonly<number[]>, from: number, needle: string): number | undefined {
  const len = utf16Len(needle);
  if (len > text.length) {
    return undefined;
  }
  return Array.from({ length: text.length - len - from + 1 }, (_, index) => from + index).find((i) =>
    matchesAt(text, i, needle),
  );
}

function isAsciiDigit(c: number): boolean {
  return c >= 0x0030 && c <= 0x0039;
}

/**
 * `[\d.]`
 */
function isDigitOrDot(c: number): boolean {
  return isAsciiDigit(c) || c === 0x002e;
}

/**
 * `[\d]`
 */
function isDigitOrUnderscore(c: number): boolean {
  return isAsciiDigit(c) || c === 0x005f;
}

/**
 * `[\d.]`
 */
function isDigitUnderscoreOrDot(c: number): boolean {
  return isAsciiDigit(c) || c === 0x005f || c === 0x002e;
}

/**
 * JS LineTerminator: the characters `.` does not match.
 */
function isJsLineTerminator(c: number): boolean {
  return c === 0x000a || c === 0x000d || c === 0x2028 || c === 0x2029;
}

/**
 * JS `\s`: WhiteSpace (TAB, VT, FF, U+FEFF and the Zs category) plus LineTerminator.
 */
function isJsWhitespace(c: number): boolean {
  return (
    c === 0x0009 ||
    c === 0x000b ||
    c === 0x000c ||
    c === 0x0020 ||
    c === 0x00a0 ||
    c === 0x1680 ||
    (c >= 0x2000 && c <= 0x200a) ||
    c === 0x202f ||
    c === 0x205f ||
    c === 0x3000 ||
    c === 0xfeff ||
    isJsLineTerminator(c)
  );
}

function isNotJsWhitespace(c: number): boolean {
  return !isJsWhitespace(c);
}

/**
 * True when `needle` (ASCII, lowercase) matches `text` at `at` under JS non-unicode `/i` folding.
 */
function matchesAt(text: Readonly<number[]>, at: number, needle: string): boolean {
  let i = at;
  for (const p of Array.from({ length: needle.length }, (_, index) => needle.charCodeAt(index))) {
    if (i >= text.length || asciiLower(text[i]) !== p) {
      return false;
    }
    i++;
  }
  return true;
}

/**
 * Every position where `needle` matches, in order (the regex's leftmost start positions).
 */
function positions(text: Readonly<number[]>, needle: string): number[] {
  let out = [0];
  out.length = 0;
  let from = 0;
  for (;;) {
    const found = findFrom(text, from, needle);
    {
      if (found !== undefined) {
        const at = found;
        out.push(at);
        from = at + 1;
      } else {
        break;
      }
    }
  }
  return out;
}

/**
 * Count of consecutive chars from `at` satisfying `class`.
 */
function runLen(text: Readonly<number[]>, at: number, predicate: (arg0: number) => boolean): number {
  const start = Math.min(at, text.length);
  let end = start;
  while (end < text.length && predicate(text[end])) {
    end++;
  }
  return end - start;
}

/**
 * Replaces ASCII underscores with dots in a capture made only of digits, underscores, and dots.
 */
function underscoresToDots(value: string): string {
  let units: number[] = Array.from({ length: value.length }, (_, index) => value.charCodeAt(index));
  for (let i = 0; i < units.length; i++) {
    if (units[i] === 0x005f) {
      units[i] = 0x002e;
    }
  }
  return asciiSliceToString(units, 0, units.length);
}

function utf16Len(value: string): number {
  const units: number[] = Array.from({ length: value.length }, (_, index) => value.charCodeAt(index));
  return units.length;
}

export {
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
};
