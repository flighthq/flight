import { createRichTextContent, createTextFormatRange } from '@flighthq/textlayout';
import type {
  RichTextContent,
  TextFormat,
  TextFormatAlign,
  TextFormatListMarker,
  TextFormatRange,
} from '@flighthq/types';

/**
 * Serializes a `RichTextContent` back into `htmlText`-subset markup — the inverse of
 * `parseTextMarkup` for everything the rich-text model can express. The emitted tag set is the
 * minimal one that reproduces the `formatRanges`: `<b>`/`<i>`/`<u>`/`<s>` for the style booleans,
 * `<font color size face>` for color/size/font, `<a href target>` for links, `<p align>` for
 * alignment, `<li>` for bullets, and `<textformat …>` for the block metrics. Text is escaped
 * (`&` `<` `>`); attribute values additionally escape `"`.
 *
 * The round-trip guarantee is `parseTextMarkup(formatTextMarkup(parseTextMarkup(x)))` equals
 * `parseTextMarkup(x)` — a fixed point over the modeled tags. Newlines are emitted literally (a
 * `<br>` in the source parses to `\n`, which serializes back as a raw newline that re-parses to the
 * same `\n`). Format fields with no `htmlText` representation (`kerning`, `letterSpacing`) cannot be
 * expressed and are omitted; `parseTextMarkup` never produces them, so the fixed point is unaffected.
 */
export function formatTextMarkup(content: Readonly<RichTextContent>): string {
  const text = content.text;
  if (text.length === 0) return '';

  const formats = resolveMarkupFormats(content);
  let output = '';
  let runStart = 0;
  while (runStart < text.length) {
    const format = formats[runStart];
    let runEnd = runStart + 1;
    while (runEnd < text.length && equalsMarkupFormat(formats[runEnd], format)) runEnd++;
    output += formatMarkupRun(format, text.slice(runStart, runEnd));
    runStart = runEnd;
  }
  return output;
}

/**
 * Parses the `htmlText` HTML subset into Flight's rich-text model — a plain `text` string plus the
 * `TextFormatRange[]` a `RichText`/`TextLabel` node renders. This is the explicit, Flight-way
 * replacement for the `textField.htmlText = "…"` magic property: the caller invokes it and assigns
 * the result, rather than the runtime silently parsing markup on assignment.
 *
 * Supported tags: `<b>`/`<i>`/`<u>`/`<s>` (bold/italic/underline/strikethrough),
 * `<font color size face>`, `<a href target>`, `<p align>`, `<li type>` (bullet + list marker),
 * `<textformat leftmargin blockindent indent rightmargin leading tabstops>`, and `<br>` (a `\n`).
 * `<span>` and any unknown tag keep their enclosed text but apply no format. `<img>` has no
 * rich-text model field yet and is dropped entirely (an inline-image reference is a future model
 * addition). Entities (`&amp; &lt; &gt; &quot; &apos; &#nn; &#xhh;`) decode; unknown named entities
 * are left verbatim. Nested tags compose — `<font color="#f00"><b>x</b></font>` yields one range
 * carrying both `color` and `bold`.
 *
 * Malformed markup is recovered best-effort, never thrown: unclosed tags simply extend to the end
 * of the text, stray `<` with no `>` stays literal text, and an extra closing tag is ignored. The
 * result is always a valid `RichTextContent`. Block tags (`<p>`, `<li>`) carry alignment/bullet
 * formatting but do NOT insert implicit line breaks — use `<br>` for newlines; this keeps the
 * model losslessly round-trippable.
 */
export function parseTextMarkup(html: string): RichTextContent {
  const content = createRichTextContent();
  const stack: TextFormat[] = [{}];
  const tagPattern = /<[^>]*>/g;
  let index = 0;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html)) !== null) {
    appendMarkupText(content, html.slice(index, match.index), stack[stack.length - 1]);
    handleMarkupTag(content, match[0], stack);
    index = match.index + match[0].length;
  }
  appendMarkupText(content, html.slice(index), stack[stack.length - 1]);
  return content;
}

function appendMarkupBreak(content: RichTextContent, format: Readonly<TextFormat>): void {
  const start = content.text.length;
  content.text += '\n';
  pushMarkupRange(content.formatRanges, format, start, content.text.length);
}

function appendMarkupText(content: RichTextContent, raw: string, format: Readonly<TextFormat>): void {
  const value = decodeMarkupEntities(raw);
  if (value.length === 0) return;
  const start = content.text.length;
  content.text += value;
  pushMarkupRange(content.formatRanges, format, start, content.text.length);
}

function applyMarkupFontAttributes(format: TextFormat, attributes: Readonly<MarkupAttributes>): void {
  const color = attributes.color;
  if (color !== undefined) {
    const parsed = parseMarkupColor(color);
    if (parsed !== null) format.color = parsed;
  }
  const size = attributes.size;
  if (size !== undefined) {
    const parsed = parseMarkupNumber(size);
    if (parsed !== null) format.size = parsed;
  }
  const face = attributes.face ?? attributes.font;
  if (face !== undefined && face.length > 0) format.font = face;
}

function applyMarkupTag(format: TextFormat, tag: string, attributes: Readonly<MarkupAttributes>): void {
  switch (tag) {
    case 'a':
      if (attributes.href !== undefined) format.url = attributes.href;
      if (attributes.target !== undefined) format.target = attributes.target;
      break;
    case 'b':
      format.bold = true;
      break;
    case 'font':
      applyMarkupFontAttributes(format, attributes);
      break;
    case 'i':
      format.italic = true;
      break;
    case 'li': {
      format.bullet = true;
      const marker = attributes.type;
      if (marker !== undefined && isMarkupListMarker(marker))
        format.listMarker = marker.toLowerCase() as TextFormatListMarker;
      break;
    }
    case 'p': {
      const align = attributes.align;
      if (align !== undefined && isMarkupAlign(align)) format.align = align.toLowerCase() as TextFormatAlign;
      break;
    }
    case 's':
      format.strikethrough = true;
      break;
    case 'textformat':
      applyMarkupTextformatAttributes(format, attributes);
      break;
    case 'u':
      format.underline = true;
      break;
    // 'span' and any unrecognized tag: keep the enclosed text, apply no format.
  }
}

function applyMarkupTextformatAttributes(format: TextFormat, attributes: Readonly<MarkupAttributes>): void {
  const blockIndent = readMarkupNumberAttribute(attributes, 'blockindent');
  if (blockIndent !== null) format.blockIndent = blockIndent;
  const indent = readMarkupNumberAttribute(attributes, 'indent');
  if (indent !== null) format.indent = indent;
  const leading = readMarkupNumberAttribute(attributes, 'leading');
  if (leading !== null) format.leading = leading;
  const leftMargin = readMarkupNumberAttribute(attributes, 'leftmargin');
  if (leftMargin !== null) format.leftMargin = leftMargin;
  const rightMargin = readMarkupNumberAttribute(attributes, 'rightmargin');
  if (rightMargin !== null) format.rightMargin = rightMargin;
  const tabStops = readMarkupTabStopsAttribute(attributes, 'tabstops');
  if (tabStops !== null) format.tabStops = tabStops;
}

function decodeMarkupEntities(value: string): string {
  if (value.indexOf('&') === -1) return value;
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (matched: string, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith('#x')) return codePointToString(Number.parseInt(lower.slice(2), 16), matched);
    if (lower.startsWith('#')) return codePointToString(Number.parseInt(lower.slice(1), 10), matched);
    return markupNamedEntities[lower] ?? matched;
  });
}

function codePointToString(code: number, fallback: string): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return fallback;
  return String.fromCodePoint(code);
}

function equalsMarkupFormat(a: Readonly<TextFormat>, b: Readonly<TextFormat>): boolean {
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

function escapeMarkupAttribute(value: string): string {
  return value.replace(/[&<>"]/g, (character: string) => markupAttributeEscapes[character]);
}

function escapeMarkupText(value: string): string {
  return value.replace(/[&<>]/g, (character: string) => markupTextEscapes[character]);
}

function formatMarkupAnchorTag(format: Readonly<TextFormat>): string {
  let tag = '<a';
  if (format.url !== undefined) tag += ` href="${escapeMarkupAttribute(format.url)}"`;
  if (format.target !== undefined) tag += ` target="${escapeMarkupAttribute(format.target)}"`;
  return `${tag}>`;
}

function formatMarkupColor(color: number): string {
  return `#${((color >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`;
}

function formatMarkupFontTag(format: Readonly<TextFormat>): string | null {
  const hasColor = format.color !== undefined;
  const hasSize = format.size !== undefined;
  const hasFace = format.font !== undefined;
  if (!hasColor && !hasSize && !hasFace) return null;
  let tag = '<font';
  if (hasColor) tag += ` color="${formatMarkupColor(format.color as number)}"`;
  if (hasSize) tag += ` size="${format.size}"`;
  if (hasFace) tag += ` face="${escapeMarkupAttribute(format.font as string)}"`;
  return `${tag}>`;
}

function formatMarkupListTag(format: Readonly<TextFormat>): string {
  if (format.listMarker !== undefined) return `<li type="${format.listMarker}">`;
  return '<li>';
}

function formatMarkupRun(format: Readonly<TextFormat>, text: string): string {
  const open: string[] = [];
  const close: string[] = [];

  const textformat = formatMarkupTextformatTag(format);
  if (textformat !== null) {
    open.push(textformat);
    close.unshift('</textformat>');
  }
  if (format.align !== undefined) {
    open.push(`<p align="${format.align}">`);
    close.unshift('</p>');
  }
  if (format.bullet === true) {
    open.push(formatMarkupListTag(format));
    close.unshift('</li>');
  }
  if (format.url !== undefined || format.target !== undefined) {
    open.push(formatMarkupAnchorTag(format));
    close.unshift('</a>');
  }
  const font = formatMarkupFontTag(format);
  if (font !== null) {
    open.push(font);
    close.unshift('</font>');
  }
  if (format.bold === true) {
    open.push('<b>');
    close.unshift('</b>');
  }
  if (format.italic === true) {
    open.push('<i>');
    close.unshift('</i>');
  }
  if (format.underline === true) {
    open.push('<u>');
    close.unshift('</u>');
  }
  if (format.strikethrough === true) {
    open.push('<s>');
    close.unshift('</s>');
  }

  return open.join('') + escapeMarkupText(text) + close.join('');
}

function formatMarkupTextformatTag(format: Readonly<TextFormat>): string | null {
  let tag = '<textformat';
  let any = false;
  if (format.blockIndent !== undefined) {
    tag += ` blockindent="${format.blockIndent}"`;
    any = true;
  }
  if (format.indent !== undefined) {
    tag += ` indent="${format.indent}"`;
    any = true;
  }
  if (format.leading !== undefined) {
    tag += ` leading="${format.leading}"`;
    any = true;
  }
  if (format.leftMargin !== undefined) {
    tag += ` leftmargin="${format.leftMargin}"`;
    any = true;
  }
  if (format.rightMargin !== undefined) {
    tag += ` rightmargin="${format.rightMargin}"`;
    any = true;
  }
  if (format.tabStops !== undefined) {
    tag += ` tabstops="${format.tabStops.join(',')}"`;
    any = true;
  }
  return any ? `${tag}>` : null;
}

function handleMarkupTag(content: RichTextContent, token: string, stack: TextFormat[]): void {
  // The tag body is everything between the angle brackets; drop comments (`<!-- -->`), doctypes
  // (`<!…>`), processing instructions (`<?…>`), and the degenerate empty `<>`.
  const inner = token.slice(1, -1).trim();
  if (inner.length === 0 || inner.startsWith('!') || inner.startsWith('?')) return;

  const closing = inner.startsWith('/');
  const selfClosing = inner.endsWith('/');
  const body = (closing ? inner.slice(1) : inner).replace(/\/$/, '').trim();
  const separator = body.search(/\s/);
  const tag = (separator === -1 ? body : body.slice(0, separator)).toLowerCase();

  if (closing) {
    // Guard the base format: an extra closing tag with nothing open is ignored, not an error.
    if (stack.length > 1) stack.pop();
    return;
  }

  const attributes = parseMarkupAttributes(separator === -1 ? '' : body.slice(separator + 1));

  if (tag === 'br') {
    appendMarkupBreak(content, stack[stack.length - 1]);
    return;
  }
  // `<img>` is a void tag with no rich-text model field yet (inline images are a future model
  // addition); it is dropped entirely rather than emitting a placeholder the model cannot round-trip.
  if (tag === 'img') return;

  const format = { ...stack[stack.length - 1] };
  applyMarkupTag(format, tag, attributes);
  if (!selfClosing) stack.push(format);
}

function isMarkupAlign(value: string): boolean {
  switch (value.toLowerCase()) {
    case 'center':
    case 'end':
    case 'justify':
    case 'left':
    case 'right':
    case 'start':
      return true;
    default:
      return false;
  }
}

function isMarkupListMarker(value: string): boolean {
  switch (value.toLowerCase()) {
    case 'circle':
    case 'decimal':
    case 'disc':
    case 'none':
    case 'square':
      return true;
    default:
      return false;
  }
}

function parseMarkupAttributes(source: string): MarkupAttributes {
  const attributes: MarkupAttributes = {};
  const pattern = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const name = match[1].toLowerCase();
    attributes[name] = decodeMarkupEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

function parseMarkupColor(value: string): number | null {
  const color = value.trim().toLowerCase();
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      const parsed = Number.parseInt(`${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`, 16);
      return Number.isNaN(parsed) ? null : parsed;
    }
    const parsed = Number.parseInt(hex, 16);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (color.startsWith('0x')) {
    const parsed = Number.parseInt(color.slice(2), 16);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function parseMarkupNumber(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pushMarkupRange(ranges: TextFormatRange[], format: Readonly<TextFormat>, start: number, end: number): void {
  if (start === end) return;
  // Unformatted text carries no range — plain text produces an empty `formatRanges`.
  if (Object.keys(format).length === 0) return;

  const previous = ranges[ranges.length - 1];
  if (previous !== undefined && previous.end === start && equalsMarkupFormat(previous.format, format)) {
    previous.end = end;
    return;
  }
  ranges.push(createTextFormatRange({ ...format }, start, end));
}

function readMarkupNumberAttribute(attributes: Readonly<MarkupAttributes>, name: string): number | null {
  const raw = attributes[name];
  return raw === undefined ? null : parseMarkupNumber(raw);
}

function readMarkupTabStopsAttribute(attributes: Readonly<MarkupAttributes>, name: string): number[] | null {
  const raw = attributes[name];
  if (raw === undefined) return null;
  const stops: number[] = [];
  for (const part of raw.split(',')) {
    const parsed = parseMarkupNumber(part.trim());
    if (parsed !== null) stops.push(parsed);
  }
  return stops;
}

function resolveMarkupFormats(content: Readonly<RichTextContent>): TextFormat[] {
  const length = content.text.length;
  const formats: TextFormat[] = new Array(length);
  for (let i = 0; i < length; i++) formats[i] = {};
  // Ranges apply in array order; a later range overrides an earlier one on overlap.
  for (const range of content.formatRanges) {
    const start = Math.max(0, Math.min(length, range.start));
    const end = Math.max(start, Math.min(length, range.end));
    for (let i = start; i < end; i++) formats[i] = { ...formats[i], ...range.format };
  }
  return formats;
}

interface MarkupAttributes {
  [name: string]: string;
}

const markupAttributeEscapes: Readonly<Record<string, string>> = {
  '"': '&quot;',
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
};

const markupNamedEntities: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
};

const markupTextEscapes: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
};
