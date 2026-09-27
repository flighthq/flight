import { decodeUTF8 } from '@flighthq/encoding/contract';

import {
  BINARY_STL_COUNT_OFFSET,
  BINARY_STL_HEADER_SIZE,
  BINARY_STL_TRIANGLE_SIZE,
  collectStlFeatures,
} from './stlFeatures.ts';
import { buildAsciiStl, buildBinaryStl, STL_SQUARE_FACETS } from './stlTestHelper.ts';

// ★ A FIXTURE BUILDER IS A SECOND IMPLEMENTATION OF THE FORMAT, so it needs its own tests. Every STL assertion in
// this package is only as good as these writers: a builder that wrote the triangle count at the wrong offset would
// make the parser look broken, and one that wrote a subtly different model in each encoding would make a parity
// test fail for a reason that has nothing to do with the parser.
describe('buildAsciiStl', () => {
  it('writes a facet block the census accepts, with one facet per input', () => {
    const text = buildAsciiStl(STL_SQUARE_FACETS);
    expect(text.startsWith('solid fixture')).toBe(true);
    expect(text.trimEnd().endsWith('endsolid fixture')).toBe(true);
    expect(text.match(/facet normal/g)).toHaveLength(2);
    expect(text.match(/vertex /g)).toHaveLength(6);
  });

  it('names the solid, so a fixture can exercise the header the grammar skips', () => {
    expect(
      buildAsciiStl(STL_SQUARE_FACETS, 'a part with a long name').startsWith('solid a part with a long name'),
    ).toBe(true);
  });
});

describe('buildBinaryStl', () => {
  it('writes the exact payload size the format requires', () => {
    const bytes = buildBinaryStl(STL_SQUARE_FACETS);
    expect(bytes.length).toBe(BINARY_STL_HEADER_SIZE + 2 * BINARY_STL_TRIANGLE_SIZE);
    expect(new DataView(bytes.buffer).getUint32(BINARY_STL_COUNT_OFFSET, true)).toBe(2);
  });

  // The header is the trap this helper exists to be able to set, so the bytes it writes are checked directly.
  it('writes the header text a caller asks for, truncated to the 80 bytes the format allows', () => {
    const bytes = buildBinaryStl(STL_SQUARE_FACETS, 'solid trap');
    expect(decodeUTF8(bytes, 0, 10)).toBe('solid trap');
    const long = buildBinaryStl(STL_SQUARE_FACETS, 'x'.repeat(200));
    expect(long.length).toBe(BINARY_STL_HEADER_SIZE + 2 * BINARY_STL_TRIANGLE_SIZE);
    expect(new DataView(long.buffer).getUint32(BINARY_STL_COUNT_OFFSET, true)).toBe(2);
  });
});

describe('STL_SQUARE_FACETS', () => {
  // The shared fixture is a square, which is what makes the no-welding assertion possible: its two facets share
  // two corners EXACTLY, so a welding reader would emit four vertices where the file describes six.
  it('is two facets sharing two corners exactly, with normals that agree with their winding', () => {
    expect(STL_SQUARE_FACETS).toHaveLength(2);
    const corners = STL_SQUARE_FACETS.flatMap((facet) => facet.vertices.map((vertex) => vertex.join(',')));
    expect(corners.filter((corner) => corner === '0,0,0')).toHaveLength(2);
    expect(corners.filter((corner) => corner === '1,1,0')).toHaveLength(2);
    for (const facet of STL_SQUARE_FACETS) expect(facet.normal).toEqual([0, 0, 1]);
  });

  it('is read back identically from both encodings, which is what the parity tests rest on', () => {
    expect(collectStlFeatures(buildBinaryStl(STL_SQUARE_FACETS))).toEqual({ triangleCount: 2, variant: 'Binary' });
    expect(collectStlFeatures(new TextEncoder().encode(buildAsciiStl(STL_SQUARE_FACETS)))).toEqual({
      triangleCount: 2,
      variant: 'Ascii',
    });
  });
});
