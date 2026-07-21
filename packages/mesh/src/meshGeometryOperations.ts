import { createAabb } from '@flighthq/geometry';
import type { MeshGeometry, MeshSubset, VertexAttributeLayout } from '@flighthq/types';

import { createMeshGeometry, getMeshGeometryVertexCount } from './meshGeometry';
import {
  computeMeshGeometryBounds,
  computeMeshGeometryNormals,
  computeMeshGeometryTangents,
} from './meshGeometryCompute';
import { CANONICAL_MESH_GEOMETRY_LAYOUT } from './meshGeometryLayout';

// Inputs to createMeshGeometryFromAttributes. `positions` is a flat xyz array (3 floats per
// vertex). `normals` (flat xyz) is optional — when omitted, normals are computed from the
// faces. `uvs` (flat uv) is optional. `indices` describes the triangle connectivity; omitted
// for non-indexed geometry.
export interface MeshGeometryFromAttributesOptions {
  indices?: readonly number[] | Uint16Array | Uint32Array | null;
  normals?: readonly number[] | null;
  positions: readonly number[];
  uvs?: readonly number[] | null;
}

// Caller-owned result for resolving one logical triangle into vertex indices. Keeping this flat and
// local avoids allocating a tuple for every triangle in bounds, picking, and authoring passes.
export interface MeshTriangleVertexIndices {
  i0: number;
  i1: number;
  i2: number;
}

// Builds a MeshGeometry from separate position/normal/uv arrays using the canonical 12-float
// PBR record (position + normal + tangent.w + uv0). Normals are computed when omitted;
// tangents are always computed from the UV gradient. Promotes indices to Uint32 past 65535
// vertices. This is the public counterpart to the internal buildCanonicalMeshGeometry used
// by the primitive builders.
export function createMeshGeometryFromAttributes(options: Readonly<MeshGeometryFromAttributesOptions>): MeshGeometry {
  const { positions } = options;
  const vertexCount = positions.length / 3;
  const normals = options.normals ?? null;
  const uvs = options.uvs ?? null;
  const vertices = new Float32Array(vertexCount * CANONICAL_FLOATS_PER_VERTEX);
  for (let i = 0; i < vertexCount; i++) {
    const base = i * CANONICAL_FLOATS_PER_VERTEX;
    vertices[base] = positions[i * 3];
    vertices[base + 1] = positions[i * 3 + 1];
    vertices[base + 2] = positions[i * 3 + 2];
    if (normals) {
      vertices[base + 3] = normals[i * 3];
      vertices[base + 4] = normals[i * 3 + 1];
      vertices[base + 5] = normals[i * 3 + 2];
    }
    if (uvs) {
      vertices[base + 10] = uvs[i * 2];
      vertices[base + 11] = uvs[i * 2 + 1];
    }
  }

  let indexArray: Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer> | undefined;
  if (options.indices) {
    const src = options.indices;
    const needsUint32 = vertexCount > UINT16_INDEX_CEILING;
    if (needsUint32) {
      const a = new Uint32Array(src.length);
      for (let i = 0; i < src.length; i++) a[i] = src[i];
      indexArray = a;
    } else {
      const a = new Uint16Array(src.length);
      for (let i = 0; i < src.length; i++) a[i] = src[i];
      indexArray = a;
    }
  }

  const geometry = createMeshGeometry({
    indices: indexArray,
    layout: CANONICAL_MESH_GEOMETRY_LAYOUT,
    vertices: vertices,
  });
  if (!normals) {
    computeMeshGeometryNormals(geometry, geometry);
  }
  computeMeshGeometryTangents(geometry, geometry);
  const bounds = createAabb();
  computeMeshGeometryBounds(bounds, geometry);
  geometry.bounds = bounds;
  return geometry;
}

// Returns the number of triangles in the geometry for triangle-list and triangle-strip
// topologies. Returns 0 for all other topologies (point-list, line-list, line-strip) since
// those have no well-defined "triangle count".
export function getMeshGeometryTriangleCount(geometry: Readonly<MeshGeometry>): number {
  if (geometry.topology === 'triangle-list') {
    const indexCount = geometry.indices ? geometry.indices.length : getMeshGeometryVertexCount(geometry);
    return Math.floor(indexCount / 3);
  }
  if (geometry.topology === 'triangle-strip') {
    const indexCount = geometry.indices ? geometry.indices.length : getMeshGeometryVertexCount(geometry);
    return indexCount >= 3 ? indexCount - 2 : 0;
  }
  return 0;
}

// Resolves one logical triangle for indexed or non-indexed triangle-list/triangle-strip geometry.
// Strip winding alternates, so odd triangles swap their first two vertices and retain the geometry's
// declared CCW front-face convention. Returns false without changing `out` for an unsupported
// topology or out-of-range triangle.
export function getMeshGeometryTriangleVertexIndices(
  out: MeshTriangleVertexIndices,
  geometry: Readonly<MeshGeometry>,
  triangleIndex: number,
): boolean {
  if (triangleIndex < 0 || triangleIndex >= getMeshGeometryTriangleCount(geometry)) return false;

  let element0: number;
  let element1: number;
  let element2: number;
  if (geometry.topology === 'triangle-list') {
    element0 = triangleIndex * 3;
    element1 = element0 + 1;
    element2 = element0 + 2;
  } else if (geometry.topology === 'triangle-strip') {
    element0 = triangleIndex;
    element1 = triangleIndex + 1;
    element2 = triangleIndex + 2;
    if ((triangleIndex & 1) !== 0) {
      const swap = element0;
      element0 = element1;
      element1 = swap;
    }
  } else {
    return false;
  }

  const indices = geometry.indices;
  out.i0 = indices ? indices[element0] : element0;
  out.i1 = indices ? indices[element1] : element1;
  out.i2 = indices ? indices[element2] : element2;
  return true;
}

// Concatenates multiple geometries into a single MeshGeometry. All source geometries must share
// the same layout (checked by matching stride and attribute count, semantic, and format) — returns
// null on mismatch. Index buffers are offset so each source's indices remain valid within the
// merged vertex stream. Subsets are re-based so each source's draw ranges are individually
// addressable. Bounds are recomputed. An empty array returns null.
export function mergeMeshGeometries(geometries: readonly Readonly<MeshGeometry>[]): MeshGeometry | null {
  if (geometries.length === 0) return null;
  const reference = geometries[0];
  const layout = reference.layout;
  for (let i = 1; i < geometries.length; i++) {
    if (!layoutsMatch(layout, geometries[i].layout)) return null;
  }

  const floatsPerVertex = layout.stride / 4;
  let totalVertexFloats = 0;
  let totalIndexCount = 0;
  let allIndexed = true;
  for (const geo of geometries) {
    const vc = floatsPerVertex > 0 ? Math.floor(geo.vertices.length / floatsPerVertex) : 0;
    totalVertexFloats += vc * floatsPerVertex;
    if (geo.indices) {
      totalIndexCount += geo.indices.length;
    } else {
      allIndexed = false;
      totalIndexCount += vc;
    }
  }

  const mergedVertices = new Float32Array(totalVertexFloats);
  const needsUint32 = totalVertexFloats / floatsPerVertex > UINT16_INDEX_CEILING;
  const mergedIndices =
    allIndexed || totalIndexCount > 0
      ? needsUint32
        ? new Uint32Array(totalIndexCount)
        : new Uint16Array(totalIndexCount)
      : null;
  const mergedSubsets: MeshSubset[] = [];

  let vertexOffset = 0;
  let indexOffset = 0;
  let vertexFloatOffset = 0;
  for (const geo of geometries) {
    const vc = floatsPerVertex > 0 ? Math.floor(geo.vertices.length / floatsPerVertex) : 0;
    mergedVertices.set(geo.vertices.subarray(0, vc * floatsPerVertex), vertexFloatOffset);
    if (mergedIndices) {
      const srcCount = geo.indices ? geo.indices.length : vc;
      for (let j = 0; j < srcCount; j++) {
        const srcIdx = geo.indices ? geo.indices[j] : j;
        mergedIndices[indexOffset + j] = srcIdx + vertexOffset;
      }
      // Carry over per-source subsets with re-based indexOffset.
      for (const subset of geo.subsets) {
        mergedSubsets.push({
          indexCount: subset.indexCount,
          indexOffset: subset.indexOffset + indexOffset,
        });
      }
      indexOffset += srcCount;
    }
    vertexOffset += vc;
    vertexFloatOffset += vc * floatsPerVertex;
  }

  if (mergedSubsets.length === 0) {
    mergedSubsets.push({
      indexCount: mergedIndices ? mergedIndices.length : totalVertexFloats / floatsPerVertex,
      indexOffset: 0,
    });
  }

  const merged = createMeshGeometry({
    indices: mergedIndices ?? undefined,
    layout: layout,
    subsets: mergedSubsets,
    topology: reference.topology,
    vertices: mergedVertices,
  });
  const bounds = createAabb();
  computeMeshGeometryBounds(bounds, merged);
  merged.bounds = bounds;
  return merged;
}

// Validates a geometry for common structural errors. Returns true when the geometry is valid.
// Returns false (does not throw) for: index values out of vertex range, vertex stream length
// not divisible by the layout stride, and NaN or Infinity in position attributes.
export function validateMeshGeometry(geometry: Readonly<MeshGeometry>): boolean {
  const floatsPerVertex = geometry.layout.stride / 4;
  if (floatsPerVertex <= 0) return false;
  // Vertex stream must be an exact multiple of the stride.
  if (geometry.vertices.length % floatsPerVertex !== 0) return false;
  const vertexCount = Math.floor(geometry.vertices.length / floatsPerVertex);
  // All index values must be within [0, vertexCount).
  if (geometry.indices) {
    for (let i = 0; i < geometry.indices.length; i++) {
      if (geometry.indices[i] >= vertexCount) return false;
    }
  }
  // Find the position attribute float offset; only check positions for NaN/Inf.
  let posOffset = -1;
  for (let i = 0; i < geometry.layout.attributes.length; i++) {
    const attr = geometry.layout.attributes[i];
    if (attr.semantic === 'position' && attr.format.startsWith('float32')) {
      posOffset = attr.byteOffset / 4;
      break;
    }
  }
  if (posOffset >= 0) {
    const verts = geometry.vertices;
    for (let i = 0; i < vertexCount; i++) {
      const base = i * floatsPerVertex + posOffset;
      const x = verts[base],
        y = verts[base + 1],
        z = verts[base + 2];
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return false;
    }
  }
  return true;
}

// Checks whether two VertexAttributeLayouts are compatible for merging: same stride and the
// same attributes in the same order (same semantic, format, and byteOffset).
function layoutsMatch(a: Readonly<VertexAttributeLayout>, b: Readonly<VertexAttributeLayout>): boolean {
  if (a.stride !== b.stride) return false;
  if (a.attributes.length !== b.attributes.length) return false;
  for (let i = 0; i < a.attributes.length; i++) {
    const aa = a.attributes[i],
      ba = b.attributes[i];
    if (aa.semantic !== ba.semantic || aa.format !== ba.format || aa.byteOffset !== ba.byteOffset) return false;
  }
  return true;
}

const CANONICAL_FLOATS_PER_VERTEX = 12;
const UINT16_INDEX_CEILING = 65535;
