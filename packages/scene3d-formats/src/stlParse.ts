import { decodeUTF8 } from '@flighthq/encoding/contract';
import { createMeshGeometry } from '@flighthq/mesh/contract';
import type { MeshGeometry, StlImportOptions, StlNormalPolicy } from '@flighthq/types/contract';

import { CANONICAL_FLOATS_PER_VERTEX, CANONICAL_LAYOUT } from './shared.ts';
import {
  BINARY_STL_HEADER_SIZE,
  BINARY_STL_TRIANGLE_SIZE,
  countAsciiStlFacets,
  readBinaryStlTriangleCount,
} from './stlFeatures.ts';

/**
 * Reads an STL file — either encoding — into one `MeshGeometry`, or `null` when the bytes are not a readable STL.
 *
 * ★ WHAT THIS DELIBERATELY DOES NOT DO. STL is a list of triangles and nothing else: no materials, no texture
 * coordinates, no node hierarchy, no animation, no skins, no cameras, no lights, no units, no colours in the
 * standard format. So this returns GEOMETRY, not a document, and imports no material, animation, skeleton or
 * scene module. A caller who wants a scene node builds one; a bedrock parser that reached for the scene stack
 * would make every STL import pay for a graph the format cannot describe.
 *
 * ★ PER-FACET GEOMETRY IS PRESERVED, WHICH MEANS NO WELDING AND NO INDEX BUFFER. Every facet contributes its own
 * three vertices, even where facets share a corner position exactly. That is the file's own structure: STL has no
 * shared-vertex concept, each facet carries its own normal, and welding would have to choose one normal for a
 * merged corner — inventing smooth shading the file never asked for. The geometry is therefore NON-INDEXED
 * (`indices` is null, one subset spanning every vertex), which is also the smaller representation: a 0..N-1 index
 * buffer would add four bytes per vertex to say nothing.
 *
 * Vertex coordinates pass through verbatim. STL declares no up axis and no unit — CAD tools that write it are
 * usually Z-up, renderers are usually Y-up, and nothing in the file says which this one is. Rotating silently on
 * import would be a guess applied to every file; a caller who knows their producer applies a transform.
 *
 * Returns `null`, never throws, for a file that is not an STL or is truncated: `collectStlFeatures` is the same
 * question asked without building anything.
 */
export function parseStl(bytes: Readonly<Uint8Array>, options?: Readonly<StlImportOptions>): MeshGeometry | null {
  const policy = options?.normals ?? stlFullImportOptions.normals;
  const binaryCount = readBinaryStlTriangleCount(bytes);
  if (binaryCount !== null) return buildStlGeometry(readBinaryStlFacets(bytes, binaryCount), policy);
  const text = decodeUTF8(bytes);
  if (countAsciiStlFacets(text) === null) return null;
  return buildStlGeometry(readAsciiStlFacets(text), policy);
}

/**
 * Every STL import decision, stated.
 *
 * The counterpart of the other formats' full presets, and deliberately thin: STL has one decision in it, so
 * "everything this format can be asked" is one field. Naming it is how a caller — or a generated manifest
 * module — states the default rather than relying on it.
 *
 * `RecomputeFromVertices` is the default because the winding IS the geometry Flight rasterizes (right-handed,
 * CCW front face, pinned across the 3D suite), so a normal derived from it cannot contradict the triangle it
 * belongs to. A stored normal can, and in real exports frequently does.
 */
export const stlFullImportOptions: Required<StlImportOptions> = { normals: 'RecomputeFromVertices' };

// One facet as the file states it: the stored normal and the three corners, all in file order.
interface StlFacet {
  normal: readonly [number, number, number];
  vertices: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ];
}

// Interleaves the facets into the canonical vertex record under the chosen normal policy.
//
// Tangent and uv0 are zero-filled: STL carries neither, and the canonical record is used anyway so STL geometry
// binds through the same layout as every other importer's output rather than through a shape no renderer expects.
function buildStlGeometry(facets: readonly StlFacet[], policy: StlNormalPolicy): MeshGeometry | null {
  if (facets.length === 0) return null;
  const vertices = new Float32Array(facets.length * 3 * CANONICAL_FLOATS_PER_VERTEX);
  let offset = 0;
  for (const facet of facets) {
    const normal = resolveFacetNormal(facet, policy);
    for (const vertex of facet.vertices) {
      vertices[offset] = vertex[0];
      vertices[offset + 1] = vertex[1];
      vertices[offset + 2] = vertex[2];
      vertices[offset + 3] = normal[0];
      vertices[offset + 4] = normal[1];
      vertices[offset + 5] = normal[2];
      offset += CANONICAL_FLOATS_PER_VERTEX;
    }
  }
  return createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices });
}

// The geometric normal of a facet: the normalized cross product of its edges, or the zero vector for a
// degenerate triangle (collinear or coincident corners), which has no normal to compute.
function computeFacetNormal(facet: StlFacet): readonly [number, number, number] {
  const [a, b, c] = facet.vertices;
  const abX = b[0] - a[0];
  const abY = b[1] - a[1];
  const abZ = b[2] - a[2];
  const acX = c[0] - a[0];
  const acY = c[1] - a[1];
  const acZ = c[2] - a[2];
  return normalizeVector([abY * acZ - abZ * acY, abZ * acX - abX * acZ, abX * acY - abY * acX]);
}

// Reads the facets of an ASCII STL. Called only after `countAsciiStlFacets` has accepted the text, so the
// grammar is already known to hold and this walk does no re-validation — the validation lives in exactly one
// place, and a second copy of it here could disagree with the one that decided the file was an STL.
function readAsciiStlFacets(text: string): readonly StlFacet[] {
  const facets: StlFacet[] = [];
  const tokens = text.trim().split(/\s+/);
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index].toLowerCase() !== 'facet') continue;
    const normal = readNumberTriple(tokens, index + 2);
    const corners: (readonly [number, number, number])[] = [];
    let cursor = index + 7;
    for (let vertex = 0; vertex < 3; vertex++) {
      corners.push(readNumberTriple(tokens, cursor + 1));
      cursor += 4;
    }
    facets.push({ normal, vertices: [corners[0], corners[1], corners[2]] });
    index = cursor + 1;
  }
  return facets;
}

// Reads the facets of a binary STL. Each triangle is a normal and three vertices as little-endian float32,
// followed by a uint16 "attribute byte count" that the standard format leaves unused — some writers pack a
// colour there, which is a vendor extension this parser does not claim to read.
function readBinaryStlFacets(bytes: Readonly<Uint8Array>, count: number): readonly StlFacet[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const facets: StlFacet[] = [];
  for (let triangle = 0; triangle < count; triangle++) {
    const base = BINARY_STL_HEADER_SIZE + triangle * BINARY_STL_TRIANGLE_SIZE;
    facets.push({
      normal: readFloat32Triple(view, base),
      vertices: [
        readFloat32Triple(view, base + 12),
        readFloat32Triple(view, base + 24),
        readFloat32Triple(view, base + 36),
      ],
    });
  }
  return facets;
}

function readFloat32Triple(view: DataView, offset: number): readonly [number, number, number] {
  return [view.getFloat32(offset, true), view.getFloat32(offset + 4, true), view.getFloat32(offset + 8, true)];
}

function readNumberTriple(tokens: readonly string[], start: number): readonly [number, number, number] {
  return [Number(tokens[start]), Number(tokens[start + 1]), Number(tokens[start + 2])];
}

/**
 * The normal this facet's vertices will carry.
 *
 * ★ THE FALLBACK IS NOT A THIRD POLICY. `FileNormals` means "use the stored vector", and a stored vector that is
 * zero-length or non-finite is not a vector — it is the absence of one, which STL writers emit routinely and
 * which would light the facet black. Falling back to the computed normal is what makes `FileNormals` a choice of
 * SOURCE rather than a choice to ship broken data. A stored normal that is merely unnormalized is honoured, and
 * normalized: length is not part of the file's claim about direction.
 */
function resolveFacetNormal(facet: StlFacet, policy: StlNormalPolicy): readonly [number, number, number] {
  if (policy === 'RecomputeFromVertices') return computeFacetNormal(facet);
  const stored = normalizeVector(facet.normal);
  return stored[0] === 0 && stored[1] === 0 && stored[2] === 0 ? computeFacetNormal(facet) : stored;
}

// Scales a vector to unit length, answering the zero vector when it has no length to scale — which is the same
// answer for a zero input and for a non-finite one, both of which are "no direction".
function normalizeVector(vector: readonly [number, number, number]): readonly [number, number, number] {
  const lengthSquared = vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2];
  if (!Number.isFinite(lengthSquared) || lengthSquared === 0) return ZERO_VECTOR;
  const scale = 1 / Math.sqrt(lengthSquared);
  return [vector[0] * scale, vector[1] * scale, vector[2] * scale];
}

const ZERO_VECTOR: readonly [number, number, number] = [0, 0, 0];
