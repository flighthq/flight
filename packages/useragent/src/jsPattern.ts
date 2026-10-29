// Target-native JavaScript UTF-16 and regular-expression semantics for js_pattern.rs.

/**
 * JS `/prefix(class+)/i.exec(text)?.[1]`: the first occurrence of `prefix` followed by at least
 * one `class` char, capturing that greedy run.
 */
export function captureAfter(
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
export function captureAfterWhitespace(
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
export function charsOf(text: string): number[] {
  return Array.from({ length: text.length }, (_, index) => text.charCodeAt(index));
}

/**
 * JS `/needle/i.test(text)`.
 */
export function contains(text: Readonly<number[]>, needle: string): boolean {
  return findFrom(text, 0, needle) !== undefined;
}

/**
 * JS `/a|b|.../i.test(text)`.
 */
export function containsAny(text: Readonly<number[]>, needles: Readonly<string[]>): boolean {
  return needles.some((needle) => contains(text, needle));
}

/**
 * JS `/first.*second/i.test(text)`: `second` follows some `first` on the same line.
 */
export function containsThenOnLine(text: Readonly<number[]>, first: string, second: string): boolean {
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
      k += 1;
    }
  });
}

export function isAsciiDigit(c: number): boolean {
  return Array.from({ length: 0x0039 - 0x0030 + 1 }, (_, index) => 0x0030 + index).includes(c);
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

/**
 * `[\d.]`
 */
export function isDigitOrDot(c: number): boolean {
  return isAsciiDigit(c) || c === 0x002e;
}

/**
 * `[\d]`
 */
export function isDigitOrUnderscore(c: number): boolean {
  return isAsciiDigit(c) || c === 0x005f;
}

/**
 * `[\d.]`
 */
export function isDigitUnderscoreOrDot(c: number): boolean {
  return isAsciiDigit(c) || c === 0x005f || c === 0x002e;
}

/**
 * JS LineTerminator: the characters `.` does not match.
 */
export function isJsLineTerminator(c: number): boolean {
  return c === 0x000a || c === 0x000d || c === 0x2028 || c === 0x2029;
}

/**
 * JS `\s`: WhiteSpace (TAB, VT, FF, U+FEFF and the Zs category) plus LineTerminator.
 */
export function isJsWhitespace(c: number): boolean {
  return (
    c === 0x0009 ||
    c === 0x000b ||
    c === 0x000c ||
    c === 0x0020 ||
    c === 0x00a0 ||
    c === 0x1680 ||
    Array.from({ length: 0x200a - 0x2000 + 1 }, (_, index) => 0x2000 + index).includes(c) ||
    c === 0x202f ||
    c === 0x205f ||
    c === 0x3000 ||
    c === 0xfeff ||
    isJsLineTerminator(c)
  );
}

export function isNotJsWhitespace(c: number): boolean {
  return !isJsWhitespace(c);
}

/**
 * True when `needle` (ASCII, lowercase) matches `text` at `at` under JS non-unicode `/i` folding.
 */
export function matchesAt(text: Readonly<number[]>, at: number, needle: string): boolean {
  let i = at;
  for (const p of Array.from({ length: needle.length }, (_, index) => needle.charCodeAt(index))) {
    if (i >= text.length || asciiLower(text[i]) !== p) {
      return false;
    }
    i += 1;
  }
  return true;
}

/**
 * Every position where `needle` matches, in order (the regex's leftmost start positions).
 */
export function positions(text: Readonly<number[]>, needle: string): number[] {
  let out = [0];
  out.length = 0;
  let from = 0;
  for (;;) {
    const found = findFrom(text, from, needle);
    {
      const matchValue = found;
      if (matchValue !== undefined) {
        const at = matchValue;
        out.push(at);
        from = at + 1;
      } else if (matchValue === undefined) {
        break;
      }
    }
  }
  return out;
}

/**
 * Count of consecutive chars from `at` satisfying `class`.
 */
export function runLen(text: Readonly<number[]>, at: number, predicate: (arg0: number) => boolean): number {
  const start = Math.min(at, text.length);
  let end = start;
  while (end < text.length && predicate(text[end])) {
    end += 1;
  }
  return end - start;
}

/**
 * Replaces ASCII underscores with dots in a capture made only of digits, underscores, and dots.
 */
export function underscoresToDots(value: string): string {
  let units: number[] = Array.from({ length: value.length }, (_, index) => value.charCodeAt(index));
  for (let i = 0; i < units.length; i += 1) {
    if (units[i] === 0x005f) {
      units[i] = 0x002e;
    }
  }
  return asciiSliceToString(units, 0, units.length);
}

function asciiLower(value: number): number {
  if (Array.from({ length: 0x005a - 0x0041 + 1 }, (_, index) => 0x0041 + index).includes(value)) {
    return value + 0x0020;
  }
  return value;
}

function utf16Len(value: string): number {
  const units: number[] = Array.from({ length: value.length }, (_, index) => value.charCodeAt(index));
  return units.length;
}

function asciiSliceToString(text: Readonly<number[]>, start: number, end: number): string {
  let out = '';
  for (let i = start; i < end; i += 1) {
    const value = (() => {
      const matchValue = text[i];
      switch (matchValue) {
        case 0x002e:
          return '.';
        case 0x0030:
          return '0';
        case 0x0031:
          return '1';
        case 0x0032:
          return '2';
        case 0x0033:
          return '3';
        case 0x0034:
          return '4';
        case 0x0035:
          return '5';
        case 0x0036:
          return '6';
        case 0x0037:
          return '7';
        case 0x0038:
          return '8';
        case 0x0039:
          return '9';
        case 0x005f:
          return '_';
        default:
          return '';
      }
    })();
    out = `${out}${value}`;
  }
  return out;
}
