import type {
  MarkupColorResolver,
  MarkupTagHandler,
  MarkupTagRegistry,
  TextFormat,
  TextFormatAlign,
  TextFormatListMarker,
} from '@flighthq/types';

/**
 * Creates an empty markup tag registry — the meaning layer `parseTextMarkup` composes over the parse
 * layer. Register handlers with `registerMarkupTag`, or populate the standard `htmlText` dialect with
 * `registerStandardMarkupTags`. The registered set of tag names is the supported dialect; a custom
 * registry that omits the standard tags lets them tree-shake out.
 */
export function createMarkupTagRegistry(): MarkupTagRegistry {
  return { handlers: new Map() };
}

/**
 * Binds a tag name to its handler. The registry is open and last-write-wins: a user registers their
 * own (vendor-prefixed) tags or overrides a standard one. The name is matched case-insensitively, so
 * it is stored lowercased. Handlers are pure — they map this tag's attributes to its contribution and
 * never see spans, ranges, or surrounding text; the parser owns composition and the format stack.
 */
export function registerMarkupTag(
  registry: Readonly<MarkupTagRegistry>,
  name: string,
  handler: MarkupTagHandler,
): void {
  registry.handlers.set(name.toLowerCase(), handler);
}

/**
 * Registers the standard `htmlText` dialect into `registry` — the default bundle `parseTextMarkup`
 * uses when no registry is passed. Covers `<b>`/`<strong>`, `<i>`/`<em>`, `<u>`, `<s>`/`<strike>`,
 * `<font color size face>` (color is `#rgb`/`#rrggbb`/`0x` only by default), `<a href target>`,
 * `<p align>` (implicit line break), `<li type>` (break + bullet), `<br>` (a `\n`), `<span>` (a
 * no-op base), and `<textformat leftmargin blockindent indent rightmargin leading tabstops>`. Each
 * handler returns a fresh result, so registrations share no mutable state.
 *
 * The `<font>` handler resolves color through the registry's `colorResolver` seam, which this installs
 * as the hex-only `resolveMarkupHexColor`. A named color like `red` therefore resolves to no color by
 * default (graceful, not an error). Call `registerMarkupNamedColors` afterward to opt the ~148-entry
 * CSS named-color table in; a bundle that never does keeps the table tree-shaken out.
 */
export function registerStandardMarkupTags(registry: MarkupTagRegistry): void {
  registry.colorResolver = resolveMarkupHexColor;
  registerMarkupTag(registry, 'a', markupAnchorTagHandler);
  registerMarkupTag(registry, 'b', markupBoldTagHandler);
  registerMarkupTag(registry, 'br', markupBreakTagHandler);
  registerMarkupTag(registry, 'em', markupItalicTagHandler);
  registerMarkupTag(registry, 'font', createMarkupFontTagHandler(registry));
  registerMarkupTag(registry, 'i', markupItalicTagHandler);
  registerMarkupTag(registry, 'li', markupListItemTagHandler);
  registerMarkupTag(registry, 'p', markupParagraphTagHandler);
  registerMarkupTag(registry, 's', markupStrikethroughTagHandler);
  registerMarkupTag(registry, 'span', markupSpanTagHandler);
  registerMarkupTag(registry, 'strike', markupStrikethroughTagHandler);
  registerMarkupTag(registry, 'strong', markupBoldTagHandler);
  registerMarkupTag(registry, 'textformat', markupTextformatTagHandler);
  registerMarkupTag(registry, 'u', markupUnderlineTagHandler);
}

/**
 * Resolves a hex `<font color>` value — `#rgb`, `#rrggbb`, or `0xRRGGBB` — to a packed 24-bit RGB
 * integer, or null when unrecognized. This is the default color seam `registerStandardMarkupTags`
 * installs; it imports no named-color table, so the standard dialect stays hex-only until a caller
 * opts into `registerMarkupNamedColors`. Alpha is not modeled — `TextFormat.color` is opaque RGB.
 */
export function resolveMarkupHexColor(value: string): number | null {
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

// Builds the `<font>` handler bound to `registry`, so it can consult the live `colorResolver` seam at
// parse time — letting `registerMarkupNamedColors` widen color support after registration without
// re-registering the handler. Color parsing goes through the seam only (`resolveMarkupHexColor` when
// unset), which is what keeps the named-color table off this handler's import graph.
function createMarkupFontTagHandler(registry: Readonly<MarkupTagRegistry>): MarkupTagHandler {
  return (attributes: Readonly<Record<string, string>>): Partial<TextFormat> => {
    const format: TextFormat = {};
    const color = attributes.color;
    if (color !== undefined) {
      const resolve: MarkupColorResolver = registry.colorResolver ?? resolveMarkupHexColor;
      const parsed = resolve(color);
      if (parsed !== null) format.color = parsed;
    }
    const size = attributes.size;
    if (size !== undefined) {
      const parsed = parseMarkupNumber(size);
      if (parsed !== null) format.size = parsed;
    }
    const face = attributes.face ?? attributes.font;
    if (face !== undefined && face.length > 0) format.font = face;
    return format;
  };
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

function markupAnchorTagHandler(attributes: Readonly<Record<string, string>>): Partial<TextFormat> {
  const format: TextFormat = {};
  if (attributes.href !== undefined) format.url = attributes.href;
  if (attributes.target !== undefined) format.target = attributes.target;
  return format;
}

function markupBoldTagHandler(): Partial<TextFormat> {
  return { bold: true };
}

function markupBreakTagHandler(): { text: string } {
  return { text: '\n' };
}

function markupItalicTagHandler(): Partial<TextFormat> {
  return { italic: true };
}

function markupListItemTagHandler(attributes: Readonly<Record<string, string>>): {
  breakBefore: boolean;
  format: Partial<TextFormat>;
} {
  const format: TextFormat = { bullet: true };
  const marker = attributes.type;
  if (marker !== undefined && isMarkupListMarker(marker))
    format.listMarker = marker.toLowerCase() as TextFormatListMarker;
  return { breakBefore: true, format };
}

function markupParagraphTagHandler(attributes: Readonly<Record<string, string>>): {
  breakBefore: boolean;
  format: Partial<TextFormat>;
} {
  const format: TextFormat = {};
  const align = attributes.align;
  if (align !== undefined && isMarkupAlign(align)) format.align = align.toLowerCase() as TextFormatAlign;
  return { breakBefore: true, format };
}

function markupSpanTagHandler(): Partial<TextFormat> {
  return {};
}

function markupStrikethroughTagHandler(): Partial<TextFormat> {
  return { strikethrough: true };
}

function markupTextformatTagHandler(attributes: Readonly<Record<string, string>>): Partial<TextFormat> {
  const format: TextFormat = {};
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
  return format;
}

function markupUnderlineTagHandler(): Partial<TextFormat> {
  return { underline: true };
}

function parseMarkupNumber(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readMarkupNumberAttribute(attributes: Readonly<Record<string, string>>, name: string): number | null {
  const raw = attributes[name];
  return raw === undefined ? null : parseMarkupNumber(raw);
}

function readMarkupTabStopsAttribute(attributes: Readonly<Record<string, string>>, name: string): number[] | null {
  const raw = attributes[name];
  if (raw === undefined) return null;
  const stops: number[] = [];
  for (const part of raw.split(',')) {
    const parsed = parseMarkupNumber(part.trim());
    if (parsed !== null) stops.push(parsed);
  }
  return stops;
}
