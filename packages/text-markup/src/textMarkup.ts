import { createRichTextContent, createTextFormatRange } from '@flighthq/textlayout';
import type {
  MarkupTagEffect,
  MarkupTagHandler,
  MarkupTagRegistry,
  MarkupTagResult,
  RichTextContent,
  TextFormat,
  TextFormatRange,
} from '@flighthq/types';

import { createMarkupTagRegistry, registerStandardMarkupTags } from './markupTagRegistry';

/**
 * Serializes a `RichTextContent` back into `htmlText`-subset markup — the inverse of
 * `parseTextMarkup` for everything the rich-text model can express. The emitted tag set is the fixed
 * standard dialect that reproduces the `formatRanges`: `<b>`/`<i>`/`<u>`/`<s>` for the style booleans,
 * `<font color size face>` for color/size/font, `<a href target>` for links, `<p align>` for
 * alignment, `<li>` for bullets, and `<textformat …>` for the block metrics. Colors always emit as
 * `#rrggbb` (a named-color source like `red` normalizes to `#ff0000`). Text is escaped (`&` `<` `>`);
 * attribute values additionally escape `"`.
 *
 * The round-trip guarantee is `parseTextMarkup(formatTextMarkup(parseTextMarkup(x)))` equals
 * `parseTextMarkup(x)` — a fixed point over the modeled tags. `<p>`/`<li>` imply a collapsing line
 * break before their content; the resulting `\n` carries no block format and re-parses as a plain
 * newline that the block tag's own collapse rule does not double, so the fixed point holds. Format
 * fields with no `htmlText` representation (`kerning`, `letterSpacing`) cannot be expressed and are
 * omitted; `parseTextMarkup` never produces them, so the fixed point is unaffected.
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
 * Parses `htmlText`-style markup into Flight's rich-text model — a plain `text` string plus the
 * `TextFormatRange[]` a `RichText`/`TextLabel` node renders. This is the explicit, Flight-way
 * replacement for the `textField.htmlText = "…"` magic property: the caller invokes it and assigns
 * the result, rather than the runtime silently parsing markup on assignment.
 *
 * Parsing is two layers. The parse layer here tokenizes the markup (a lenient, text-node-preserving
 * pass — not the strict document tree of `@flighthq/xml`) and owns composition: it walks the tags,
 * maintains a format stack (push a tag's handler contribution on open, pop on close), and emits the
 * `text` and `TextFormatRange[]`. The meaning layer is the `registry` — an open map of tag name →
 * handler that decides what each tag contributes. When no `registry` is passed the standard
 * `htmlText` dialect is used (`registerStandardMarkupTags`), so the default is backward-compatible;
 * pass a custom registry to add, replace, or narrow the supported tags.
 *
 * Nested tags compose — `<font color="#f00"><b>x</b></font>` yields one range carrying both `color`
 * and `bold`. An unregistered tag keeps its enclosed text but applies no format. Entities
 * (`&amp; &lt; &gt; &quot; &apos; &#nn; &#xhh;`) decode; unknown named entities are left verbatim.
 *
 * Malformed markup is recovered best-effort, never thrown: unclosed tags simply extend to the end of
 * the text, a stray `<` with no `>` stays literal text, and an extra closing tag is ignored. The
 * result is always a valid `RichTextContent`.
 */
export function parseTextMarkup(html: string, registry?: Readonly<MarkupTagRegistry>): RichTextContent {
  const handlers = (registry ?? getDefaultMarkupTagRegistry()).handlers;
  const content = createRichTextContent();
  const stack: TextFormat[] = [{}];
  const tagPattern = /<[^>]*>/g;
  let index = 0;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html)) !== null) {
    appendMarkupText(content, html.slice(index, match.index), stack[stack.length - 1]);
    handleMarkupToken(content, handlers, match[0], stack);
    index = match.index + match[0].length;
  }
  appendMarkupText(content, html.slice(index), stack[stack.length - 1]);
  return content;
}

// Inserts a collapsing block break — the implicit newline before a `<p>`/`<li>`. Suppressed at the
// start of the output and against an existing trailing newline so block tags never stack blank lines.
// The break carries no format, which keeps it indistinguishable from a plain newline on re-parse and
// preserves the serialize/parse fixed point.
function appendMarkupBreakBefore(content: RichTextContent): void {
  const text = content.text;
  if (text.length === 0 || text.endsWith('\n')) return;
  appendMarkupString(content, '\n', emptyMarkupFormat);
}

// Appends a literal string (already decoded — a handler's `text`, or a decoded text node).
function appendMarkupString(content: RichTextContent, value: string, format: Readonly<TextFormat>): void {
  if (value.length === 0) return;
  const start = content.text.length;
  content.text += value;
  pushMarkupRange(content.formatRanges, format, start, content.text.length);
}

// Appends a raw text node, decoding entities first.
function appendMarkupText(content: RichTextContent, raw: string, format: Readonly<TextFormat>): void {
  appendMarkupString(content, decodeMarkupEntities(raw), format);
}

function codePointToString(code: number, fallback: string): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return fallback;
  return String.fromCodePoint(code);
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

// The default standard-dialect registry, built lazily and memoized. Not a module-load side effect:
// nothing runs until the first `parseTextMarkup` call that omits a registry. Kept internal so the
// standard tags stay immutable from outside; a caller wanting custom tags builds their own registry.
function getDefaultMarkupTagRegistry(): MarkupTagRegistry {
  let registry = defaultMarkupTagRegistry;
  if (registry === null) {
    registry = createMarkupTagRegistry();
    registerStandardMarkupTags(registry);
    defaultMarkupTagRegistry = registry;
  }
  return registry;
}

// The dispatch + build binder: resolves one tag token against the registry and applies its result to
// the format stack and emitted content. Structure (tokenizing, the stack) stays free of TextFormat
// specifics beyond what a handler returns, so a general markup-binding engine could lift this shape
// out later against a different handler result type.
function handleMarkupToken(
  content: RichTextContent,
  handlers: Readonly<Map<string, MarkupTagHandler>>,
  token: string,
  stack: TextFormat[],
): void {
  // The tag body is everything between the angle brackets; drop comments (`<!-- -->`), doctypes
  // (`<!…>`), processing instructions (`<?…>`), and the degenerate empty `<>`.
  const inner = token.slice(1, -1).trim();
  if (inner.length === 0 || inner.startsWith('!') || inner.startsWith('?')) return;

  const closing = inner.startsWith('/');
  const selfClosing = inner.endsWith('/');
  const body = (closing ? inner.slice(1) : inner).replace(/\/$/, '').trim();
  const separator = body.search(/\s/);
  const name = (separator === -1 ? body : body.slice(0, separator)).toLowerCase();

  if (closing) {
    // Guard the base format: an extra closing tag with nothing open is ignored, not an error.
    if (stack.length > 1) stack.pop();
    return;
  }

  const top = stack[stack.length - 1];
  const handler = handlers.get(name);
  if (handler === undefined) {
    // Unregistered tag: keep the enclosed text, apply no format. Push a copy of the current format so
    // the matching close pops it without disturbing an enclosing tag.
    if (!selfClosing) stack.push({ ...top });
    return;
  }

  const attributes = parseMarkupAttributes(separator === -1 ? '' : body.slice(separator + 1));
  const result = normalizeMarkupTagResult(handler(attributes));

  // A void insertion tag (text, no format) inserts literal text and never pushes — e.g. `<br>`.
  if (result.format === undefined && result.text !== undefined) {
    appendMarkupString(content, result.text, top);
    return;
  }

  if (result.breakBefore === true) appendMarkupBreakBefore(content);
  if (result.text !== undefined) appendMarkupString(content, result.text, top);

  const merged: TextFormat = { ...top, ...result.format };
  if (!selfClosing) stack.push(merged);
}

// Normalizes a handler result to the `MarkupTagEffect` shape. The common `Partial<TextFormat>` return
// carries none of the reserved effect keys, so it is wrapped as `{ format }`; a richer return is used
// as-is. `TextFormat` shares no field name with `format`/`breakBefore`/`text`, so the test is exact.
function normalizeMarkupTagResult(result: Readonly<MarkupTagResult>): MarkupTagEffect {
  if ('format' in result || 'breakBefore' in result || 'text' in result) return result as MarkupTagEffect;
  return { format: result as Partial<TextFormat> };
}

function parseMarkupAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const name = match[1].toLowerCase();
    attributes[name] = decodeMarkupEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
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

let defaultMarkupTagRegistry: MarkupTagRegistry | null = null;

const emptyMarkupFormat: Readonly<TextFormat> = {};

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
