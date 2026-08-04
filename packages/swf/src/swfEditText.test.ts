import type { RichText } from '@flighthq/types/contract';

import { readSwfEditTextFactory } from './swfEditText';
import { SwfReader } from './swfReader';

describe('readSwfEditTextFactory', () => {
  it('keeps the authored string as text rather than flattening it into artwork', () => {
    const field = build({ text: 'Score' })(() => '');

    // A field carries a string and a font reference, not positioned glyphs, so it stays assignable.
    expect(field.data.text).toBe('Score');
    field.data.text = 'changed';
    expect(field.data.text).toBe('changed');
  });

  it('resolves the family of the font it references, by asking for it', () => {
    // The name is only known once every font tag has been read, so the factory asks at construction.
    const field = build({ fontId: 7, text: '' })((fontId) => (fontId === 7 ? 'Arial' : ''));

    expect(field.data.defaultTextFormat.font).toBe('Arial');
    expect(build({ fontId: 9, text: '' })(() => '').data.defaultTextFormat.font).toBeUndefined();
  });

  it('converts every authored measurement out of twips', () => {
    const field = build({ fontHeight: 240, indent: 60, leading: 80, leftMargin: 20, rightMargin: 40, text: '' })(
      () => '',
    );

    expect(field.data.defaultTextFormat).toMatchObject({
      indent: 3,
      leading: 4,
      leftMargin: 1,
      rightMargin: 2,
      size: 12,
    });
  });

  it('carries the flags a field is defined by', () => {
    const field = build({ border: true, multiline: true, noSelect: true, text: '', wordWrap: true })(() => '');

    expect(field.data.multiline).toBe(true);
    expect(field.data.wordWrap).toBe(true);
    expect(field.data.border).toBe(true);
    expect(field.data.selectable).toBe(false);
  });

  it('parses the markup of a field flagged as html into text and format ranges', () => {
    const field = build({ html: true, text: 'Hit <b>hard</b> now' })(() => '');

    // Without the parse the field would display its own tags, which is the whole point of the flag.
    expect(field.data.text).toBe('Hit hard now');
    expect(field.data.textFormatRanges).toEqual([{ end: 8, format: { bold: true }, start: 4 }]);
  });

  it('keeps markup verbatim in a field that is not flagged as html', () => {
    const field = build({ text: 'Hit <b>hard</b> now' })(() => '');

    // The flag is what declares the string to be markup; an unflagged field states its characters
    // literally, so parsing it anyway would eat text the author wrote.
    expect(field.data.text).toBe('Hit <b>hard</b> now');
    expect(field.data.textFormatRanges).toEqual([]);
  });

  it('returns null for a field that runs out mid-record', () => {
    const bytes = bytesFor({ text: 'x' });

    expect(readSwfEditTextFactory(new SwfReader(bytes, 0, bytes.length - 1), 10, 10)).toBeNull();
  });
});

interface FieldOptions {
  border?: boolean;
  fontHeight?: number;
  fontId?: number;
  html?: boolean;
  indent?: number;
  leading?: number;
  leftMargin?: number;
  multiline?: boolean;
  noSelect?: boolean;
  rightMargin?: number;
  text: string;
  wordWrap?: boolean;
}

function build(options: Readonly<FieldOptions>): (resolve: (fontId: number) => string) => RichText {
  const bytes = bytesFor(options);
  return readSwfEditTextFactory(new SwfReader(bytes, 0, bytes.length), 100, 20)!;
}

// The field body as it appears after the character id and bounds: two flag bytes, the font reference, the
// colour, the layout block, the variable name, and the initial text.
function bytesFor(options: Readonly<FieldOptions>): Uint8Array {
  const bytes: number[] = [];
  const u8 = (v: number): void => void bytes.push(v & 0xff);
  const u16 = (v: number): void => {
    u8(v);
    u8(v >> 8);
  };
  const str = (v: string): void => {
    for (const byte of new TextEncoder().encode(v)) u8(byte);
    u8(0);
  };

  const flags = 0x80 | 0x04 | 0x01 | (options.wordWrap === true ? 0x40 : 0) | (options.multiline === true ? 0x20 : 0);
  const layoutFlags =
    0x20 |
    (options.border === true ? 0x08 : 0) |
    (options.noSelect === true ? 0x10 : 0) |
    (options.html === true ? 0x02 : 0);
  u8(flags);
  u8(layoutFlags);
  u16(options.fontId ?? 1);
  u16(options.fontHeight ?? 200);
  u8(0x11);
  u8(0x22);
  u8(0x33);
  u8(0xff);
  u8(0); // align: left
  u16(options.leftMargin ?? 0);
  u16(options.rightMargin ?? 0);
  u16(options.indent ?? 0);
  u16(options.leading ?? 0);
  str('variable');
  str(options.text);
  return new Uint8Array(bytes);
}
