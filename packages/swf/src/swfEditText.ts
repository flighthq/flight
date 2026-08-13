import { packColor } from '@flighthq/color/contract';
import { parseTextMarkup } from '@flighthq/text-markup/contract';
import { createRichText } from '@flighthq/text/contract';
import type { RichText, TextFormat, TextFormatAlign } from '@flighthq/types/contract';

import type { SwfReader } from './swfReader';

// Reads a DefineEditText field into the data a RichText needs.
//
// An edit text field is not artwork and is deliberately not flattened into one. It carries a *string*, a
// font reference, and a layout box — not the positioned glyph indices static text carries — so turning it
// into paths at import would throw away the one property that defines it, that its text can be set. What
// it becomes instead is a real text node holding the authored string and format, which a caller can read,
// re-lay-out, and assign to.
//
// The reader must be positioned immediately after the field's character id and bounds.
export function readSwfEditTextFactory(
  reader: SwfReader,
  width: number,
  height: number,
): ((resolveFontName: (fontId: number) => string) => RichText) | null {
  const flags = reader.readUint8();
  const layoutFlags = reader.readUint8();
  if (!reader.valid) return null;

  const fontId = (flags & EDIT_TEXT_HAS_FONT) !== 0 ? reader.readUint16() : 0;
  // A font declared by class name rather than character id resolves through the linkage table, which the
  // importer does not consult for fonts; the field keeps its size and loses only the family.
  if ((layoutFlags & EDIT_TEXT_HAS_FONT_CLASS) !== 0) reader.readString();
  const fontHeight = (flags & EDIT_TEXT_HAS_FONT) !== 0 ? reader.readUint16() : 0;

  let color = 0;
  let hasColor = false;
  if ((flags & EDIT_TEXT_HAS_TEXT_COLOR) !== 0) {
    const red = reader.readUint8();
    const green = reader.readUint8();
    const blue = reader.readUint8();
    const alpha = reader.readUint8();
    color = packColor(red / 0xff, green / 0xff, blue / 0xff, alpha / 0xff);
    hasColor = true;
  }

  const maxChars = (flags & EDIT_TEXT_HAS_MAX_LENGTH) !== 0 ? reader.readUint16() : -1;

  let align: TextFormatAlign = 'left';
  let leftMargin = 0;
  let rightMargin = 0;
  let indent = 0;
  let leading = 0;
  if ((layoutFlags & EDIT_TEXT_HAS_LAYOUT) !== 0) {
    align = resolveSwfEditTextAlign(reader.readUint8());
    leftMargin = reader.readUint16() / TWIPS_PER_PIXEL;
    rightMargin = reader.readUint16() / TWIPS_PER_PIXEL;
    indent = reader.readUint16() / TWIPS_PER_PIXEL;
    leading = readSwfEditTextSigned(reader) / TWIPS_PER_PIXEL;
  }

  reader.readString();
  const text = (flags & EDIT_TEXT_HAS_TEXT) !== 0 ? reader.readString() : '';
  if (!reader.valid) return null;

  const field: SwfEditTextField = {
    align,
    border: (layoutFlags & EDIT_TEXT_BORDER) !== 0,
    color,
    fontHeight: fontHeight / TWIPS_PER_PIXEL,
    fontId,
    hasColor,
    height,
    html: (layoutFlags & EDIT_TEXT_HTML) !== 0,
    indent,
    leading,
    leftMargin,
    maxChars,
    multiline: (flags & EDIT_TEXT_MULTILINE) !== 0,
    readOnly: (flags & EDIT_TEXT_READ_ONLY) !== 0,
    rightMargin,
    selectable: (layoutFlags & EDIT_TEXT_NO_SELECT) === 0,
    text,
    width,
    wordWrap: (flags & EDIT_TEXT_WORD_WRAP) !== 0,
  };
  // The font's family name is only known once every font tag has been read, so the parse hands back a
  // factory rather than a node: each placement calls it for its own instance, and the factory asks for
  // the name of the font it referenced.
  return (resolveFontName: (fontId: number) => string): RichText =>
    createSwfEditTextNode(field, resolveFontName(field.fontId));
}

// Builds the node one placement of the field gets. Each placement gets its own, because a field's text is
// per-instance state rather than shared artwork.
function createSwfEditTextNode(field: Readonly<SwfEditTextField>, fontName: string): RichText {
  const format: TextFormat = {
    align: field.align,
    indent: field.indent,
    leading: field.leading,
    leftMargin: field.leftMargin,
    rightMargin: field.rightMargin,
    size: field.fontHeight,
  };
  if (field.hasColor) format.color = field.color;
  if (fontName !== '') format.font = fontName;

  // A field flagged as HTML stores markup where its characters would be. Parsing it here is an explicit
  // call on a string the file has already told us is markup — not a property that parses on assignment,
  // which is an anti-goal — and without it the field would display its own tags.
  const content = field.html ? parseTextMarkup(field.text) : null;

  const node = createRichText();
  node.data.border = field.border;
  node.data.defaultTextFormat = format;
  node.data.height = field.height;
  node.data.maxChars = field.maxChars;
  node.data.multiline = field.multiline;
  node.data.selectable = field.selectable && !field.readOnly;
  node.data.text = content === null ? field.text : content.text;
  if (content !== null) node.data.textFormatRanges = content.formatRanges;
  if (field.hasColor) node.data.textColor = field.color;
  node.data.textFormat = format;
  node.data.width = field.width;
  node.data.wordWrap = field.wordWrap;
  return node;
}

// The authored field, in Flight's units — the parse result the factory closes over.
interface SwfEditTextField {
  align: TextFormatAlign;
  border: boolean;
  color: number;
  fontHeight: number;
  fontId: number;
  hasColor: boolean;
  height: number;
  html: boolean;
  indent: number;
  leading: number;
  leftMargin: number;
  maxChars: number;
  multiline: boolean;
  readOnly: boolean;
  rightMargin: number;
  selectable: boolean;
  text: string;
  width: number;
  wordWrap: boolean;
}

function readSwfEditTextSigned(reader: SwfReader): number {
  const value = reader.readUint16();
  return value >= 0x8000 ? value - 0x10000 : value;
}

function resolveSwfEditTextAlign(value: number): TextFormatAlign {
  if (value === EDIT_TEXT_ALIGN_RIGHT) return 'right';
  if (value === EDIT_TEXT_ALIGN_CENTER) return 'center';
  return value === EDIT_TEXT_ALIGN_JUSTIFY ? 'justify' : 'left';
}

const EDIT_TEXT_ALIGN_CENTER = 2;
const EDIT_TEXT_ALIGN_JUSTIFY = 3;
const EDIT_TEXT_ALIGN_RIGHT = 1;
const EDIT_TEXT_BORDER = 0x08;
const EDIT_TEXT_HAS_FONT = 0x01;
const EDIT_TEXT_HAS_FONT_CLASS = 0x80;
const EDIT_TEXT_HAS_LAYOUT = 0x20;
const EDIT_TEXT_HAS_MAX_LENGTH = 0x02;
const EDIT_TEXT_HAS_TEXT = 0x80;
const EDIT_TEXT_HAS_TEXT_COLOR = 0x04;
const EDIT_TEXT_HTML = 0x02;
const EDIT_TEXT_MULTILINE = 0x20;
const EDIT_TEXT_NO_SELECT = 0x10;
const EDIT_TEXT_READ_ONLY = 0x08;
const EDIT_TEXT_WORD_WRAP = 0x40;
const TWIPS_PER_PIXEL = 20;
