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

  if (data.htmlText.length === 0 || passwordCharacter !== null) {
    appendText(out, source, baseFormat, data.condenseWhite, data.maxChars);
  } else {
    parseHTMLText(out, source, data, baseFormat);
  }

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

function appendLineBreak(out: RichTextContent, maxChars: number): void {
  if (maxChars >= 0 && out.text.length >= maxChars) return;
  out.text += '\n';
}

function appendText(
  out: RichTextContent,
  text: string,
  format: Readonly<TextFormat>,
  condenseWhite: boolean,
  maxChars: number,
): void {
  let value = decodeHTMLEntities(text);
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

function applyAttributeFormat(format: TextFormat, name: string, value: string): void {
  switch (name) {
    case 'align':
      if (isTextAlign(value)) format.align = value;
      break;
    case 'blockindent':
      format.blockIndent = parseNumber(value);
      break;
    case 'color':
      format.color = parseColor(value);
      break;
    case 'face':
    case 'font':
    case 'fontfamily':
      format.font = value;
      break;
    case 'indent':
      format.indent = parseNumber(value);
      break;
    case 'leading':
      format.leading = parseNumber(value);
      break;
    case 'leftmargin':
      format.leftMargin = parseNumber(value);
      break;
    case 'letterspacing':
      format.letterSpacing = parseNumber(value);
      break;
    case 'rightmargin':
      format.rightMargin = parseNumber(value);
      break;
    case 'size':
      format.size = parseNumber(value);
      break;
    case 'tabstops':
      format.tabStops = parseTabStops(value);
      break;
  }
}

function applyCSSFormat(format: TextFormat, property: string, value: string): void {
  switch (property) {
    case 'color':
      format.color = parseColor(value);
      break;
    case 'font-family':
      format.font = stripQuotes(value);
      break;
    case 'font-size':
      format.size = parseNumber(value);
      break;
    case 'font-style':
      if (value === 'italic' || value === 'oblique') format.italic = true;
      break;
    case 'font-weight':
      if (value === 'bold' || parseNumber(value) >= 600) format.bold = true;
      break;
    case 'letter-spacing':
      format.letterSpacing = parseNumber(value);
      break;
    case 'line-height':
      format.leading = parseNumber(value);
      break;
    case 'margin-left':
      format.leftMargin = parseNumber(value);
      break;
    case 'margin-right':
      format.rightMargin = parseNumber(value);
      break;
    case 'text-align':
      if (isTextAlign(value)) format.align = value;
      break;
    case 'text-decoration':
      if (value.includes('underline')) format.underline = true;
      if (value.includes('line-through')) format.strikethrough = true;
      break;
    case 'text-indent':
      format.indent = parseNumber(value);
      break;
  }
}

function applyInlineStyle(format: TextFormat, style: string): void {
  for (const declaration of style.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator === -1) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration
      .slice(separator + 1)
      .trim()
      .toLowerCase();
    if (property.length > 0 && value.length > 0) applyCSSFormat(format, property, value);
  }
}

function applyStyleSheetFormat(format: TextFormat, data: Readonly<RichTextData>, tag: string, attrs: Attributes): void {
  const styleSheet = data.styleSheet;
  if (styleSheet === null) return;

  mergeFormatInto(format, styleSheet[tag]);
  const className = attrs.class;
  if (className !== undefined) {
    for (const name of className.split(/\s+/)) {
      if (name.length > 0) {
        mergeFormatInto(format, styleSheet[`.${name}`]);
        mergeFormatInto(format, styleSheet[name]);
      }
    }
  }

  const id = attrs.id;
  if (id !== undefined) mergeFormatInto(format, styleSheet[`#${id}`]);
}

function applyTagFormat(format: TextFormat, tag: string, attrs: Attributes): void {
  switch (tag) {
    case 'b':
    case 'strong':
      format.bold = true;
      break;
    case 'em':
    case 'i':
      format.italic = true;
      break;
    case 'font':
      for (const name of Object.keys(attrs)) applyAttributeFormat(format, name, attrs[name]);
      break;
    case 'li':
      format.bullet = true;
      break;
    case 'p':
      if (attrs.align !== undefined && isTextAlign(attrs.align)) format.align = attrs.align;
      break;
    case 'a':
      if (attrs.href !== undefined) format.url = attrs.href;
      if (attrs.target !== undefined) format.target = attrs.target;
      break;
    case 'textformat':
      for (const name of Object.keys(attrs)) applyAttributeFormat(format, name, attrs[name]);
      break;
    case 's':
    case 'strike':
      format.strikethrough = true;
      break;
    case 'u':
      format.underline = true;
      break;
  }

  if (attrs.style !== undefined) applyInlineStyle(format, attrs.style);
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

function decodeHTMLEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (_match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith('#x')) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    return namedEntities[lower] ?? `&${entity};`;
  });
}

function handleHTMLTag(out: RichTextContent, token: string, data: Readonly<RichTextData>, stack: TextFormat[]): void {
  const content = token.slice(1, -1).trim();
  if (content.length === 0 || content.startsWith('!')) return;

  const closing = content.startsWith('/');
  const selfClosing = content.endsWith('/');
  const body = (closing ? content.slice(1) : content).replace(/\/$/, '').trim();
  const separator = body.search(/\s/);
  const tag = (separator === -1 ? body : body.slice(0, separator)).toLowerCase();
  const attrs = parseAttributes(separator === -1 ? '' : body.slice(separator + 1));

  if (closing) {
    if (stack.length > 1) stack.pop();
    if (tag === 'p' && out.text.length > 0 && !out.text.endsWith('\n')) appendLineBreak(out, data.maxChars);
    return;
  }

  if (tag === 'br') {
    appendLineBreak(out, data.maxChars);
    return;
  }

  if ((tag === 'p' || tag === 'li') && out.text.length > 0 && !out.text.endsWith('\n')) {
    appendLineBreak(out, data.maxChars);
  }

  const format = { ...stack[stack.length - 1] };
  applyStyleSheetFormat(format, data, tag, attrs);
  applyTagFormat(format, tag, attrs);

  if (!selfClosing) stack.push(format);
}

function getRenderableSource(data: Readonly<RichTextData>, passwordCharacter: string | null): string {
  if (passwordCharacter === null) return data.htmlText.length > 0 ? data.htmlText : data.text;
  const mask = passwordCharacter.length > 0 ? passwordCharacter.charAt(0) : '\u2022';
  return mask.repeat(data.text.length);
}

function isTextAlign(value: string): value is NonNullable<TextFormat['align']> {
  return (
    value === 'center' ||
    value === 'end' ||
    value === 'justify' ||
    value === 'left' ||
    value === 'right' ||
    value === 'start'
  );
}

function mergeFormatInto(format: TextFormat, style: TextFormat | undefined): void {
  if (style === undefined) return;
  const merged = mergeTextFormat(format, style);
  for (const key of Object.keys(merged) as (keyof TextFormat)[]) {
    (format as Record<string, unknown>)[key] = merged[key];
  }
}

function parseAttributes(source: string): Attributes {
  const attrs: Attributes = {};
  const pattern = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const name = match[1].toLowerCase();
    attrs[name] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attrs;
}

function parseColor(value: string): number {
  const color = value.trim().toLowerCase();
  if (color.startsWith('#')) {
    if (color.length === 4) {
      const r = color.charAt(1);
      const g = color.charAt(2);
      const b = color.charAt(3);
      return Number.parseInt(`${r}${r}${g}${g}${b}${b}`, 16);
    }
    return Number.parseInt(color.slice(1), 16);
  }
  if (color.startsWith('0x')) return Number.parseInt(color.slice(2), 16);
  return namedColors[color] ?? 0;
}

function parseHTMLText(
  out: RichTextContent,
  source: string,
  data: Readonly<RichTextData>,
  baseFormat: TextFormat,
): void {
  const stack: TextFormat[] = [baseFormat];
  const pattern = /<[^>]*>/g;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    appendText(out, source.slice(index, match.index), stack[stack.length - 1], data.condenseWhite, data.maxChars);
    handleHTMLTag(out, match[0], data, stack);
    index = match.index + match[0].length;
  }

  appendText(out, source.slice(index), stack[stack.length - 1], data.condenseWhite, data.maxChars);
}

function parseNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTabStops(value: string): number[] {
  return value
    .split(',')
    .map((part) => parseNumber(part.trim()))
    .filter((part) => Number.isFinite(part));
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, '');
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

interface Attributes {
  [name: string]: string;
}

const namedColors: Record<string, number> = {
  black: 0x000000,
  blue: 0x0000ff,
  cyan: 0x00ffff,
  fuchsia: 0xff00ff,
  gray: 0x808080,
  green: 0x008000,
  lime: 0x00ff00,
  magenta: 0xff00ff,
  maroon: 0x800000,
  navy: 0x000080,
  olive: 0x808000,
  purple: 0x800080,
  red: 0xff0000,
  silver: 0xc0c0c0,
  teal: 0x008080,
  white: 0xffffff,
  yellow: 0xffff00,
};

const namedEntities: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};
