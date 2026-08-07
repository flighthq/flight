import { describe, expect, it } from 'vitest';

import { assembleSfntFont, computeSfntTableChecksum, packSfntTag } from './sfntAssembly';

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

  it('writes each table a real checksum rather than a zero', () => {
    const payload = Uint8Array.from([0, 0, 0, 7]);
    const font = assembleSfntFont(0x00010000, [{ data: payload, tag: packSfntTag('cmap') }]);
    const view = new DataView(font.buffer);
    expect(view.getUint32(12 + 4)).toBe(7);
    expect(view.getUint32(12 + 4)).toBe(computeSfntTableChecksum(payload));
  });

  it('carries the flavor it was given rather than inferring one', () => {
    const font = assembleSfntFont(0x4f54544f, [{ data: Uint8Array.from([0]), tag: packSfntTag('CFF ') }]);
    expect(new DataView(font.buffer).getUint32(0)).toBe(0x4f54544f);
  });
});

describe('computeSfntTableChecksum', () => {
  it('sums big-endian words', () => {
    expect(computeSfntTableChecksum(Uint8Array.from([0, 0, 0, 1, 0, 0, 0, 2]))).toBe(3);
  });

  it('pads a partial final word with zeros rather than dropping it', () => {
    // [0,0,1] is one short of a word. Dropping the tail would give 0; padding gives 0x100.
    expect(computeSfntTableChecksum(Uint8Array.from([0, 0, 1]))).toBe(0x100);
  });

  it('treats head checkSumAdjustment as zero, which is what stops every real font mismatching', () => {
    // Byte 8 begins checkSumAdjustment. The same bytes must sum differently for head than for any
    // other table, so the two calls below are what separates the exception from a no-op.
    const head = new Uint8Array(16);
    head[8] = 0xff;
    head[9] = 0xff;
    expect(computeSfntTableChecksum(head, false)).toBe(0xffff0000);
    expect(computeSfntTableChecksum(head, true)).toBe(0);
  });

  it('wraps modulo 2^32 rather than growing past a uint32', () => {
    const big = Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0, 0, 0, 2]);
    expect(computeSfntTableChecksum(big)).toBe(1);
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
