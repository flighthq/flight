import type { MeshGeometry } from '@flighthq/types';

import { cloneMeshGeometry, getMeshGeometryVertexCount } from './meshGeometry';

// Index-buffer pipeline over a MeshGeometry: de-index a welded stream to a flat non-indexed one,
// and derive a wireframe line-list from a triangle index buffer. These read the existing
// vertex/index streams and produce fresh data; they do not mutate the source geometry.

// Returns the wireframe line-list index buffer for the geometry's triangle indices: every triangle
// edge expands to a two-index line segment, so a triangle (a, b, c) yields the lines (a, b),
// (b, c), (c, a). Reads the existing index stream (or sequential triangles for non-indexed
// geometry) and assembles a new index buffer suitable for `line-list` topology. Returns an empty
// buffer for geometry whose topology is not a triangle family. The element type matches the source
// index width (Uint32 for non-indexed, mirroring the source buffer otherwise).
export function computeMeshGeometryWireframeIndices(
  geometry: Readonly<MeshGeometry>,
): Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer> {
  const useUint32 = geometry.indices ? geometry.indices instanceof Uint32Array : true;
  if (geometry.topology !== 'triangle-list' && geometry.topology !== 'triangle-strip') {
    return useUint32 ? new Uint32Array(0) : new Uint16Array(0);
  }

  const indices = geometry.indices;
  const floatsPerVertex = geometry.layout.stride / 4;
  const vertexCount = floatsPerVertex > 0 ? Math.floor(geometry.vertices.length / floatsPerVertex) : 0;
  const indexCount = indices ? indices.length : vertexCount;

  const lines: number[] = [];
  if (geometry.topology === 'triangle-list') {
    for (let t = 0; t + 2 < indexCount; t += 3) {
      const a = indices ? indices[t] : t;
      const b = indices ? indices[t + 1] : t + 1;
      const c = indices ? indices[t + 2] : t + 2;
      lines.push(a, b, b, c, c, a);
    }
  } else {
    for (let t = 0; t + 2 < indexCount; t++) {
      const a = indices ? indices[t] : t;
      const b = indices ? indices[t + 1] : t + 1;
      const c = indices ? indices[t + 2] : t + 2;
      lines.push(a, b, b, c, c, a);
    }
  }

  if (useUint32) {
    const out = new Uint32Array(lines.length);
    out.set(lines);
    return out;
  }
  const out = new Uint16Array(lines.length);
  out.set(lines);
  return out;
}

// De-indexes (un-welds) the geometry into a flat non-indexed stream: each triangle index expands
// into its own copy of the referenced vertex record, so shared vertices become distinct. The
// result is a new MeshGeometry with the same layout, topology, subsets, and bounds but `indices`
// null. Subset offsets/counts address the same element positions after expansion and therefore remain
// valid. This is the prerequisite for truly per-face attributes (flat shading,
// per-face UVs) where shared vertices must not be welded. Non-indexed geometry is deep-copied as-is.
export function expandMeshGeometryIndices(geometry: Readonly<MeshGeometry>): MeshGeometry {
  const indices = geometry.indices;
  const floatsPerVertex = geometry.layout.stride / 4;
  const sourceVertices = geometry.vertices;

  if (!indices) return cloneMeshGeometry(geometry);

  const vertices = new Float32Array(indices.length * floatsPerVertex);
  for (let i = 0; i < indices.length; i++) {
    const src = indices[i] * floatsPerVertex;
    const dst = i * floatsPerVertex;
    for (let f = 0; f < floatsPerVertex; f++) {
      vertices[dst + f] = sourceVertices[src + f];
    }
  }

  const out = cloneMeshGeometry(geometry);
  out.indices = null;
  out.vertices = vertices;
  return out;
}

// Converts a non-indexed vertex stream to an indexed stream without welding or changing record order:
// index i references vertex i. Already-indexed input is deep-cloned unchanged. This deliberately keeps
// conversion separate from deduplication so callers can establish indexed draw shape without paying for
// hashing or changing vertex identity. Subsets, topology, bounds, and raw packed record bytes survive.
export function indexMeshGeometryVertices(geometry: Readonly<MeshGeometry>): MeshGeometry {
  const out = cloneMeshGeometry(geometry);
  if (out.indices !== null) return out;
  const vertexCount = getMeshGeometryVertexCount(out);
  const indices = vertexCount > UINT16_INDEX_CEILING ? new Uint32Array(vertexCount) : new Uint16Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) indices[i] = i;
  out.indices = indices;
  return out;
}

// Exactly welds byte-identical interleaved vertex records and remaps the existing element stream (or
// the sequential stream for non-indexed input) to the unique records. Equality covers the complete
// record, including packed channels and padding; this never guesses a position/normal/UV tolerance.
// A later tolerance-based authoring operation can compose above this unambiguous primitive. Invalid
// stride alignment returns an unchanged deep clone rather than manufacturing a partial geometry.
export function weldMeshGeometryVertices(geometry: Readonly<MeshGeometry>): MeshGeometry {
  const stride = geometry.layout.stride;
  const sourceByteLength = geometry.vertices.byteLength;
  if (stride <= 0 || stride % 4 !== 0 || sourceByteLength % stride !== 0) return cloneMeshGeometry(geometry);

  const vertexCount = sourceByteLength / stride;
  const sourceBytes = new Uint8Array(
    geometry.vertices.buffer,
    geometry.vertices.byteOffset,
    geometry.vertices.byteLength,
  );
  const uniqueBytes = new Uint8Array(sourceByteLength);
  const sourceToUnique = new Uint32Array(vertexCount);
  const candidatesByHash = new Map<number, number[]>();
  let uniqueCount = 0;

  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const sourceOffset = vertex * stride;
    const hash = hashVertexRecord(sourceBytes, sourceOffset, stride);
    const candidates = candidatesByHash.get(hash);
    let uniqueIndex = -1;
    if (candidates !== undefined) {
      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        if (equalVertexRecord(sourceBytes, sourceOffset, uniqueBytes, candidate * stride, stride)) {
          uniqueIndex = candidate;
          break;
        }
      }
    }
    if (uniqueIndex < 0) {
      uniqueIndex = uniqueCount++;
      uniqueBytes.set(sourceBytes.subarray(sourceOffset, sourceOffset + stride), uniqueIndex * stride);
      if (candidates === undefined) candidatesByHash.set(hash, [uniqueIndex]);
      else candidates.push(uniqueIndex);
    }
    sourceToUnique[vertex] = uniqueIndex;
  }

  const elementCount = geometry.indices?.length ?? vertexCount;
  const indices = uniqueCount > UINT16_INDEX_CEILING ? new Uint32Array(elementCount) : new Uint16Array(elementCount);
  for (let element = 0; element < elementCount; element++) {
    const sourceIndex = geometry.indices?.[element] ?? element;
    if (sourceIndex >= vertexCount) return cloneMeshGeometry(geometry);
    indices[element] = sourceToUnique[sourceIndex];
  }

  const weldedBuffer = uniqueBytes.buffer.slice(0, uniqueCount * stride);
  const out = cloneMeshGeometry(geometry);
  out.vertices = new Float32Array(weldedBuffer);
  out.indices = indices;
  return out;
}

function equalVertexRecord(
  a: Readonly<Uint8Array>,
  aOffset: number,
  b: Readonly<Uint8Array>,
  bOffset: number,
  byteLength: number,
): boolean {
  for (let i = 0; i < byteLength; i++) {
    if (a[aOffset + i] !== b[bOffset + i]) return false;
  }
  return true;
}

function hashVertexRecord(bytes: Readonly<Uint8Array>, offset: number, byteLength: number): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < byteLength; i++) {
    hash ^= bytes[offset + i];
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const UINT16_INDEX_CEILING = 65_535;
