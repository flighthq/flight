import { decodeUTF8, encodeUTF8 } from '@flighthq/encoding/contract';

import {
  BINARY_STL_COUNT_OFFSET,
  BINARY_STL_HEADER_SIZE,
  BINARY_STL_TRIANGLE_SIZE,
  collectStlFeatures,
  countAsciiStlFacets,
  readBinaryStlTriangleCount,
  STL_MESH_FEATURE,
} from './stlFeatures.ts';
import { buildAsciiStl, buildBinaryStl, STL_SQUARE_FACETS } from './stlTestHelper.ts';

describe('BINARY_STL_COUNT_OFFSET', () => {
  it('is the offset the format puts the triangle count at', () => {
    expect(BINARY_STL_COUNT_OFFSET).toBe(80);
  });
});

describe('BINARY_STL_HEADER_SIZE', () => {
  it('is the header plus the count, which is everything before the first triangle', () => {
    expect(BINARY_STL_HEADER_SIZE).toBe(BINARY_STL_COUNT_OFFSET + 4);
  });
});

describe('BINARY_STL_TRIANGLE_SIZE', () => {
  // 4 vectors of 3 float32 plus the uint16 attribute word. Stated arithmetically because this number is the whole
  // discriminant: the bounds equation is what separates a binary STL from a text file that says `solid`.
  it('is four float32 triples plus the attribute word', () => {
    expect(BINARY_STL_TRIANGLE_SIZE).toBe(4 * 3 * 4 + 2);
  });
});

describe('collectStlFeatures', () => {
  it('reports the variant and triangle count for each encoding of the same model', () => {
    expect(collectStlFeatures(buildBinaryStl(STL_SQUARE_FACETS))).toEqual({ triangleCount: 2, variant: 'Binary' });
    expect(collectStlFeatures(encodeUTF8(buildAsciiStl(STL_SQUARE_FACETS)))).toEqual({
      triangleCount: 2,
      variant: 'Ascii',
    });
  });

  // ★ THE TRAP THE FORMAT IS FAMOUS FOR. A binary STL's 80-byte header is free text, and exporters have written
  // `solid` into it for decades. A reader that keyed on the opening word would parse the whole binary payload as
  // ASCII text, find no facets, and report an empty model — a wrong answer that looks like an empty file.
  it.each([
    ['the bare keyword', 'solid part made by an exporter that writes this'],
    ['the keyword and a line break, which is where a solid line would end', 'solid part\n'],
    ['a header that goes on to imitate a facet line', 'solid part\nfacet normal 0 0 1\n'],
  ])('reads a binary file whose header begins with %s as binary', (_label, header) => {
    const bytes = buildBinaryStl(STL_SQUARE_FACETS, header);
    expect(collectStlFeatures(bytes)).toEqual({ triangleCount: 2, variant: 'Binary' });
    // ★ AND THE TEXT GRAMMAR REJECTS IT OUTRIGHT, which is the property that makes the trap harmless rather than
    // merely survivable. Because the two readings are disjoint, trying binary first is belt-and-braces: reversing
    // the two branches would change no answer. Asserting only the verdict above would pass under either order and
    // would leave the word "first" in the comment unbacked by anything.
    expect(countAsciiStlFacets(decodeUTF8(bytes))).toBeNull();
  });

  // ★ TRUNCATION IS NOT A SECOND CHANCE AT ASCII. A binary file short by one byte fails the bounds equation; if
  // that made it fall through to the text grammar, the reader would decode binary noise, find no facets, and
  // answer null anyway — but a file whose payload HAPPENS to contain readable facet text would answer with a
  // partial model. Both are reported as unreadable instead.
  it.each([
    ['one byte short', -1],
    ['one byte long', 1],
  ])('rejects a binary payload that is %s', (_label, delta) => {
    const bytes = buildBinaryStl(STL_SQUARE_FACETS);
    const resized = new Uint8Array(bytes.length + delta);
    resized.set(bytes.subarray(0, Math.min(bytes.length, resized.length)));
    expect(collectStlFeatures(resized)).toBeNull();
  });

  it('rejects a count that overflows the file entirely', () => {
    const bytes = buildBinaryStl(STL_SQUARE_FACETS);
    new DataView(bytes.buffer).setUint32(BINARY_STL_COUNT_OFFSET, 100000, true);
    expect(collectStlFeatures(bytes)).toBeNull();
  });

  // A zero count makes the bounds equation degenerate to "the file is exactly 84 bytes", which any padded 84-byte
  // file satisfies. Rejecting it trades a file carrying no geometry for a class of false positives.
  it('rejects a zero-triangle binary file rather than claiming every 84-byte file', () => {
    expect(collectStlFeatures(buildBinaryStl([]))).toBeNull();
    expect(collectStlFeatures(new Uint8Array(BINARY_STL_HEADER_SIZE))).toBeNull();
  });

  it.each([
    ['empty bytes', ''],
    ['prose containing the word solid', 'this solid object is not a model'],
    ['a solid line with no facets', 'solid empty\nendsolid empty'],
    ['an OBJ', 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'],
    ['XML', '<?xml version="1.0"?><COLLADA/>'],
  ])('reports %s as not an STL', (_label, text) => {
    expect(collectStlFeatures(encodeUTF8(text))).toBeNull();
  });

  it('reports arbitrary binary that is not an STL as not an STL', () => {
    expect(collectStlFeatures(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull();
  });
});

describe('countAsciiStlFacets', () => {
  it('counts complete facets and tolerates the writer conventions files actually use', () => {
    expect(countAsciiStlFacets(buildAsciiStl(STL_SQUARE_FACETS))).toBe(2);
    // Upper-case keywords, CRLF, an unnamed solid, and no trailing endsolid all occur in the wild.
    const shouty = buildAsciiStl(STL_SQUARE_FACETS).toUpperCase().replace(/\n/g, '\r\n');
    expect(countAsciiStlFacets(shouty)).toBe(2);
    expect(countAsciiStlFacets('solid\n' + buildAsciiStl(STL_SQUARE_FACETS).split('\n').slice(1, -1).join('\n'))).toBe(
      2,
    );
  });

  // ★ A FILE WITH ONE BROKEN FACET IS REJECTED WHOLE. Reporting the facets that happened to parse would hand a
  // build a triangle count for a file the parser cannot read, and hand a caller a model missing geometry with no
  // indication that anything was dropped.
  it.each([
    [
      'a facet with two vertices',
      'solid s\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nendloop\nendfacet\nendsolid s',
    ],
    [
      'a facet with four vertices',
      'solid s\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 1 1 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid s',
    ],
    [
      'a non-numeric normal',
      'solid s\nfacet normal a b c\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 1 1 0\nendloop\nendfacet\nendsolid s',
    ],
    [
      'a vertex with two coordinates',
      'solid s\nfacet normal 0 0 1\nouter loop\nvertex 0 0\nvertex 1 0 0\nvertex 1 1 0\nendloop\nendfacet\nendsolid s',
    ],
    [
      'a missing endloop',
      'solid s\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 1 1 0\nendfacet\nendsolid s',
    ],
    [
      'a missing outer loop',
      'solid s\nfacet normal 0 0 1\nvertex 0 0 0\nvertex 1 0 0\nvertex 1 1 0\nendloop\nendfacet\nendsolid s',
    ],
    ['a truncated final facet', 'solid s\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\n'],
    [
      'a NaN coordinate',
      'solid s\nfacet normal 0 0 1\nouter loop\nvertex NaN 0 0\nvertex 1 0 0\nvertex 1 1 0\nendloop\nendfacet\nendsolid s',
    ],
  ])('rejects %s', (_label, text) => {
    expect(countAsciiStlFacets(text)).toBeNull();
  });

  // ★ THE SOLID NAME RUNS TO END OF LINE, so the body must begin with a facet. Scanning forward for the first
  // `facet` keyword instead would accept arbitrary content between the header and the first facet.
  it('rejects content between the solid line and the first facet', () => {
    const text =
      'solid s\nthis line does not belong here\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 1 1 0\nendloop\nendfacet\nendsolid s';
    expect(countAsciiStlFacets(text)).toBeNull();
  });

  it('accepts a multi-word solid name on the header line', () => {
    const text = buildAsciiStl(STL_SQUARE_FACETS, 'a part with a long name');
    expect(countAsciiStlFacets(text)).toBe(2);
  });
});

describe('readBinaryStlTriangleCount', () => {
  it('answers the count for a well-formed payload and null for anything else', () => {
    expect(readBinaryStlTriangleCount(buildBinaryStl(STL_SQUARE_FACETS))).toBe(2);
    expect(readBinaryStlTriangleCount(new Uint8Array(10))).toBeNull();
    expect(readBinaryStlTriangleCount(encodeUTF8(buildAsciiStl(STL_SQUARE_FACETS)))).toBeNull();
  });

  // The same equation the census asks, exported so `parseStl` cannot reach a different verdict about whether a
  // file is binary. Asserted against the census directly, because agreement is the property that matters.
  it('agrees with collectStlFeatures about which files are binary', () => {
    for (const bytes of [
      buildBinaryStl(STL_SQUARE_FACETS),
      buildBinaryStl(STL_SQUARE_FACETS, 'solid trap'),
      encodeUTF8(buildAsciiStl(STL_SQUARE_FACETS)),
      new Uint8Array(BINARY_STL_HEADER_SIZE),
    ]) {
      const count = readBinaryStlTriangleCount(bytes);
      const features = collectStlFeatures(bytes);
      expect(count !== null, String(count)).toBe(features?.variant === 'Binary');
    }
  });
});

describe('STL_MESH_FEATURE', () => {
  it('names the one feature STL has', () => {
    expect(STL_MESH_FEATURE).toBe('Mesh');
  });
});
