// Generated from crates/flight-encoding/src/utf8.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

const UTF8_REPLACEMENT_CHARACTER: string = '�';

function assertUtf8Window(byteLength: number, offset: number, length: number): void {
  const end = offset + length;
  if (
    !Number.isInteger(offset) ||
    !Number.isInteger(length) ||
    offset < 0 ||
    length < 0 ||
    end > 0x7fffffff ||
    end < -0x80000000 ||
    end > byteLength
  ) {
    throw new RangeError('decodeUTF8 window is outside the byte array');
  }
}

export function decodeUTF8(bytes: Readonly<Uint8Array>, offset?: number, length?: number): string {
  const offset_1 = offset ?? 0;
  length =
    length ??
    (() => {
      return (
        ((a: number, b: number): number | undefined => {
          const diff = a - b;
          return diff > 0x7fffffff || diff < -0x80000000 ? undefined : diff;
        })(bytes.length, offset_1) ??
        (() => {
          throw new RangeError('decodeUTF8 window is outside the byte array');
        })()
      );
    })();
  assertUtf8Window(bytes.length, offset_1, length);
  const end = offset_1 + length;
  let result = '';
  let index = offset_1;
  while (index < end) {
    const first = bytes[index];
    index++;
    if (first <= 0x7f) {
      result += String.fromCharCode(first);
      continue;
    }
    if (first >= 0xc2 && first <= 0xdf) {
      if (index < end) {
        const second = bytes[index];
        if (isUtf8Continuation(second)) {
          index++;
          const codePoint = (((first >>> 0) & 0x1f) << 6) | ((second >>> 0) & 0x3f);
          result +=
            ((codepoint: number): string | undefined =>
              Number.isInteger(codepoint) &&
              codepoint >= 0 &&
              codepoint <= 0x10ffff &&
              (codepoint < 0xd800 || codepoint > 0xdfff)
                ? String.fromCodePoint(codepoint)
                : undefined)(codePoint) ?? UTF8_REPLACEMENT_CHARACTER;
          continue;
        }
      }
      result += UTF8_REPLACEMENT_CHARACTER;
      continue;
    }
    if (first >= 0xe0 && first <= 0xef) {
      const secondMinimum: number = first === 0xe0 ? 0xa0 : 0x80;
      const secondMaximum: number = first === 0xed ? 0x9f : 0xbf;
      if (index >= end || bytes[index] < secondMinimum || bytes[index] > secondMaximum) {
        result += UTF8_REPLACEMENT_CHARACTER;
        continue;
      }
      const second = bytes[index];
      index++;
      if (index >= end || !isUtf8Continuation(bytes[index])) {
        result += UTF8_REPLACEMENT_CHARACTER;
        continue;
      }
      const third = bytes[index];
      index++;
      const codePoint = (((first >>> 0) & 0x0f) << 12) | (((second >>> 0) & 0x3f) << 6) | ((third >>> 0) & 0x3f);
      result +=
        ((codepoint: number): string | undefined =>
          Number.isInteger(codepoint) &&
          codepoint >= 0 &&
          codepoint <= 0x10ffff &&
          (codepoint < 0xd800 || codepoint > 0xdfff)
            ? String.fromCodePoint(codepoint)
            : undefined)(codePoint) ?? UTF8_REPLACEMENT_CHARACTER;
      continue;
    }
    if (first >= 0xf0 && first <= 0xf4) {
      const secondMinimum: number = first === 0xf0 ? 0x90 : 0x80;
      const secondMaximum: number = first === 0xf4 ? 0x8f : 0xbf;
      if (index >= end || bytes[index] < secondMinimum || bytes[index] > secondMaximum) {
        result += UTF8_REPLACEMENT_CHARACTER;
        continue;
      }
      const second = bytes[index];
      index++;
      if (index >= end || !isUtf8Continuation(bytes[index])) {
        result += UTF8_REPLACEMENT_CHARACTER;
        continue;
      }
      const third = bytes[index];
      index++;
      if (index >= end || !isUtf8Continuation(bytes[index])) {
        result += UTF8_REPLACEMENT_CHARACTER;
        continue;
      }
      const fourth = bytes[index];
      index++;
      const codePoint =
        (((first >>> 0) & 0x07) << 18) |
        (((second >>> 0) & 0x3f) << 12) |
        (((third >>> 0) & 0x3f) << 6) |
        ((fourth >>> 0) & 0x3f);
      result +=
        ((codepoint: number): string | undefined =>
          Number.isInteger(codepoint) &&
          codepoint >= 0 &&
          codepoint <= 0x10ffff &&
          (codepoint < 0xd800 || codepoint > 0xdfff)
            ? String.fromCodePoint(codepoint)
            : undefined)(codePoint) ?? UTF8_REPLACEMENT_CHARACTER;
      continue;
    }
    result += UTF8_REPLACEMENT_CHARACTER;
  }
  return result;
}

export function encodeUTF8(text: string): Uint8Array {
  const byteLength = measureUtf8(text);
  const result = new Uint8Array(byteLength);
  let outputIndex: number = 0;
  for (const c of [...text]) {
    let codePoint = c.codePointAt(0)!;
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) codePoint = 0xfffd;
    outputIndex = writeUtf8CodePoint(result, outputIndex, codePoint);
  }
  return result;
}

function isUtf8Continuation(byte_: number): boolean {
  return byte_ >= 0x80 && byte_ <= 0xbf;
}

function measureUtf8(text: string): number {
  let byteLength: number = 0;
  for (const c of [...text]) {
    let codePoint = c.codePointAt(0)!;
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) codePoint = 0xfffd;
    if (codePoint <= 0x7f) {
      byteLength++;
    } else if (codePoint <= 0x7ff) {
      byteLength += 2;
    } else if (codePoint <= 0xffff) {
      byteLength += 3;
    } else {
      byteLength += 4;
    }
  }
  return byteLength;
}

function writeUtf8CodePoint(out: Uint8Array, offset: number, codePoint: number): number {
  let index = offset;
  if (codePoint <= 0x7f) {
    out[index] = codePoint & 0xff;
    index++;
  } else if (codePoint <= 0x7ff) {
    out[index] = (0xc0 | (codePoint >>> 6)) & 0xff;
    index++;
    out[index] = (0x80 | (codePoint & 0x3f)) & 0xff;
    index++;
  } else if (codePoint <= 0xffff) {
    out[index] = (0xe0 | (codePoint >>> 12)) & 0xff;
    index++;
    out[index] = (0x80 | ((codePoint >>> 6) & 0x3f)) & 0xff;
    index++;
    out[index] = (0x80 | (codePoint & 0x3f)) & 0xff;
    index++;
  } else {
    out[index] = (0xf0 | (codePoint >>> 18)) & 0xff;
    index++;
    out[index] = (0x80 | ((codePoint >>> 12) & 0x3f)) & 0xff;
    index++;
    out[index] = (0x80 | ((codePoint >>> 6) & 0x3f)) & 0xff;
    index++;
    out[index] = (0x80 | (codePoint & 0x3f)) & 0xff;
    index++;
  }
  return index;
}
