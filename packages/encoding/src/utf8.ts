export function decodeUTF8(
  bytes: Readonly<Uint8Array>,
  offset: number = 0,
  length: number = bytes.length - offset,
): string {
  assertUTF8Window(bytes.length, offset, length);
  const end = offset + length;
  let result = '';
  let index = offset;
  while (index < end) {
    const first = bytes[index++];
    if (first <= 0x7f) {
      result += String.fromCharCode(first);
      continue;
    }

    if (first >= 0xc2 && first <= 0xdf) {
      if (index < end) {
        const second = bytes[index];
        if (isUTF8Continuation(second)) {
          index++;
          result += String.fromCharCode(((first & 0x1f) << 6) | (second & 0x3f));
          continue;
        }
      }
      result += UTF8_REPLACEMENT_CHARACTER;
      continue;
    }

    if (first >= 0xe0 && first <= 0xef) {
      const secondMinimum = first === 0xe0 ? 0xa0 : 0x80;
      const secondMaximum = first === 0xed ? 0x9f : 0xbf;
      if (index >= end || bytes[index] < secondMinimum || bytes[index] > secondMaximum) {
        result += UTF8_REPLACEMENT_CHARACTER;
        continue;
      }
      const second = bytes[index++];
      if (index >= end || !isUTF8Continuation(bytes[index])) {
        result += UTF8_REPLACEMENT_CHARACTER;
        continue;
      }
      const third = bytes[index++];
      result += String.fromCharCode(((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f));
      continue;
    }

    if (first >= 0xf0 && first <= 0xf4) {
      const secondMinimum = first === 0xf0 ? 0x90 : 0x80;
      const secondMaximum = first === 0xf4 ? 0x8f : 0xbf;
      if (index >= end || bytes[index] < secondMinimum || bytes[index] > secondMaximum) {
        result += UTF8_REPLACEMENT_CHARACTER;
        continue;
      }
      const second = bytes[index++];
      if (index >= end || !isUTF8Continuation(bytes[index])) {
        result += UTF8_REPLACEMENT_CHARACTER;
        continue;
      }
      const third = bytes[index++];
      if (index >= end || !isUTF8Continuation(bytes[index])) {
        result += UTF8_REPLACEMENT_CHARACTER;
        continue;
      }
      const fourth = bytes[index++];
      const codePoint = ((first & 0x07) << 18) | ((second & 0x3f) << 12) | ((third & 0x3f) << 6) | (fourth & 0x3f);
      const pair = codePoint - 0x10000;
      result += String.fromCharCode(0xd800 | (pair >> 10), 0xdc00 | (pair & 0x3ff));
      continue;
    }

    result += UTF8_REPLACEMENT_CHARACTER;
  }
  return result;
}

export function encodeUTF8(text: string): Uint8Array {
  const result = new Uint8Array(measureUTF8(text));
  let outputIndex = 0;
  for (let index = 0; index < text.length; index++) {
    let codePoint = text.charCodeAt(index);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
      const second = index + 1 < text.length ? text.charCodeAt(index + 1) : 0;
      if (second >= 0xdc00 && second <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (second - 0xdc00);
        index++;
      } else {
        codePoint = UTF8_REPLACEMENT_CODE_POINT;
      }
    } else if (codePoint >= 0xdc00 && codePoint <= 0xdfff) {
      codePoint = UTF8_REPLACEMENT_CODE_POINT;
    }
    outputIndex = writeUTF8CodePoint(result, outputIndex, codePoint);
  }
  return result;
}

function assertUTF8Window(byteLength: number, offset: number, length: number): void {
  if (
    !Number.isInteger(offset) ||
    !Number.isInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset + length > byteLength
  ) {
    throw new RangeError('decodeUTF8 window is outside the byte array');
  }
}

function isUTF8Continuation(byte: number): boolean {
  return byte >= 0x80 && byte <= 0xbf;
}

function measureUTF8(text: string): number {
  let byteLength = 0;
  for (let index = 0; index < text.length; index++) {
    const codeUnit = text.charCodeAt(index);
    if (codeUnit <= 0x7f) byteLength++;
    else if (codeUnit <= 0x7ff) byteLength += 2;
    else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const second = index + 1 < text.length ? text.charCodeAt(index + 1) : 0;
      if (second >= 0xdc00 && second <= 0xdfff) {
        byteLength += 4;
        index++;
      } else {
        byteLength += 3;
      }
    } else byteLength += 3;
  }
  return byteLength;
}

function writeUTF8CodePoint(out: Uint8Array, offset: number, codePoint: number): number {
  if (codePoint <= 0x7f) {
    out[offset++] = codePoint;
  } else if (codePoint <= 0x7ff) {
    out[offset++] = 0xc0 | (codePoint >> 6);
    out[offset++] = 0x80 | (codePoint & 0x3f);
  } else if (codePoint <= 0xffff) {
    out[offset++] = 0xe0 | (codePoint >> 12);
    out[offset++] = 0x80 | ((codePoint >> 6) & 0x3f);
    out[offset++] = 0x80 | (codePoint & 0x3f);
  } else {
    out[offset++] = 0xf0 | (codePoint >> 18);
    out[offset++] = 0x80 | ((codePoint >> 12) & 0x3f);
    out[offset++] = 0x80 | ((codePoint >> 6) & 0x3f);
    out[offset++] = 0x80 | (codePoint & 0x3f);
  }
  return offset;
}

const UTF8_REPLACEMENT_CHARACTER = '\ufffd';
const UTF8_REPLACEMENT_CODE_POINT = 0xfffd;
