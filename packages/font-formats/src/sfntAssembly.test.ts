import { describe, expect, it } from 'vitest';

import { assembleSfntFont, packSfntTag } from './sfntAssembly';

describe('assembleSfntFont', () => {
  it('writes the directory in tag order whatever order it was given', () => {
    // Reversed on purpose. A pre-sorted input would pass whether or not anything sorted, which is how
    // the WOFF tag-order test was once vacuous.
    const font = assembleSfntFont(0x00010000, [
      { data: Uint8Array.from([9]), tag: packSfntTag('name') },
      { data: Uint8Array.from([7]), tag: packSfntTag('head') },
      { data: Uint8Array.from([8]), tag: packSfntTag('cmap') },
    ]);
    const view = new DataView(font.buffer);
    const tags = Array.from({ length: view.getUint16(4) }, (_, index) => view.getUint32(12 + index * 16));
    expect(tags).toEqual([packSfntTag('cmap'), packSfntTag('head'), packSfntTag('name')]);
  });

  it('starts every table on a four-byte boundary', () => {
    // Lengths chosen so that unpadded placement would land tables at odd offsets — without this the
    // assertion would hold whether or not any padding ran.
    const font = assembleSfntFont(0x00010000, [
      { data: Uint8Array.from([1]), tag: packSfntTag('aaaa') },
      { data: Uint8Array.from([2, 3, 4]), tag: packSfntTag('bbbb') },
      { data: Uint8Array.from([5, 6]), tag: packSfntTag('cccc') },
    ]);
    const view = new DataView(font.buffer);
    const count = view.getUint16(4);
    const offsets = Array.from({ length: count }, (_, index) => view.getUint32(12 + index * 16 + 8));
    expect(offsets.filter((offset) => offset % 4 !== 0)).toEqual([]);
  });

  it('preserves each table byte for byte at its declared offset and length', () => {
    const payload = Uint8Array.from([11, 22, 33, 44, 55]);
    const font = assembleSfntFont(0x4f54544f, [{ data: payload, tag: packSfntTag('CFF ') }]);
    const view = new DataView(font.buffer);
    const offset = view.getUint32(12 + 8);
    const length = view.getUint32(12 + 12);
    expect(length).toBe(payload.byteLength);
    expect([...font.subarray(offset, offset + length)]).toEqual([...payload]);
  });

  it('carries the flavor it was given rather than inferring one', () => {
    const font = assembleSfntFont(0x4f54544f, [{ data: Uint8Array.from([0]), tag: packSfntTag('CFF ') }]);
    expect(new DataView(font.buffer).getUint32(0)).toBe(0x4f54544f);
  });
});

describe('packSfntTag', () => {
  it('packs four characters big-endian', () => {
    expect(packSfntTag('glyf')).toBe(0x676c7966);
  });

  it('pads a short tag with spaces, which is how the format spells its own', () => {
    expect(packSfntTag('cvt')).toBe(packSfntTag('cvt '));
    expect(packSfntTag('cvt')).toBe(0x63767420);
  });
});
