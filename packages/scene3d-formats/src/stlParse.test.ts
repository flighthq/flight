import { encodeUTF8 } from '@flighthq/encoding/contract';
import type { MeshGeometry } from '@flighthq/types/contract';

import { CANONICAL_FLOATS_PER_VERTEX, CANONICAL_LAYOUT } from './shared.ts';
import { parseStl, stlFullImportOptions } from './stlParse.ts';
import { buildAsciiStl, buildBinaryStl, STL_SQUARE_FACETS } from './stlTestHelper.ts';

// A facet whose stored normal contradicts its own winding: the vertices wind counter-clockwise (+Z) and the file
// claims -Z. This is the document that makes the two normal policies observably different, which no fixture with a
// correct normal can do.
const CONTRADICTING_FACET = [
  {
    normal: [0, 0, -1],
    vertices: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ],
  },
] as const;

describe('parseStl', () => {
  // ★ PARITY IS THE CLAIM WORTH TESTING, AND IT IS TESTED ON ONE MODEL WRITTEN TWICE. Two encodings, two code
  // paths, one answer. A per-encoding test would pass with the binary reader off by a byte as long as its own
  // expectations were written to match.
  it('reads the same geometry from both encodings of one model', () => {
    const binary = parseStl(buildBinaryStl(STL_SQUARE_FACETS));
    const ascii = parseStl(encodeUTF8(buildAsciiStl(STL_SQUARE_FACETS)));
    expect(binary).not.toBeNull();
    expect(ascii).not.toBeNull();
    expect([...ascii!.vertices]).toEqual([...binary!.vertices]);
    expect(ascii!.layout).toEqual(binary!.layout);
    expect(ascii!.indices).toBe(binary!.indices);
    expect(ascii!.topology).toBe(binary!.topology);
  });

  it('reads a binary file whose 80-byte header begins with the word solid', () => {
    const geometry = parseStl(buildBinaryStl(STL_SQUARE_FACETS, 'solid part'));
    expect(geometry).not.toBeNull();
    expect(positionsOf(geometry!)).toEqual(positionsOf(parseStl(buildBinaryStl(STL_SQUARE_FACETS))!));
  });

  // ★ PER-FACET GEOMETRY, WHICH MEANS NO WELDING. The square's two facets share the corners (0,0,0) and (1,1,0)
  // exactly, so a welding reader would emit 4 vertices where the file describes 6. That is not a size
  // optimisation: welding a corner forces one normal onto facets that each carry their own, inventing smooth
  // shading the format cannot express.
  it('keeps every facet its own three vertices, even where facets share a corner exactly', () => {
    const geometry = parseStl(buildBinaryStl(STL_SQUARE_FACETS))!;
    expect(vertexCountOf(geometry)).toBe(6);
    const positions = positionsOf(geometry);
    expect(positions.filter((position) => position === '0,0,0')).toHaveLength(2);
    expect(positions.filter((position) => position === '1,1,0')).toHaveLength(2);
  });

  // Non-indexed geometry: the index buffer for per-facet triangles would be 0..N-1, which says nothing and costs
  // four bytes a vertex. One subset spans the whole stream.
  it('produces non-indexed triangle-list geometry with one subset over every vertex', () => {
    const geometry = parseStl(buildBinaryStl(STL_SQUARE_FACETS))!;
    expect(geometry.indices).toBeNull();
    expect(geometry.topology).toBe('triangle-list');
    expect(geometry.subsets).toEqual([{ indexCount: 6, indexOffset: 0 }]);
    expect(geometry.layout).toEqual(CANONICAL_LAYOUT);
  });

  it('passes vertex coordinates through verbatim, since STL declares no up axis or unit', () => {
    const geometry = parseStl(encodeUTF8(buildAsciiStl(STL_SQUARE_FACETS)))!;
    expect(positionsOf(geometry)).toEqual(['0,0,0', '1,0,0', '1,1,0', '0,0,0', '1,1,0', '0,1,0']);
  });

  it('zero-fills the channels STL does not carry', () => {
    const geometry = parseStl(buildBinaryStl(STL_SQUARE_FACETS))!;
    for (let vertex = 0; vertex < vertexCountOf(geometry); vertex++) {
      const base = vertex * CANONICAL_FLOATS_PER_VERTEX;
      // tangent (4 floats) then uv0 (2 floats): STL has neither a tangent basis nor texture coordinates.
      expect([...geometry.vertices.subarray(base + 6, base + 12)]).toEqual([0, 0, 0, 0, 0, 0]);
    }
  });

  it('returns null for content that is not a readable STL, rather than throwing', () => {
    expect(parseStl(new Uint8Array(0))).toBeNull();
    expect(parseStl(encodeUTF8('this solid object is not a model'))).toBeNull();
    expect(parseStl(encodeUTF8('solid empty\nendsolid empty'))).toBeNull();
    expect(parseStl(buildBinaryStl([]))).toBeNull();
    const truncated = buildBinaryStl(STL_SQUARE_FACETS).subarray(0, 100);
    expect(parseStl(truncated)).toBeNull();
  });

  it('rejects an ASCII file with one malformed facet rather than reading the rest', () => {
    const text = `${buildAsciiStl(STL_SQUARE_FACETS).split('endsolid')[0]}facet normal 0 0 1\nouter loop\nvertex 0 0 0\nendloop\nendfacet\nendsolid fixture`;
    expect(parseStl(encodeUTF8(text))).toBeNull();
  });
});

describe('stlFullImportOptions', () => {
  it('states the default rather than leaving it implicit', () => {
    expect(stlFullImportOptions).toEqual({ normals: 'RecomputeFromVertices' });
    const explicit = parseStl(buildBinaryStl(CONTRADICTING_FACET), stlFullImportOptions)!;
    const defaulted = parseStl(buildBinaryStl(CONTRADICTING_FACET))!;
    expect([...explicit.vertices]).toEqual([...defaulted.vertices]);
  });
});

describe('the normal policy', () => {
  // ★ MEASURED ON A FACET WHOSE STORED NORMAL CONTRADICTS ITS WINDING, because that is the only document on which
  // the two policies differ. A fixture with a correct normal would pass under either and prove nothing.
  it('recomputes from the winding by default, and honours the stored vector when asked', () => {
    const bytes = buildBinaryStl(CONTRADICTING_FACET);
    expect(normalsOf(parseStl(bytes)!)).toEqual(['0,0,1', '0,0,1', '0,0,1']);
    expect(normalsOf(parseStl(bytes, { normals: 'FileNormals' })!)).toEqual(['0,0,-1', '0,0,-1', '0,0,-1']);
  });

  it('normalizes a stored normal, since length is not part of the file s claim about direction', () => {
    const scaled = [{ normal: [0, 0, 7], vertices: CONTRADICTING_FACET[0].vertices }];
    expect(normalsOf(parseStl(buildBinaryStl(scaled), { normals: 'FileNormals' })!)).toEqual([
      '0,0,1',
      '0,0,1',
      '0,0,1',
    ]);
  });

  // ★ A ZERO NORMAL IS THE ABSENCE OF A NORMAL, AND EXPORTERS WRITE THEM ROUTINELY. Trusting one under
  // `FileNormals` would emit a zero-length normal into the vertex buffer, which lights the facet black — so the
  // policy chooses a SOURCE and falls back when that source has nothing in it. This is the case that would
  // otherwise ship broken data out of a correctly-implemented policy.
  it.each([
    ['a zero normal', [0, 0, 0]],
    ['a NaN normal', [Number.NaN, 0, 0]],
    ['an infinite normal', [Number.POSITIVE_INFINITY, 0, 0]],
  ])('falls back to the computed normal for %s even under FileNormals', (_label, normal) => {
    const bytes = buildBinaryStl([{ normal, vertices: CONTRADICTING_FACET[0].vertices }]);
    expect(normalsOf(parseStl(bytes, { normals: 'FileNormals' })!)).toEqual(['0,0,1', '0,0,1', '0,0,1']);
  });

  // A degenerate triangle has no normal to compute, so both policies answer the zero vector — the honest answer
  // for a facet with no plane. What must not happen is a NaN, which is what an unguarded normalize produces.
  it('emits a zero normal for a degenerate facet rather than a NaN', () => {
    const degenerate = [
      {
        normal: [0, 0, 0],
        vertices: [
          [1, 1, 1],
          [1, 1, 1],
          [1, 1, 1],
        ],
      },
    ];
    for (const options of [undefined, { normals: 'FileNormals' } as const]) {
      const geometry = parseStl(buildBinaryStl(degenerate), options)!;
      expect(normalsOf(geometry)).toEqual(['0,0,0', '0,0,0', '0,0,0']);
      expect([...geometry.vertices].every((value) => Number.isFinite(value))).toBe(true);
    }
  });

  it('reaches the same normals from both encodings under each policy', () => {
    const binary = buildBinaryStl(CONTRADICTING_FACET);
    const ascii = encodeUTF8(buildAsciiStl(CONTRADICTING_FACET));
    for (const options of [undefined, { normals: 'FileNormals' } as const, stlFullImportOptions]) {
      expect(normalsOf(parseStl(ascii, options)!), JSON.stringify(options)).toEqual(
        normalsOf(parseStl(binary, options)!),
      );
    }
  });
});

function normalsOf(geometry: Readonly<MeshGeometry>): string[] {
  const normals: string[] = [];
  for (let vertex = 0; vertex < vertexCountOf(geometry); vertex++) {
    const base = vertex * CANONICAL_FLOATS_PER_VERTEX + 3;
    normals.push([...geometry.vertices.subarray(base, base + 3)].join(','));
  }
  return normals;
}

function positionsOf(geometry: Readonly<MeshGeometry>): string[] {
  const positions: string[] = [];
  for (let vertex = 0; vertex < vertexCountOf(geometry); vertex++) {
    const base = vertex * CANONICAL_FLOATS_PER_VERTEX;
    positions.push([...geometry.vertices.subarray(base, base + 3)].join(','));
  }
  return positions;
}

function vertexCountOf(geometry: Readonly<MeshGeometry>): number {
  return geometry.vertices.length / CANONICAL_FLOATS_PER_VERTEX;
}
