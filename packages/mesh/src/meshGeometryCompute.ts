import { createAabb } from '@flighthq/geometry/contract';
import type {
  Aabb,
  AabbLike,
  BoundingSphereLike,
  MeshGeometry,
  MeshGeometryRuntime,
  MeshTriangleVertexIndices,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { getMeshGeometryTriangleCount, getMeshGeometryTriangleVertexIndices } from './meshGeometryOperations';

// Per-vertex compute over the canonical interleaved PBR record: position(3) + normal(3) +
// tangent(4) + uv0(2) = 12 floats / 48 bytes, stride read from geometry.layout. These functions
// derive normals, tangents, and the local-space AABB from `geometry.vertices` (+ `geometry.indices`)
// and write into `out`. They read every input field they need into locals before writing, so each
// is safe when `out` aliases `geometry`. Normals write back in place; tangents do too unless an
// indexed mirrored-UV seam requires complete interleaved vertex records to be duplicated first.

// Writes the bounding sphere of all vertex positions into `out`. Uses the AABB midpoint as the
// center (fast, not minimal) and max-distance from that center as the radius. An empty vertex
// stream yields center = (0,0,0) and a negative radius (empty convention). The radius is always
// non-negative when at least one vertex is present. Safe when `out` aliases `geometry` (bounds
// are computed before any write to `out`).
export function computeMeshGeometryBoundingSphere(out: BoundingSphereLike, geometry: Readonly<MeshGeometry>): void {
  const vertices = geometry.vertices;
  const floatsPerVertex = geometry.layout.stride / 4;
  const vertexCount = floatsPerVertex > 0 ? Math.floor(vertices.length / floatsPerVertex) : 0;

  if (vertexCount === 0) {
    out.center.x = 0;
    out.center.y = 0;
    out.center.z = 0;
    out.radius = -1;
    return;
  }

  // Compute the AABB to find the midpoint center.
  let minX = Number.POSITIVE_INFINITY,
    minY = Number.POSITIVE_INFINITY,
    minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY,
    maxY = Number.NEGATIVE_INFINITY,
    maxZ = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < vertexCount; i++) {
    const base = i * floatsPerVertex + POSITION_OFFSET;
    const px = vertices[base],
      py = vertices[base + 1],
      pz = vertices[base + 2];
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (pz < minZ) minZ = pz;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
    if (pz > maxZ) maxZ = pz;
  }

  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;

  // Radius = max distance from center to any vertex.
  let radiusSq = 0;
  for (let i = 0; i < vertexCount; i++) {
    const base = i * floatsPerVertex + POSITION_OFFSET;
    const dx = vertices[base] - cx;
    const dy = vertices[base + 1] - cy;
    const dz = vertices[base + 2] - cz;
    const dSq = dx * dx + dy * dy + dz * dz;
    if (dSq > radiusSq) radiusSq = dSq;
  }

  out.center.x = cx;
  out.center.y = cy;
  out.center.z = cz;
  out.radius = Math.sqrt(radiusSq);
}

// Writes the tight axis-aligned bounding box of all vertex positions into `out`. An empty vertex
// stream yields an empty box (min = +Infinity, max = -Infinity). Reads all positions before
// writing the corners, so it is safe when `out` aliases `geometry.bounds`.
export function computeMeshGeometryBounds(out: AabbLike, geometry: Readonly<MeshGeometry>): void {
  const vertices = geometry.vertices;
  const floatsPerVertex = geometry.layout.stride / 4;
  const vertexCount = floatsPerVertex > 0 ? Math.floor(vertices.length / floatsPerVertex) : 0;

  let minX = Number.POSITIVE_INFINITY,
    minY = Number.POSITIVE_INFINITY,
    minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY,
    maxY = Number.NEGATIVE_INFINITY,
    maxZ = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < vertexCount; i++) {
    const base = i * floatsPerVertex + POSITION_OFFSET;
    const px = vertices[base],
      py = vertices[base + 1],
      pz = vertices[base + 2];
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (pz < minZ) minZ = pz;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
    if (pz > maxZ) maxZ = pz;
  }

  out.min.x = minX;
  out.min.y = minY;
  out.min.z = minZ;
  out.max.x = maxX;
  out.max.y = maxY;
  out.max.z = maxZ;
}

// Recomputes per-face (flat) normals and writes them into the normal slot of `out.vertices`.
// Each triangle's face normal (CCW front-face → right-handed cross product) is assigned to all
// three of its corner vertices. When multiple triangles share a vertex the last triangle to
// write wins — for truly flat shading callers should de-index first with `expandMeshGeometryIndices`.
// For non-indexed geometry the in-place result is exact: each group of three vertices belongs to
// exactly one triangle. Safe when `out === geometry` (positions are read into locals before any
// normal write).
export function computeMeshGeometryFlatNormals(out: MeshGeometry, geometry: Readonly<MeshGeometry>): void {
  const srcVerts = geometry.vertices;
  const floatsPerVertex = geometry.layout.stride / 4;
  const dstVerts = out.vertices;

  // Decode through the shared triangle walker so triangle-strip topology is honoured; hand-decoding
  // index triples silently drops every strip triangle after the first.
  const triangleCount = getMeshGeometryTriangleCount(geometry);
  const corner: MeshTriangleVertexIndices = { i0: 0, i1: 0, i2: 0 };

  for (let triangle = 0; triangle < triangleCount; triangle++) {
    if (!getMeshGeometryTriangleVertexIndices(corner, geometry, triangle)) continue;
    const i0 = corner.i0;
    const i1 = corner.i1;
    const i2 = corner.i2;

    const p0 = i0 * floatsPerVertex + POSITION_OFFSET;
    const p1 = i1 * floatsPerVertex + POSITION_OFFSET;
    const p2 = i2 * floatsPerVertex + POSITION_OFFSET;

    // Read positions into locals before any write (alias-safe when out === geometry).
    const x0 = srcVerts[p0],
      y0 = srcVerts[p0 + 1],
      z0 = srcVerts[p0 + 2];
    const x1 = srcVerts[p1],
      y1 = srcVerts[p1 + 1],
      z1 = srcVerts[p1 + 2];
    const x2 = srcVerts[p2],
      y2 = srcVerts[p2 + 1],
      z2 = srcVerts[p2 + 2];

    // CCW cross: (p1-p0) × (p2-p0).
    const ex1 = x1 - x0,
      ey1 = y1 - y0,
      ez1 = z1 - z0;
    const ex2 = x2 - x0,
      ey2 = y2 - y0,
      ez2 = z2 - z0;
    let nx = ey1 * ez2 - ez1 * ey2;
    let ny = ez1 * ex2 - ex1 * ez2;
    let nz = ex1 * ey2 - ey1 * ex2;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    }

    const n0 = i0 * floatsPerVertex + NORMAL_OFFSET;
    const n1 = i1 * floatsPerVertex + NORMAL_OFFSET;
    const n2 = i2 * floatsPerVertex + NORMAL_OFFSET;
    dstVerts[n0] = nx;
    dstVerts[n0 + 1] = ny;
    dstVerts[n0 + 2] = nz;
    dstVerts[n1] = nx;
    dstVerts[n1 + 1] = ny;
    dstVerts[n1 + 2] = nz;
    dstVerts[n2] = nx;
    dstVerts[n2 + 1] = ny;
    dstVerts[n2 + 2] = nz;
  }

  out.version++;
}

// Recomputes per-vertex smooth normals by area-weighted accumulation of triangle face normals
// (right-handed, CCW front-face), normalizes them, and writes them into the normal slot of
// `out.vertices`. Operates on indexed triangle-list geometry; non-indexed streams are treated as
// sequential triangles. When `positionGroups` is present, it must contain one canonical vertex
// index per vertex; face normals accumulate into those groups before normalization and every member
// reads back from its group. The opt-in map avoids smoothing unrelated surfaces that merely happen
// to meet at the same position. `out` is normally `geometry` itself (in-place), which is safe:
// positions are only read and normals are accumulated in a scratch buffer before any write-back.
export function computeMeshGeometryNormals(
  out: MeshGeometry,
  geometry: Readonly<MeshGeometry>,
  positionGroups: Readonly<Uint32Array<ArrayBuffer>> | null = null,
): void {
  const vertices = geometry.vertices;
  const floatsPerVertex = geometry.layout.stride / 4;
  const vertexCount = floatsPerVertex > 0 ? Math.floor(vertices.length / floatsPerVertex) : 0;
  const accum = new Float64Array(vertexCount * 3);

  // Same shared walker as the flat pass, for the same reason.
  const triangleCount = getMeshGeometryTriangleCount(geometry);
  const corner: MeshTriangleVertexIndices = { i0: 0, i1: 0, i2: 0 };

  for (let triangle = 0; triangle < triangleCount; triangle++) {
    if (!getMeshGeometryTriangleVertexIndices(corner, geometry, triangle)) continue;
    const i0 = corner.i0;
    const i1 = corner.i1;
    const i2 = corner.i2;

    const b0 = i0 * floatsPerVertex + POSITION_OFFSET;
    const b1 = i1 * floatsPerVertex + POSITION_OFFSET;
    const b2 = i2 * floatsPerVertex + POSITION_OFFSET;

    const e1x = vertices[b1] - vertices[b0];
    const e1y = vertices[b1 + 1] - vertices[b0 + 1];
    const e1z = vertices[b1 + 2] - vertices[b0 + 2];
    const e2x = vertices[b2] - vertices[b0];
    const e2y = vertices[b2 + 1] - vertices[b0 + 1];
    const e2z = vertices[b2 + 2] - vertices[b0 + 2];

    // Unnormalized cross product is area-weighted (magnitude = 2 * triangle area).
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    accumulateNormal(accum, positionGroups === null ? i0 : positionGroups[i0], nx, ny, nz);
    accumulateNormal(accum, positionGroups === null ? i1 : positionGroups[i1], nx, ny, nz);
    accumulateNormal(accum, positionGroups === null ? i2 : positionGroups[i2], nx, ny, nz);
  }

  const target = out.vertices;
  for (let i = 0; i < vertexCount; i++) {
    const accumulated = (positionGroups === null ? i : positionGroups[i]) * 3;
    let nx = accum[accumulated],
      ny = accum[accumulated + 1],
      nz = accum[accumulated + 2];
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    }
    const base = i * floatsPerVertex + NORMAL_OFFSET;
    target[base] = nx;
    target[base + 1] = ny;
    target[base + 2] = nz;
  }
}

// Returns one canonical representative index per vertex, grouping only vertices whose three stored
// Float32 position components are bit-identical. Other attributes do not participate, and no
// tolerance is applied. The first vertex encountered at a position is its canonical representative.
export function computeMeshGeometryPositionGroups(geometry: Readonly<MeshGeometry>): Uint32Array<ArrayBuffer> {
  const vertices = geometry.vertices;
  const floatsPerVertex = geometry.layout.stride / 4;
  const vertexCount = floatsPerVertex > 0 ? Math.floor(vertices.length / floatsPerVertex) : 0;
  const groups = new Uint32Array(vertexCount);
  const bits = new Uint32Array(vertices.buffer, vertices.byteOffset, vertices.length);
  const buckets = new Map<number, number[]>();

  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const position = vertex * floatsPerVertex + POSITION_OFFSET;
    const hash = hashMeshGeometryPosition(bits[position], bits[position + 1], bits[position + 2]);
    let bucket = buckets.get(hash);
    let representative = vertex;
    if (bucket === undefined) {
      bucket = [];
      buckets.set(hash, bucket);
    } else {
      for (const candidate of bucket) {
        const candidatePosition = candidate * floatsPerVertex + POSITION_OFFSET;
        if (
          bits[position] === bits[candidatePosition] &&
          bits[position + 1] === bits[candidatePosition + 1] &&
          bits[position + 2] === bits[candidatePosition + 2]
        ) {
          representative = candidate;
          break;
        }
      }
    }
    groups[vertex] = representative;
    if (representative === vertex) bucket.push(vertex);
  }

  return groups;
}

function accumulateNormal(accum: Float64Array, vertex: number, nx: number, ny: number, nz: number): void {
  const base = vertex * 3;
  accum[base] += nx;
  accum[base + 1] += ny;
  accum[base + 2] += nz;
}

function hashMeshGeometryPosition(x: number, y: number, z: number): number {
  let hash = 0x811c9dc5;
  hash = Math.imul(hash ^ x, 0x01000193);
  hash = Math.imul(hash ^ y, 0x01000193);
  hash = Math.imul(hash ^ z, 0x01000193);
  return hash >>> 0;
}

// Recomputes tangents from positions, normals, and uv0 using the Lengyel method, then
// Gram-Schmidt-orthogonalizes each tangent against its normal and stores it with the glTF handedness
// sign (`bitangent = cross(normal, tangent.xyz) * tangent.w`). A single indexed vertex cannot carry
// both handednesses at a mirrored-UV boundary, so the indexed path duplicates the complete vertex
// record and remaps the opposite-handed triangle corners before accumulating. Copying the complete
// record is load-bearing for extended layouts: joints0/weights0, colors, and secondary UVs survive a
// split unchanged. Non-indexed streams already have one vertex per corner and need no topology edit.
// When `positionGroups` is present, mirrored contributions share a canonical frame at each exact
// position: negative-orientation tangents are negated while bitangents are accumulated unchanged,
// then each source/split output reads the frame with its own orientation. As with grouped normals,
// this is opt-in so unrelated surfaces that merely coincide are not smoothed together.
//
// This is an authoring operation: call it before capturing morph/skin bind-pose runtime data. Safe
// in-place (out === geometry): all source attributes and corner contributions are read into scratch
// storage before tangent write-back or replacement of the output arrays.
export function computeMeshGeometryTangents(
  out: MeshGeometry,
  geometry: Readonly<MeshGeometry>,
  positionGroups: Readonly<Uint32Array<ArrayBuffer>> | null = null,
): void {
  const sourceVertices = geometry.vertices;
  const sourceFloatsPerVertex = geometry.layout.stride / 4;
  const sourceVertexCount = sourceFloatsPerVertex > 0 ? Math.floor(sourceVertices.length / sourceFloatsPerVertex) : 0;
  const sourceIndices = geometry.indices;
  const elementCount = sourceIndices ? sourceIndices.length : sourceVertexCount;

  // Indexed geometry needs an orientation census before accumulation. Grouped non-indexed geometry
  // also needs the signs so each already-distinct corner can read the canonical group frame in its
  // own orientation. Store one byte per triangle and one per source vertex, not per corner. A state's
  // sign records the first orientation and magnitude 2 records that both occurred.
  // Walk logical triangles through the shared decoder so triangle-strip topology is honoured, and
  // resolve every corner UP FRONT: the mirrored-UV split below replaces `out.indices`, and with
  // `out === geometry` that would change what the decoder reads part way through the pass.
  const triangleCount = getMeshGeometryTriangleCount(geometry);
  const cornerIndices = new Uint32Array(triangleCount * 3);
  {
    const corner: MeshTriangleVertexIndices = { i0: 0, i1: 0, i2: 0 };
    for (let triangle = 0; triangle < triangleCount; triangle++) {
      if (!getMeshGeometryTriangleVertexIndices(corner, geometry, triangle)) continue;
      cornerIndices[triangle * 3] = corner.i0;
      cornerIndices[triangle * 3 + 1] = corner.i1;
      cornerIndices[triangle * 3 + 2] = corner.i2;
    }
  }

  let triangleSigns: Int8Array | null = null;
  let orientationStates: Int8Array | null = null;
  let splitCount = 0;
  if (sourceIndices !== null || positionGroups !== null) {
    triangleSigns = new Int8Array(triangleCount);
    orientationStates = new Int8Array(sourceVertexCount);
    for (let triangle = 0; triangle < triangleCount; triangle++) {
      const i0 = cornerIndices[triangle * 3];
      const i1 = cornerIndices[triangle * 3 + 1];
      const i2 = cornerIndices[triangle * 3 + 2];
      const u0 = i0 * sourceFloatsPerVertex + UV0_OFFSET;
      const u1 = i1 * sourceFloatsPerVertex + UV0_OFFSET;
      const u2 = i2 * sourceFloatsPerVertex + UV0_OFFSET;
      const du1 = sourceVertices[u1] - sourceVertices[u0];
      const dv1 = sourceVertices[u1 + 1] - sourceVertices[u0 + 1];
      const du2 = sourceVertices[u2] - sourceVertices[u0];
      const dv2 = sourceVertices[u2 + 1] - sourceVertices[u0 + 1];
      const determinant = du1 * dv2 - du2 * dv1;
      const sign = determinant < 0 ? -1 : determinant > 0 ? 1 : 0;
      triangleSigns[triangle] = sign;
      if (sign !== 0) {
        markTangentOrientation(orientationStates, i0, sign);
        markTangentOrientation(orientationStates, i1, sign);
        markTangentOrientation(orientationStates, i2, sign);
      }
    }
    if (sourceIndices !== null) {
      for (let vertex = 0; vertex < sourceVertexCount; vertex++) {
        if (Math.abs(orientationStates[vertex]) === BOTH_TANGENT_ORIENTATIONS) splitCount++;
      }
    }
  }

  const targetFloatsPerVertex = out.layout.stride / 4;
  let targetVertices = out.vertices;
  let remappedIndices: Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer> | null = null;
  const outputVertexCount = sourceVertexCount + splitCount;

  // The mirrored-UV split remaps INDEX ELEMENTS, which is only well defined for a triangle list,
  // where each element belongs to exactly one triangle. A strip element is shared by up to three
  // triangles that may not agree on orientation, so there is no single vertex to remap it to;
  // splitting a strip would mean converting it to a list, which would change the output topology.
  const canSplitMirroredUVs = geometry.topology === 'triangle-list';
  if (
    canSplitMirroredUVs &&
    splitCount > 0 &&
    sourceIndices !== null &&
    triangleSigns !== null &&
    orientationStates !== null
  ) {
    const splitVertices = new Uint32Array(sourceVertexCount);
    splitVertices.fill(UINT32_UNMAPPED);
    const expanded = new Float32Array(outputVertexCount * targetFloatsPerVertex);
    expanded.set(targetVertices.subarray(0, sourceVertexCount * targetFloatsPerVertex));
    let nextVertex = sourceVertexCount;
    for (let vertex = 0; vertex < sourceVertexCount; vertex++) {
      if (Math.abs(orientationStates[vertex]) !== BOTH_TANGENT_ORIENTATIONS) continue;
      splitVertices[vertex] = nextVertex;
      const source = vertex * targetFloatsPerVertex;
      expanded.set(targetVertices.subarray(source, source + targetFloatsPerVertex), nextVertex * targetFloatsPerVertex);
      nextVertex++;
    }
    targetVertices = expanded;
    out.vertices = expanded;

    const needsUint32 =
      sourceIndices instanceof Uint32Array || out.indices instanceof Uint32Array || outputVertexCount > UINT16_MAX;
    remappedIndices = needsUint32 ? new Uint32Array(elementCount) : new Uint16Array(elementCount);
    for (let element = 0; element < elementCount; element++) {
      const sourceVertex = sourceIndices[element];
      const sign = triangleSigns[Math.floor(element / 3)];
      const primarySign = orientationStates[sourceVertex] < 0 ? -1 : 1;
      remappedIndices[element] = sign !== 0 && sign !== primarySign ? splitVertices[sourceVertex] : sourceVertex;
    }
    out.indices = remappedIndices;
  }

  const tan = new Float64Array(outputVertexCount * 3);
  const bitan = new Float64Array(outputVertexCount * 3);
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const i0 = cornerIndices[triangle * 3];
    const i1 = cornerIndices[triangle * 3 + 1];
    const i2 = cornerIndices[triangle * 3 + 2];
    // `remappedIndices` is only built for a triangle list, where element == triangle * 3 + corner.
    const element = triangle * 3;
    const o0 = remappedIndices ? remappedIndices[element] : i0;
    const o1 = remappedIndices ? remappedIndices[element + 1] : i1;
    const o2 = remappedIndices ? remappedIndices[element + 2] : i2;

    const p0 = i0 * sourceFloatsPerVertex + POSITION_OFFSET;
    const p1 = i1 * sourceFloatsPerVertex + POSITION_OFFSET;
    const p2 = i2 * sourceFloatsPerVertex + POSITION_OFFSET;
    const e1x = sourceVertices[p1] - sourceVertices[p0];
    const e1y = sourceVertices[p1 + 1] - sourceVertices[p0 + 1];
    const e1z = sourceVertices[p1 + 2] - sourceVertices[p0 + 2];
    const e2x = sourceVertices[p2] - sourceVertices[p0];
    const e2y = sourceVertices[p2 + 1] - sourceVertices[p0 + 1];
    const e2z = sourceVertices[p2 + 2] - sourceVertices[p0 + 2];

    const u0 = i0 * sourceFloatsPerVertex + UV0_OFFSET;
    const u1 = i1 * sourceFloatsPerVertex + UV0_OFFSET;
    const u2 = i2 * sourceFloatsPerVertex + UV0_OFFSET;
    const du1 = sourceVertices[u1] - sourceVertices[u0];
    const dv1 = sourceVertices[u1 + 1] - sourceVertices[u0 + 1];
    const du2 = sourceVertices[u2] - sourceVertices[u0];
    const dv2 = sourceVertices[u2 + 1] - sourceVertices[u0 + 1];
    const determinant = du1 * dv2 - du2 * dv1;
    const reciprocal = determinant !== 0 ? 1 / determinant : 0;

    const tx = (dv2 * e1x - dv1 * e2x) * reciprocal;
    const ty = (dv2 * e1y - dv1 * e2y) * reciprocal;
    const tz = (dv2 * e1z - dv1 * e2z) * reciprocal;
    const bx = (du1 * e2x - du2 * e1x) * reciprocal;
    const by = (du1 * e2y - du2 * e1y) * reciprocal;
    const bz = (du1 * e2z - du2 * e1z) * reciprocal;

    const tangentSign = positionGroups !== null && determinant < 0 ? -1 : 1;
    accumulateTangent(
      tan,
      bitan,
      positionGroups === null ? o0 : positionGroups[i0],
      tx * tangentSign,
      ty * tangentSign,
      tz * tangentSign,
      bx,
      by,
      bz,
    );
    accumulateTangent(
      tan,
      bitan,
      positionGroups === null ? o1 : positionGroups[i1],
      tx * tangentSign,
      ty * tangentSign,
      tz * tangentSign,
      bx,
      by,
      bz,
    );
    accumulateTangent(
      tan,
      bitan,
      positionGroups === null ? o2 : positionGroups[i2],
      tx * tangentSign,
      ty * tangentSign,
      tz * tangentSign,
      bx,
      by,
      bz,
    );
  }

  if (positionGroups === null) {
    for (let output = 0; output < outputVertexCount; output++) {
      writeAccumulatedTangent(targetVertices, targetFloatsPerVertex, output, tan, bitan, output, 1);
    }
  } else {
    // Source outputs can read their groups directly. A split output has no positionGroups entry;
    // write it from the source corner that produced it, keeping the source/output index spaces apart.
    for (let source = 0; source < sourceVertexCount; source++) {
      const sign = orientationStates !== null && orientationStates[source] < 0 ? -1 : 1;
      writeAccumulatedTangent(targetVertices, targetFloatsPerVertex, source, tan, bitan, positionGroups[source], sign);
    }
    if (remappedIndices !== null && sourceIndices !== null && triangleSigns !== null) {
      for (let element = 0; element < elementCount; element++) {
        const output = remappedIndices[element];
        if (output < sourceVertexCount) continue;
        const source = sourceIndices[element];
        const sign = triangleSigns[Math.floor(element / 3)] < 0 ? -1 : 1;
        writeAccumulatedTangent(
          targetVertices,
          targetFloatsPerVertex,
          output,
          tan,
          bitan,
          positionGroups[source],
          sign,
        );
      }
    }
  }
  out.version++;
}

function writeAccumulatedTangent(
  targetVertices: Float32Array,
  targetFloatsPerVertex: number,
  outputVertex: number,
  tangents: Float64Array,
  bitangents: Float64Array,
  accumulatedVertex: number,
  tangentSign: number,
): void {
  const nBase = outputVertex * targetFloatsPerVertex + NORMAL_OFFSET;
  const nx = targetVertices[nBase],
    ny = targetVertices[nBase + 1],
    nz = targetVertices[nBase + 2];

  let tx = tangents[accumulatedVertex * 3] * tangentSign,
    ty = tangents[accumulatedVertex * 3 + 1] * tangentSign,
    tz = tangents[accumulatedVertex * 3 + 2] * tangentSign;

  // Gram-Schmidt: t = normalize(t - n * dot(n, t)).
  const ndt = nx * tx + ny * ty + nz * tz;
  tx -= nx * ndt;
  ty -= ny * ndt;
  tz -= nz * ndt;
  const len = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if (len > 0) {
    tx /= len;
    ty /= len;
    tz /= len;
  } else {
    // Degenerate UVs: choose the coordinate axis least parallel to the normal, then cross it with
    // the normal. Unlike the old fixed +X fallback this stays perpendicular even for an X normal.
    if (Math.abs(nx) <= Math.abs(ny) && Math.abs(nx) <= Math.abs(nz)) {
      tx = 0;
      ty = nz;
      tz = -ny;
    } else if (Math.abs(ny) <= Math.abs(nz)) {
      tx = -nz;
      ty = 0;
      tz = nx;
    } else {
      tx = ny;
      ty = -nx;
      tz = 0;
    }
    const fallbackLength = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (fallbackLength > 0) {
      tx /= fallbackLength;
      ty /= fallbackLength;
      tz /= fallbackLength;
    } else {
      tx = 1;
      ty = 0;
      tz = 0;
    }
  }

  // Handedness: w = sign(dot(cross(n, t), accumulated bitangent)).
  const cx = ny * tz - nz * ty;
  const cy = nz * tx - nx * tz;
  const cz = nx * ty - ny * tx;
  const w =
    cx * bitangents[accumulatedVertex * 3] +
      cy * bitangents[accumulatedVertex * 3 + 1] +
      cz * bitangents[accumulatedVertex * 3 + 2] <
    0
      ? -1
      : 1;

  const base = outputVertex * targetFloatsPerVertex + TANGENT_OFFSET;
  targetVertices[base] = tx;
  targetVertices[base + 1] = ty;
  targetVertices[base + 2] = tz;
  targetVertices[base + 3] = w;
}

function markTangentOrientation(orientationStates: Int8Array, vertex: number, sign: number): void {
  const state = orientationStates[vertex];
  if (state === 0) {
    orientationStates[vertex] = sign;
  } else if ((state < 0 ? -1 : 1) !== sign) {
    orientationStates[vertex] = state < 0 ? -BOTH_TANGENT_ORIENTATIONS : BOTH_TANGENT_ORIENTATIONS;
  }
}

function accumulateTangent(
  tangents: Float64Array,
  bitangents: Float64Array,
  vertex: number,
  tx: number,
  ty: number,
  tz: number,
  bx: number,
  by: number,
  bz: number,
): void {
  const base = vertex * 3;
  tangents[base] += tx;
  tangents[base + 1] += ty;
  tangents[base + 2] += tz;
  bitangents[base] += bx;
  bitangents[base + 1] += by;
  bitangents[base + 2] += bz;
}

// Returns the geometry's cached local bounds, recomputing them first if a vertex edit has invalidated
// them. THIS IS THE ONLY CORRECT WAY TO READ BOUNDS: `geometry.bounds` is a dirty-gated cache, so a
// direct field read can hand back a box from before the last deform. A deform bumps `geometry.version`
// and thereby marks bounds stale; this recomputes only when `version` has moved past the version the
// cache was built at, so an unchanged geometry costs one integer compare and a deformed one pays the
// O(vertices) sweep exactly once no matter how many callers ask. That laziness is the point: a
// GPU-skinned or upload-only mesh that never culls or picks never computes bounds at all.
//
// Returns null only for a geometry with no boundable volume (no vertices) — computeMeshGeometryBounds
// leaves such a geometry an empty (inverted, min > max) box, which this reports as null so a caller can
// treat "no bounds" uniformly (cull keeps it, world-bounds skips it) rather than intersect an inverted
// box.
export function ensureMeshGeometryBounds(geometry: MeshGeometry): Readonly<Aabb> | null {
  const runtime = geometry[EntityRuntimeKey] as MeshGeometryRuntime | undefined;
  let bounds = geometry.bounds;
  if (bounds === null || runtime === undefined || runtime.boundsVersion !== geometry.version) {
    refreshMeshGeometryBounds(geometry);
    bounds = geometry.bounds;
  }
  return bounds !== null && bounds.min.x <= bounds.max.x ? bounds : null;
}

// Recomputes a geometry's cached local bounds after an in-place vertex edit, unconditionally — the
// explicit "recompute now" verb. Reuses the existing AABB when present and allocates it only on the
// first refresh; steady-state deformation is allocation-free. Stamps the version the cache is now
// valid for, so ensureMeshGeometryBounds can skip the sweep until the next vertex edit. Prefer
// ensureMeshGeometryBounds unless you specifically want to force the recompute.
export function refreshMeshGeometryBounds(geometry: MeshGeometry): void {
  let bounds = geometry.bounds;
  if (bounds === null) {
    bounds = createAabb();
    geometry.bounds = bounds;
  }
  computeMeshGeometryBounds(bounds, geometry);
  const runtime = geometry[EntityRuntimeKey] as MeshGeometryRuntime | undefined;
  if (runtime !== undefined) runtime.boundsVersion = geometry.version;
}

// Canonical interleaved PBR record float offsets within one vertex (stride = 48 bytes / 12 floats):
// position[0..2], normal[3..5], tangent[6..9] (w = handedness), uv0[10..11].
const NORMAL_OFFSET = 3;
const POSITION_OFFSET = 0;
const TANGENT_OFFSET = 6;
const UV0_OFFSET = 10;
const BOTH_TANGENT_ORIENTATIONS = 2;
const UINT16_MAX = 65_535;
const UINT32_UNMAPPED = 0xffffffff;
