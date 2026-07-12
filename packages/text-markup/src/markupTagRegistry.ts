import type {
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
 * `<font color size face>` (`#rgb`/`#rrggbb`/`0x` and CSS named colors), `<a href target>`,
 * `<p align>` (implicit line break), `<li type>` (break + bullet), `<br>` (a `\n`), `<span>` (a
 * no-op base), and `<textformat leftmargin blockindent indent rightmargin leading tabstops>`. Each
 * handler returns a fresh result, so registrations share no mutable state.
 */
export function registerStandardMarkupTags(registry: Readonly<MarkupTagRegistry>): void {
  registerMarkupTag(registry, 'a', markupAnchorTagHandler);
  registerMarkupTag(registry, 'b', markupBoldTagHandler);
  registerMarkupTag(registry, 'br', markupBreakTagHandler);
  registerMarkupTag(registry, 'em', markupItalicTagHandler);
  registerMarkupTag(registry, 'font', markupFontTagHandler);
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

function markupFontTagHandler(attributes: Readonly<Record<string, string>>): Partial<TextFormat> {
  const format: TextFormat = {};
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
  return format;
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

// Parses a `<font color>` value into a packed 24-bit RGB integer, or null when unrecognized. Accepts
// `#rgb`, `#rrggbb`, `0xrrggbb`, and the CSS named colors. Alpha is not modeled — `TextFormat.color`
// is opaque RGB.
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
  const named = markupNamedColors[color];
  return named === undefined ? null : named;
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

// The CSS Color Module Level 4 named-color keywords, packed as 24-bit RGB. Loaded only when the
// standard dialect is registered; a custom registry without `<font>` tree-shakes it out.
const markupNamedColors: Readonly<Record<string, number>> = {
  aliceblue: 0xf0f8ff,
  antiquewhite: 0xfaebd7,
  aqua: 0x00ffff,
  aquamarine: 0x7fffd4,
  azure: 0xf0ffff,
  beige: 0xf5f5dc,
  bisque: 0xffe4c4,
  black: 0x000000,
  blanchedalmond: 0xffebcd,
  blue: 0x0000ff,
  blueviolet: 0x8a2be2,
  brown: 0xa52a2a,
  burlywood: 0xdeb887,
  cadetblue: 0x5f9ea0,
  chartreuse: 0x7fff00,
  chocolate: 0xd2691e,
  coral: 0xff7f50,
  cornflowerblue: 0x6495ed,
  cornsilk: 0xfff8dc,
  crimson: 0xdc143c,
  cyan: 0x00ffff,
  darkblue: 0x00008b,
  darkcyan: 0x008b8b,
  darkgoldenrod: 0xb8860b,
  darkgray: 0xa9a9a9,
  darkgreen: 0x006400,
  darkgrey: 0xa9a9a9,
  darkkhaki: 0xbdb76b,
  darkmagenta: 0x8b008b,
  darkolivegreen: 0x556b2f,
  darkorange: 0xff8c00,
  darkorchid: 0x9932cc,
  darkred: 0x8b0000,
  darksalmon: 0xe9967a,
  darkseagreen: 0x8fbc8f,
  darkslateblue: 0x483d8b,
  darkslategray: 0x2f4f4f,
  darkslategrey: 0x2f4f4f,
  darkturquoise: 0x00ced1,
  darkviolet: 0x9400d3,
  deeppink: 0xff1493,
  deepskyblue: 0x00bfff,
  dimgray: 0x696969,
  dimgrey: 0x696969,
  dodgerblue: 0x1e90ff,
  firebrick: 0xb22222,
  floralwhite: 0xfffaf0,
  forestgreen: 0x228b22,
  fuchsia: 0xff00ff,
  gainsboro: 0xdcdcdc,
  ghostwhite: 0xf8f8ff,
  gold: 0xffd700,
  goldenrod: 0xdaa520,
  gray: 0x808080,
  green: 0x008000,
  greenyellow: 0xadff2f,
  grey: 0x808080,
  honeydew: 0xf0fff0,
  hotpink: 0xff69b4,
  indianred: 0xcd5c5c,
  indigo: 0x4b0082,
  ivory: 0xfffff0,
  khaki: 0xf0e68c,
  lavender: 0xe6e6fa,
  lavenderblush: 0xfff0f5,
  lawngreen: 0x7cfc00,
  lemonchiffon: 0xfffacd,
  lightblue: 0xadd8e6,
  lightcoral: 0xf08080,
  lightcyan: 0xe0ffff,
  lightgoldenrodyellow: 0xfafad2,
  lightgray: 0xd3d3d3,
  lightgreen: 0x90ee90,
  lightgrey: 0xd3d3d3,
  lightpink: 0xffb6c1,
  lightsalmon: 0xffa07a,
  lightseagreen: 0x20b2aa,
  lightskyblue: 0x87cefa,
  lightslategray: 0x778899,
  lightslategrey: 0x778899,
  lightsteelblue: 0xb0c4de,
  lightyellow: 0xffffe0,
  lime: 0x00ff00,
  limegreen: 0x32cd32,
  linen: 0xfaf0e6,
  magenta: 0xff00ff,
  maroon: 0x800000,
  mediumaquamarine: 0x66cdaa,
  mediumblue: 0x0000cd,
  mediumorchid: 0xba55d3,
  mediumpurple: 0x9370db,
  mediumseagreen: 0x3cb371,
  mediumslateblue: 0x7b68ee,
  mediumspringgreen: 0x00fa9a,
  mediumturquoise: 0x48d1cc,
  mediumvioletred: 0xc71585,
  midnightblue: 0x191970,
  mintcream: 0xf5fffa,
  mistyrose: 0xffe4e1,
  moccasin: 0xffe4b5,
  navajowhite: 0xffdead,
  navy: 0x000080,
  oldlace: 0xfdf5e6,
  olive: 0x808000,
  olivedrab: 0x6b8e23,
  orange: 0xffa500,
  orangered: 0xff4500,
  orchid: 0xda70d6,
  palegoldenrod: 0xeee8aa,
  palegreen: 0x98fb98,
  paleturquoise: 0xafeeee,
  palevioletred: 0xdb7093,
  papayawhip: 0xffefd5,
  peachpuff: 0xffdab9,
  peru: 0xcd853f,
  pink: 0xffc0cb,
  plum: 0xdda0dd,
  powderblue: 0xb0e0e6,
  purple: 0x800080,
  rebeccapurple: 0x663399,
  red: 0xff0000,
  rosybrown: 0xbc8f8f,
  royalblue: 0x4169e1,
  saddlebrown: 0x8b4513,
  salmon: 0xfa8072,
  sandybrown: 0xf4a460,
  seagreen: 0x2e8b57,
  seashell: 0xfff5ee,
  sienna: 0xa0522d,
  silver: 0xc0c0c0,
  skyblue: 0x87ceeb,
  slateblue: 0x6a5acd,
  slategray: 0x708090,
  slategrey: 0x708090,
  snow: 0xfffafa,
  springgreen: 0x00ff7f,
  steelblue: 0x4682b4,
  tan: 0xd2b48c,
  teal: 0x008080,
  thistle: 0xd8bfd8,
  tomato: 0xff6347,
  turquoise: 0x40e0d0,
  violet: 0xee82ee,
  wheat: 0xf5deb3,
  white: 0xffffff,
  whitesmoke: 0xf5f5f5,
  yellow: 0xffff00,
  yellowgreen: 0x9acd32,
};
