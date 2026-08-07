import { describe, expect, it } from 'vitest';

import { readCffFdSelect } from './cffFdSelect';

// Format 0 is one byte per glyph; format 3 is ranges with a trailing sentinel giving the final end.
function format0(...perGlyph: number[]): Uint8Array {
  return new Uint8Array([0, ...perGlyph]);
}

function format3(ranges: readonly (readonly [number, number])[], sentinel: number): Uint8Array {
  const bytes = new Uint8Array(3 + ranges.length * 3 + 2);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, 3);
  view.setUint16(1, ranges.length);
  ranges.forEach(([first, fd], index) => {
    view.setUint16(3 + index * 3, first);
    view.setUint8(5 + index * 3, fd);
  });
  view.setUint16(3 + ranges.length * 3, sentinel);
  return bytes;
}

describe('readCffFdSelect', () => {
  it('reads a byte-per-glyph mapping', () => {
    expect([...readCffFdSelect(format0(0, 1, 1, 2), 0, 4)!]).toEqual([0, 1, 1, 2]);
  });

  it('expands ranges into a dense per-glyph map', () => {
    // Glyphs 0-1 use FD 0, 2-4 use FD 1, and the sentinel closes the last range at 5.
    expect([
      ...readCffFdSelect(
        format3(
          [
            [0, 0],
            [2, 1],
          ],
          5,
        ),
        0,
        5,
      )!,
    ]).toEqual([0, 0, 1, 1, 1]);
  });

  it('reads a table that does not start at byte zero', () => {
    const inner = format0(3, 3);
    const bytes = new Uint8Array(4 + inner.length);
    bytes.set(inner, 4);
    expect([...readCffFdSelect(bytes, 4, 2)!]).toEqual([3, 3]);
  });

  // A tail left unmapped would default to FD 0, which is a REAL pool belonging to a different font DICT.
  // That is the silent wrong-pool outcome this module exists to prevent, so it is refused.
  it('returns the sentinel when ranges do not cover every glyph, rather than defaulting the tail to FD 0', () => {
    expect(readCffFdSelect(format3([[0, 0]], 3), 0, 5)).toBeNull();
  });

  it('returns the sentinel for a range running backwards or past the glyph count', () => {
    expect(
      readCffFdSelect(
        format3(
          [
            [0, 0],
            [4, 1],
          ],
          2,
        ),
        0,
        5,
      ),
    ).toBeNull();
    expect(readCffFdSelect(format3([[0, 0]], 99), 0, 5)).toBeNull();
  });

  it('returns the sentinel for a format it does not read', () => {
    expect(readCffFdSelect(new Uint8Array([7, 0, 0]), 0, 2)).toBeNull();
  });

  it('returns the sentinel for a truncated table rather than a partial map', () => {
    expect(readCffFdSelect(format0(0, 1), 0, 5)).toBeNull();
    expect(readCffFdSelect(new Uint8Array([3, 0]), 0, 2)).toBeNull();
    expect(readCffFdSelect(new Uint8Array(0), 0, 1)).toBeNull();
  });
});
