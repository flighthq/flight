import { encodeUTF8 } from '@flighthq/encoding/contract';

import { BINARY_STL_COUNT_OFFSET, BINARY_STL_HEADER_SIZE, BINARY_STL_TRIANGLE_SIZE } from './stlFeatures.ts';

/**
 * Writes facets as an ASCII STL, in the layout every STL writer emits.
 *
 * ★ SHARED WITH THE BINARY WRITER SO THE PARITY TESTS CANNOT DRIFT. A binary/ASCII parity assertion claims that
 * one model written two ways reads back identically; if each test built its own pair of fixtures, a typo in one
 * would read as a parser disagreement rather than as a broken fixture. Both writers take the same facet list.
 */
export function buildAsciiStl(facets: readonly StlFacetLike[], name = 'fixture'): string {
  const lines = [`solid ${name}`];
  for (const facet of facets) {
    lines.push(`  facet normal ${facet.normal.join(' ')}`);
    lines.push('    outer loop');
    for (const vertex of facet.vertices) lines.push(`      vertex ${vertex.join(' ')}`);
    lines.push('    endloop');
    lines.push('  endfacet');
  }
  lines.push(`endsolid ${name}`);
  return lines.join('\n');
}

/**
 * Writes facets as a binary STL.
 *
 * `header` is settable because the 80-byte header is exactly where the format's worst trap lives: a binary file is
 * allowed to begin with the word `solid`, which is also how every ASCII file begins.
 */
export function buildBinaryStl(facets: readonly StlFacetLike[], header = 'binary stl fixture'): Uint8Array {
  const bytes = new Uint8Array(BINARY_STL_HEADER_SIZE + facets.length * BINARY_STL_TRIANGLE_SIZE);
  const headerBytes = encodeUTF8(header);
  bytes.set(headerBytes.subarray(0, Math.min(headerBytes.length, BINARY_STL_COUNT_OFFSET)), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(BINARY_STL_COUNT_OFFSET, facets.length, true);
  for (let triangle = 0; triangle < facets.length; triangle++) {
    const base = BINARY_STL_HEADER_SIZE + triangle * BINARY_STL_TRIANGLE_SIZE;
    const facet = facets[triangle];
    writeFloat32Triple(view, base, facet.normal);
    for (let corner = 0; corner < 3; corner++) {
      writeFloat32Triple(view, base + 12 + corner * 12, facet.vertices[corner]);
    }
    view.setUint16(base + 48, 0, true);
  }
  return bytes;
}

/**
 * Two facets of a unit square in the XY plane, wound counter-clockwise so the geometric normal is +Z.
 *
 * The stored normals are deliberately CORRECT here, so a test that swaps the normal policy measures the policy
 * rather than a broken fixture.
 */
export const STL_SQUARE_FACETS: readonly StlFacetLike[] = [
  {
    normal: [0, 0, 1],
    vertices: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
    ],
  },
  {
    normal: [0, 0, 1],
    vertices: [
      [0, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
];

// A structural facet shape, not an exported type: every exported type lives in `@flighthq/types`, and a fixture
// input has no business there. Structural literals are the endorsed form for `*Like` inputs.
type StlFacetLike = Readonly<{ normal: readonly number[]; vertices: readonly (readonly number[])[] }>;

function writeFloat32Triple(view: DataView, offset: number, value: readonly number[]): void {
  view.setFloat32(offset, value[0], true);
  view.setFloat32(offset + 4, value[1], true);
  view.setFloat32(offset + 8, value[2], true);
}
