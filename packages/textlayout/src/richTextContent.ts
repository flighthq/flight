import type { RichTextContent, RichTextData, RichTextRuntime, TextFormat, TextFormatRange } from '@flighthq/types';

import { mergeTextFormat } from './textFormat';

export function clearRichTextContent(runtime: RichTextRuntime): void {
  runtime.richTextContent = null;
}

// `passwordCharacter` drives masking: null leaves the text visible; a string masks every character
// with it (an empty string falls back to the bullet default). The caller — buildRichTextLayoutParams —
// reads it from the RichText's editable-input slot, so password state lives on the input capability,
// not on RichTextData.
export function computeRichTextContent(
  out: RichTextContent,
  data: Readonly<RichTextData>,
  passwordCharacter: string | null = null,
): void {
  out.text = '';
  out.formatRanges.length = 0;

  const baseFormat = createBaseFormat(data);
  const source = getRenderableSource(data, passwordCharacter);
  if (source.length === 0) return;

  // The field renders its plain `text` under the base format, then layers the serialized
  // `textFormatRanges` on top. Markup is no longer parsed here: `htmlText`-subset markup is parsed
  // explicitly by parseTextMarkup (@flighthq/text-markup) into a RichTextContent the caller assigns
  // via setRichTextContent, which lands in `text` + `textFormatRanges` — the same two inputs below.
  appendText(out, source, baseFormat, data.condenseWhite, data.maxChars);
  clampRanges(out.formatRanges, out.text.length);
  applyTextFormatRanges(out, data.textFormatRanges);
}

export function createRichTextContent(): RichTextContent {
  return { formatRanges: [], text: '' };
}

export function getRichTextContent(runtime: RichTextRuntime): RichTextContent {
  if (runtime.richTextContent === null) {
    runtime.richTextContent = createRichTextContent();
  }
  return runtime.richTextContent;
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
    value = value.replace(/[ \f\n\r\t\v]+/g, ' ');
    if (out.text.length === 0) value = value.trimStart();
    if (out.text.endsWith(' ')) value = value.trimStart();
  }
  if (value.length === 0) return;

  const remaining = maxChars < 0 ? value.length : Math.max(0, maxChars - out.text.length);
  if (remaining === 0) return;
  if (value.length > remaining) value = value.slice(0, remaining);

  const start = out.text.length;
  out.text += value;
  writeFormatRange(out.formatRanges, format, start, out.text.length);
}

function applyTextFormatRanges(out: RichTextContent, overrides: readonly TextFormatRange[]): void {
  if (overrides.length === 0 || out.text.length === 0) return;

  let ranges = out.formatRanges;
  for (const override of overrides) {
    const start = Math.max(0, Math.min(out.text.length, override.start));
    const end = Math.max(start, Math.min(out.text.length, override.end));
    if (start === end) continue;

    const next: TextFormatRange[] = [];
    for (const range of ranges) {
      if (range.end <= start || range.start >= end) {
        writeFormatRange(next, range.format, range.start, range.end);
        continue;
      }

      if (range.start < start) writeFormatRange(next, range.format, range.start, start);
      writeFormatRange(
        next,
        mergeTextFormat(range.format, override.format),
        Math.max(range.start, start),
        Math.min(range.end, end),
      );
      if (range.end > end) writeFormatRange(next, range.format, end, range.end);
    }
    ranges = next;
  }

  out.formatRanges.length = 0;
  for (const range of ranges) writeFormatRange(out.formatRanges, range.format, range.start, range.end);
}

function clampRanges(ranges: TextFormatRange[], length: number): void {
  for (let i = ranges.length - 1; i >= 0; i--) {
    const range = ranges[i];
    if (range.start >= length) {
      ranges.splice(i, 1);
    } else if (range.end > length) {
      range.end = length;
    }
  }
}

function createBaseFormat(data: Readonly<RichTextData>): TextFormat {
  const format = mergeTextFormat(data.defaultTextFormat, data.textFormat);
  if (format.color === undefined) format.color = data.textColor;
  return format;
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (_match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith('#x')) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    return namedEntities[lower] ?? `&${entity};`;
  });
}

function getRenderableSource(data: Readonly<RichTextData>, passwordCharacter: string | null): string {
  if (passwordCharacter === null) return data.text;
  const mask = passwordCharacter.length > 0 ? passwordCharacter.charAt(0) : '\u2022';
  return mask.repeat(data.text.length);
}

function writeFormatRange(ranges: TextFormatRange[], format: Readonly<TextFormat>, start: number, end: number): void {
  if (start === end) return;
  const previous = ranges[ranges.length - 1];
  if (previous !== undefined && previous.end === start && textFormatEquals(previous.format, format)) {
    previous.end = end;
  } else {
    ranges.push({ end, format: { ...format }, start });
  }
}

function textFormatEquals(a: Readonly<TextFormat>, b: Readonly<TextFormat>): boolean {
  const aKeys = Object.keys(a) as (keyof TextFormat)[];
  const bKeys = Object.keys(b) as (keyof TextFormat)[];
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    const aValue = a[key];
    const bValue = b[key];
    if (Array.isArray(aValue) && Array.isArray(bValue)) {
      if (aValue.length !== bValue.length) return false;
      for (let i = 0; i < aValue.length; i++) {
        if (aValue[i] !== bValue[i]) return false;
      }
    } else if (aValue !== bValue) {
      return false;
    }
  }
  return true;
}

const namedEntities: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};
