// Generated from crates/flight-text/src/rich_text_content.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { createTextFormatRange, mergeTextFormat } from '@flighthq/textformat/contract';
import type { TextFormat, TextFormatRangeRaw } from '@flighthq/textformat/contract';
import { createRichTextContent } from '@flighthq/textlayout/contract';
import type { RichTextContent } from '@flighthq/textlayout/contract';

import type { RichTextData, RichTextRuntime } from './types.ts';

function createBaseFormat(data: Readonly<RichTextData>): TextFormat {
  const defaultFormat = data.defaultTextFormat!;
  const textFormat = data.textFormat!;
  let format = mergeTextFormat(defaultFormat, textFormat);
  if (format.color === undefined) {
    format.color = data.textColor;
  }
  return format;
}

function appendText(
  out: RichTextContent,
  text: string,
  format: Readonly<TextFormat>,
  condenseWhite: boolean,
  maxChars: number,
): void {
  let value = decodeHtmlEntities(text);
  if (condenseWhite) {
    value = condenseWhitespace(value);
    if (out.text.length === 0 || stringEndsWith(out.text, ' ')) {
      value = String(
        ((text: string, matches: (character: string) => boolean): string => {
          let offset = 0;
          for (const character of text) {
            if (!matches(character)) break;
            offset += character.length;
          }
          return text.slice(offset);
        })(value, isCondensedWhitespace),
      );
    }
  }
  if (value.length === 0) {
    return;
  }
  const valueLength = utf16Len(value);
  const remaining = maxChars < 0 ? valueLength : saturatingSub(maxChars >>> 0, utf16Len(out.text));
  if (remaining === 0) {
    return;
  }
  if (valueLength > remaining) {
    value = takeUtf16Prefix(value, remaining);
  }
  const start = utf16Len(out.text);
  out.text = `${out.text}${value}`;
  const end = utf16Len(out.text);
  writeFormatRange(out.formatRanges, format, start, end);
}

function applyTextFormatRanges(out: RichTextContent, overrides: Readonly<TextFormatRangeRaw[]>): void {
  if (overrides.length === 0 || out.text.length === 0) {
    return;
  }
  const textLength = utf16Len(out.text);
  const sourceRanges = out.formatRanges;
  let ranges: TextFormatRangeRaw[] = [] as never[];
  for (const range of sourceRanges) {
    ranges.push(range);
  }
  out.formatRanges = [] as never[];
  for (const override of overrides) {
    const start = Math.min(override.start, textLength);
    const end = Math.min(Math.max(override.end, start), textLength);
    if (start === end) {
      continue;
    }
    const overrideFormat = override.format!;
    let next: TextFormatRangeRaw[] = [] as never[];
    for (const range of ranges) {
      const rangeFormat = range.format!;
      if (range.end <= start || range.start >= end) {
        writeFormatRange(next, rangeFormat, range.start, range.end);
        continue;
      }
      if (range.start < start) {
        writeFormatRange(next, rangeFormat, range.start, start);
      }
      const merged = mergeTextFormat(rangeFormat, overrideFormat);
      writeFormatRange(next, merged, Math.max(range.start, start), Math.min(range.end, end));
      if (range.end > end) {
        writeFormatRange(next, rangeFormat, end, range.end);
      }
    }
    ranges = next;
  }
  for (const range of ranges) {
    const format = range.format!;
    writeFormatRange(out.formatRanges, format, range.start, range.end);
  }
}

function characterUtf16Len(character: string): number {
  return utf16Len(String(character));
}

function clampRanges(ranges: TextFormatRangeRaw[], length: number): void {
  for (const range of ranges) {
    range.end = Math.min(range.end, length);
  }
  (<T>(items: T[], keep: (item: T) => boolean): void => {
    let kept = 0;
    let index = 0;
    try {
      for (; index < items.length; index += 1) {
        const item = items[index];
        if (keep(item)) {
          items[kept] = item;
          kept += 1;
        }
      }
    } finally {
      const length = items.length;
      for (let rest = index; rest < length; rest += 1) {
        items[kept + rest - index] = items[rest];
      }
      items.length = kept + length - index;
    }
  })(ranges, (range) => range.start < length);
}

export function clearRichTextContent(runtime: RichTextRuntime): void {
  runtime.richTextContent = undefined;
}

export function computeRichTextContent(
  out: RichTextContent,
  data: Readonly<RichTextData>,
  passwordCharacter?: string,
): void {
  out.text = '';
  out.formatRanges = [] as never[];
  const baseFormat = createBaseFormat(data);
  const source = getRenderableSource(data, passwordCharacter);
  if (source.length === 0) {
    return;
  }
  appendText(out, source, baseFormat, data.condenseWhite, data.maxChars);
  const length = utf16Len(out.text);
  clampRanges(out.formatRanges, length);
  applyTextFormatRanges(out, data.textFormatRanges);
}

function condenseWhitespace(value: string): string {
  let out = '';
  let whitespace = false;
  for (const character of [...value]) {
    if (isCondensedWhitespace(character)) {
      if (!whitespace) {
        out = `${out}${' '}`;
        whitespace = true;
      }
    } else {
      out = `${out}${character}`;
      whitespace = false;
    }
  }
  return out;
}

function decodeEntity(entity: string): string | undefined {
  const lower = entity.toLowerCase();
  if (lower === 'amp') {
    return '&';
  }
  if (lower === 'apos') {
    return "'";
  }
  if (lower === 'gt') {
    return '>';
  }
  if (lower === 'lt') {
    return '<';
  }
  if (lower === 'nbsp') {
    return ' ';
  }
  if (lower === 'quot') {
    return '"';
  }
  if (stringStartsWith(lower, '#x')) {
    return decodeEntityCodepoint(lower.slice(2, lower.length), 16);
  }
  if (stringStartsWith(lower, '#')) {
    return decodeEntityCodepoint(lower.slice(1, lower.length), 10);
  }
  return undefined;
}

function decodeEntityCodepoint(digits: string, radix: number): string | undefined {
  const codepoint =
    ((digits: string, radix: number): number | undefined => {
      if (!Number.isInteger(radix) || radix < 2 || radix > 36 || digits.length === 0) return undefined;
      let index = digits[0] === '+' ? 1 : 0;
      if (index === digits.length) return undefined;
      let value = 0;
      for (; index < digits.length; index += 1) {
        const code = digits.charCodeAt(index);
        const digit =
          code >= 48 && code <= 57
            ? code - 48
            : code >= 65 && code <= 90
              ? code - 55
              : code >= 97 && code <= 122
                ? code - 87
                : radix;
        if (digit >= radix) return undefined;
        value = value * radix + digit;
        if (value > 0xffffffff) return undefined;
      }
      return value;
    })(digits, radix) ?? 0xffffffff;
  return ((value) => (value === undefined ? undefined : String(value)))(
    ((codepoint: number): string | undefined =>
      Number.isInteger(codepoint) &&
      codepoint >= 0 &&
      codepoint <= 0x10ffff &&
      (codepoint < 0xd800 || codepoint > 0xdfff)
        ? String.fromCodePoint(codepoint)
        : undefined)(codepoint),
  );
}

function decodeHtmlEntities(value: string): string {
  let out = '';
  let rest = value;
  for (;;) {
    const $amp = ((value: string, pattern: string): number | undefined => {
      const index = value.indexOf(pattern);
      return index === -1 ? undefined : index;
    })(rest, '&');
    if ($amp === undefined) {
      break;
    }
    const amp = $amp;
    out = `${out}${rest.slice(0, amp)}`;
    const afterAmp = rest.slice(amp + 1, rest.length);
    const semi = ((value: string, pattern: string): number | undefined => {
      const index = value.indexOf(pattern);
      return index === -1 ? undefined : index;
    })(afterAmp, ';');
    if (semi === undefined) {
      out = `${out}${rest.slice(amp, rest.length)}`;
      return out;
    }
    const entity = afterAmp.slice(0, semi);
    const decoded = decodeEntity(entity);
    if (decoded !== undefined) {
      out = `${out}${decoded!}`;
    } else {
      out = `${out}${'&'}${entity}${';'}`;
    }
    rest = afterAmp.slice(semi + 1, afterAmp.length);
  }
  out = `${out}${rest}`;
  return out;
}

function firstCharacter(value: string): string | undefined {
  return [...value][0];
}

function getRenderableSource(data: Readonly<RichTextData>, passwordCharacter?: string): string {
  if (passwordCharacter === undefined) {
    return data.text;
  }
  const mask = String(firstCharacter(passwordCharacter) ?? '•');
  return repeatString(mask, utf16Len(data.text));
}

export function getRichTextContent(runtime: RichTextRuntime): RichTextContent {
  if (runtime.richTextContent === undefined) {
    runtime.richTextContent = createRichTextContent();
  }
  return runtime.richTextContent!;
}

function isCondensedWhitespace(character: string): boolean {
  return (
    character === ' ' ||
    character === '\u{c}' ||
    character === '\n' ||
    character === '\r' ||
    character === '\t' ||
    character === '\u{b}'
  );
}

function repeatString(value: string, count: number): string {
  let out = '';
  for (let _ = 0; _ < count; _ += 1) {
    out = `${out}${value}`;
  }
  return out;
}

function saturatingSub(value: number, amount: number): number {
  if (amount >= value) {
    return 0;
  }
  return value - amount;
}

function stringEndsWith(value: string, suffix: string): boolean {
  return value.endsWith(suffix);
}

function stringStartsWith(value: string, prefix: string): boolean {
  return value.startsWith(prefix);
}

function takeUtf16Prefix(value: string, limit: number): string {
  let units = 0;
  let out = '';
  for (const character of [...value]) {
    const next = units + characterUtf16Len(character);
    if (next > limit) {
      break;
    }
    units = next;
    out = `${out}${character}`;
  }
  return out;
}

function utf16Len(value: string): number {
  return Array.from({ length: value.length }, (_, index) => value.charCodeAt(index)).length;
}

function writeFormatRange(
  ranges: TextFormatRangeRaw[],
  format: Readonly<TextFormat>,
  start: number,
  end: number,
): void {
  if (start === end) {
    return;
  }
  if (ranges.length !== 0) {
    const previousIndex = ranges.length - 1;
    const previous = ranges[previousIndex];
    if (previous.end === start && previous.format! === format) {
      previous.end = end;
      return;
    }
  }
  ranges.push(createTextFormatRange(format, start, end));
}
