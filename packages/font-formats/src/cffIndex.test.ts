import { describe, expect, it } from 'vitest';

import { readCffIndex } from './cffIndex';

// INDEXes are built here byte by byte, like every other fixture in this package: offsets are 1-based from
// the byte before the data block, and that off-by-one is exactly the detail a stub would paper over.
function buildIndex(entries: readonly string[], offSize = 1): Uint8Array {
  if (entries.length === 0) return new Uint8Array([0, 0]);
  const payload = entries.map((entry) => new TextEncoder().encode(entry));
  const offsets = [1];
  for (const entry of payload) offsets.push(offsets[offsets.length - 1]! + entry.length);
  const bytes = new Uint8Array(3 + offsets.length * offSize + offsets[offsets.length - 1]! - 1);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, entries.length);
  view.setUint8(2, offSize);
  offsets.forEach((offset, index) => {
    for (let byte = 0; byte < offSize; byte += 1) {
      view.setUint8(3 + index * offSize + byte, (offset >> (8 * (offSize - 1 - byte))) & 0xff);
    }
  });
  let cursor = 3 + offsets.length * offSize;
  for (const entry of payload) {
    bytes.set(entry, cursor);
    cursor += entry.length;
  }
  return bytes;
}

function textOf(bytes: Uint8Array, entry: { end: number; start: number }): string {
  return new TextDecoder().decode(bytes.subarray(entry.start, entry.end));
}

describe('readCffIndex', () => {
  it('carves the data into one range per entry', () => {
    const bytes = buildIndex(['alpha', 'be', 'gamma']);
    const index = readCffIndex(bytes, 0)!;
    expect(index.entries).toHaveLength(3);
    expect(index.entries.map((entry) => textOf(bytes, entry))).toEqual(['alpha', 'be', 'gamma']);
  });

  it('reports the byte just past itself, so the next structure can be read without recomputing', () => {
    const bytes = buildIndex(['alpha', 'be']);
    expect(readCffIndex(bytes, 0)?.endOffset).toBe(bytes.byteLength);
  });

  // A font with no local subroutines relies on this being a normal answer rather than an error.
  it('reads an empty INDEX as two bytes and no entries', () => {
    const index = readCffIndex(new Uint8Array([0, 0, 0xff]), 0)!;
    expect(index.entries).toEqual([]);
    expect(index.endOffset).toBe(2);
  });

  it('reads multi-byte offsets', () => {
    const bytes = buildIndex(['alpha', 'be'], 3);
    expect(readCffIndex(bytes, 0)!.entries.map((entry) => textOf(bytes, entry))).toEqual(['alpha', 'be']);
  });

  it('preserves a legitimately empty entry rather than dropping it', () => {
    const bytes = buildIndex(['a', '', 'c']);
    const index = readCffIndex(bytes, 0)!;
    expect(index.entries).toHaveLength(3);
    expect(textOf(bytes, index.entries[1]!)).toBe('');
  });

  it('reads an INDEX that does not start at byte zero', () => {
    const inner = buildIndex(['x']);
    const bytes = new Uint8Array(4 + inner.length);
    bytes.set(inner, 4);
    expect(readCffIndex(bytes, 4)!.entries.map((entry) => textOf(bytes, entry))).toEqual(['x']);
  });

  it('returns the sentinel when the first offset is not 1, which means these are not its offsets', () => {
    const bytes = buildIndex(['alpha']);
    new DataView(bytes.buffer).setUint8(3, 2);
    expect(readCffIndex(bytes, 0)).toBeNull();
  });

  it('returns the sentinel for offsets that run backwards', () => {
    const bytes = buildIndex(['alpha', 'be']);
    new DataView(bytes.buffer).setUint8(5, 1);
    expect(readCffIndex(bytes, 0)).toBeNull();
  });

  it('returns the sentinel for an offset width the format does not define', () => {
    const bytes = buildIndex(['alpha']);
    new DataView(bytes.buffer).setUint8(2, 9);
    expect(readCffIndex(bytes, 0)).toBeNull();
  });

  // A truncated INDEX yields ranges pointing at arbitrary bytes, which every consumer downstream would
  // read as real charstrings. The sentinel is the only safe answer.
  it('returns the sentinel for a truncated INDEX rather than ranges into arbitrary bytes', () => {
    const bytes = buildIndex(['alpha', 'be']);
    expect(readCffIndex(bytes.subarray(0, bytes.length - 4), 0)).toBeNull();
    expect(readCffIndex(new Uint8Array([0]), 0)).toBeNull();
  });
});
