import { createAabb } from '@flighthq/geometry/contract';
import type { Aabb, AabbLike, BoundingSphereLike, MeshGeometry, MeshGeometryRuntime } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

// Per-vertex compute over the canonical interleaved PBR record: position(3) + normal(3) +
// tangent(4) + uv0(2) = 12 floats / 48 bytes, stride read from geometry.layout. These functions
// derive normals, tangents, and the local-space AABB from `geometry.vertices` (+ `geometry.indices`)
// and write into `out`. They read every input field they need into locals before writing, so each
// is safe when `out` aliases `geometry`. Normals write back in place; tangents do too unless an
// indexed UV-frame seam requires complete interleaved vertex records to be duplicated first.

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
  const indices = geometry.indices;
  const indexCount = indices ? indices.length : floatsPerVertex > 0 ? Math.floor(srcVerts.length / floatsPerVertex) : 0;
  const dstVerts = out.vertices;

  for (let t = 0; t + 2 < indexCount; t += 3) {
    const i0 = indices ? indices[t] : t;
    const i1 = indices ? indices[t + 1] : t + 1;
    const i2 = indices ? indices[t + 2] : t + 2;

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
// sequential triangles. `out` is normally `geometry` itself (in-place), which is safe: positions
// are only read and normals are accumulated in a scratch buffer before any write-back.
export function computeMeshGeometryNormals(out: MeshGeometry, geometry: Readonly<MeshGeometry>): void {
  const vertices = geometry.vertices;
  const floatsPerVertex = geometry.layout.stride / 4;
  const vertexCount = floatsPerVertex > 0 ? Math.floor(vertices.length / floatsPerVertex) : 0;
  const indices = geometry.indices;
  const indexCount = indices ? indices.length : vertexCount;
  const runtime = geometry[EntityRuntimeKey] as MeshGeometryRuntime | undefined;
  const recordedSmoothingSources = runtime?.tangentSmoothingSources;
  const smoothingSources =
    recordedSmoothingSources !== null &&
    recordedSmoothingSources !== undefined &&
    recordedSmoothingSources.length === vertexCount
      ? recordedSmoothingSources
      : null;

  const accum = new Float64Array(vertexCount * 3);

  for (let t = 0; t + 2 < indexCount; t += 3) {
    const i0 = indices ? indices[t] : t;
    const i1 = indices ? indices[t + 1] : t + 1;
    const i2 = indices ? indices[t + 2] : t + 2;

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

    accumulateNormal(accum, smoothingSources ? smoothingSources[i0] : i0, nx, ny, nz);
    accumulateNormal(accum, smoothingSources ? smoothingSources[i1] : i1, nx, ny, nz);
    accumulateNormal(accum, smoothingSources ? smoothingSources[i2] : i2, nx, ny, nz);
  }

  const target = out.vertices;
  for (let i = 0; i < vertexCount; i++) {
    const source = smoothingSources ? smoothingSources[i] : i;
    let nx = accum[source * 3],
      ny = accum[source * 3 + 1],
      nz = accum[source * 3 + 2];
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

function accumulateNormal(accumulator: Float64Array, vertex: number, nx: number, ny: number, nz: number): void {
  const base = vertex * 3;
  accumulator[base] += nx;
  accumulator[base + 1] += ny;
  accumulator[base + 2] += nz;
}

// Recomputes a tangent basis from positions, normals, and uv0 with Flight-owned, dependency-free
// vector math. Each corner contributes a normalized tangent weighted by its geometric corner angle,
// preventing a tiny or UV-stretched triangle from dominating its neighbours. Indexed corners are
// clustered by handedness and direction: a corner more than 60 degrees from a cluster's running frame
// starts another record, so the complete interleaved vertex is duplicated and the corner is remapped. This preserves
// joints0/weights0, colors, and secondary UVs while repairing both mirrored and folded UV seams.
//
// The runtime records which generated vertices came from the same authored vertex. A later normal
// recomputation therefore keeps those tangent-only seams geometrically smooth. Non-indexed streams
// already have one vertex per corner and require no topology edit. This is still an authoring operation:
// call it before morph targets or skin bind poses are captured.
export function computeMeshGeometryTangents(out: MeshGeometry, geometry: Readonly<MeshGeometry>): void {
  const sourceVertices = geometry.vertices;
  const sourceStride = geometry.layout.stride / 4;
  const sourceVertexCount = sourceStride > 0 ? Math.floor(sourceVertices.length / sourceStride) : 0;
  const sourceIndices = geometry.indices;
  const targetStride = out.layout.stride / 4;

  if (sourceIndices === null) {
    computeNonIndexedTangents(out.vertices, targetStride, sourceVertices, sourceStride, sourceVertexCount);
    copyTangentSmoothingSources(out, geometry, sourceVertexCount);
    out.version++;
    return;
  }

  const elementCount = sourceIndices.length;
  const triangleElementCount = elementCount - (elementCount % 3);
  const primaryClusters = new Int32Array(sourceVertexCount);
  primaryClusters.fill(-1);
  const clusterHeads = new Int32Array(sourceVertexCount);
  clusterHeads.fill(-1);
  const clusterNext = new Int32Array(triangleElementCount);
  clusterNext.fill(-1);
  const clusterSources = new Uint32Array(triangleElementCount);
  const clusterSigns = new Int8Array(triangleElementCount);
  const clusterTangents = new Float64Array(triangleElementCount * 3);
  const elementClusters = new Uint32Array(triangleElementCount);
  let clusterCount = 0;
  let splitCount = 0;

  for (let triangle = 0; triangle < triangleElementCount; triangle += 3) {
    const i0 = sourceIndices[triangle];
    const i1 = sourceIndices[triangle + 1];
    const i2 = sourceIndices[triangle + 2];
    const p0 = i0 * sourceStride + POSITION_OFFSET;
    const p1 = i1 * sourceStride + POSITION_OFFSET;
    const p2 = i2 * sourceStride + POSITION_OFFSET;
    const e1x = sourceVertices[p1] - sourceVertices[p0];
    const e1y = sourceVertices[p1 + 1] - sourceVertices[p0 + 1];
    const e1z = sourceVertices[p1 + 2] - sourceVertices[p0 + 2];
    const e2x = sourceVertices[p2] - sourceVertices[p0];
    const e2y = sourceVertices[p2 + 1] - sourceVertices[p0 + 1];
    const e2z = sourceVertices[p2 + 2] - sourceVertices[p0 + 2];
    const u0 = i0 * sourceStride + UV0_OFFSET;
    const u1 = i1 * sourceStride + UV0_OFFSET;
    const u2 = i2 * sourceStride + UV0_OFFSET;
    const du1 = sourceVertices[u1] - sourceVertices[u0];
    const dv1 = sourceVertices[u1 + 1] - sourceVertices[u0 + 1];
    const du2 = sourceVertices[u2] - sourceVertices[u0];
    const dv2 = sourceVertices[u2 + 1] - sourceVertices[u0 + 1];
    const determinant = du1 * dv2 - du2 * dv1;
    const reciprocal = determinant !== 0 ? 1 / determinant : 0;
    const faceTx = (dv2 * e1x - dv1 * e2x) * reciprocal;
    const faceTy = (dv2 * e1y - dv1 * e2y) * reciprocal;
    const faceTz = (dv2 * e1z - dv1 * e2z) * reciprocal;
    const faceBx = (du1 * e2x - du2 * e1x) * reciprocal;
    const faceBy = (du1 * e2y - du2 * e1y) * reciprocal;
    const faceBz = (du1 * e2z - du2 * e1z) * reciprocal;

    for (let corner = 0; corner < 3; corner++) {
      const element = triangle + corner;
      const vertex = sourceIndices[element];
      const normal = vertex * sourceStride + NORMAL_OFFSET;
      const nx = sourceVertices[normal];
      const ny = sourceVertices[normal + 1];
      const nz = sourceVertices[normal + 2];
      const normalDot = nx * faceTx + ny * faceTy + nz * faceTz;
      let tx = faceTx - nx * normalDot;
      let ty = faceTy - ny * normalDot;
      let tz = faceTz - nz * normalDot;
      const tangentLength = Math.sqrt(tx * tx + ty * ty + tz * tz);
      let sign = 0;
      if (tangentLength > 0) {
        tx /= tangentLength;
        ty /= tangentLength;
        tz /= tangentLength;
        const cx = ny * tz - nz * ty;
        const cy = nz * tx - nx * tz;
        const cz = nx * ty - ny * tx;
        sign = cx * faceBx + cy * faceBy + cz * faceBz < 0 ? -1 : 1;
      }

      let cluster = clusterHeads[vertex];
      let compatibleCluster = -1;
      while (cluster !== -1) {
        const clusterSign = clusterSigns[cluster];
        const tangent = cluster * 3;
        const clusterLength = Math.sqrt(
          clusterTangents[tangent] * clusterTangents[tangent] +
            clusterTangents[tangent + 1] * clusterTangents[tangent + 1] +
            clusterTangents[tangent + 2] * clusterTangents[tangent + 2],
        );
        if (
          tangentLength === 0 ||
          clusterLength === 0 ||
          (clusterSign === sign &&
            (tx * clusterTangents[tangent] + ty * clusterTangents[tangent + 1] + tz * clusterTangents[tangent + 2]) /
              clusterLength >=
              MIN_TANGENT_CLUSTER_DOT)
        ) {
          compatibleCluster = cluster;
          break;
        }
        cluster = clusterNext[cluster];
      }

      if (compatibleCluster === -1) {
        compatibleCluster = clusterCount++;
        clusterSources[compatibleCluster] = vertex;
        clusterSigns[compatibleCluster] = sign;
        clusterNext[compatibleCluster] = clusterHeads[vertex];
        clusterHeads[vertex] = compatibleCluster;
        if (primaryClusters[vertex] === -1) primaryClusters[vertex] = compatibleCluster;
        else splitCount++;
      } else if (clusterSigns[compatibleCluster] === 0 && sign !== 0) {
        clusterSigns[compatibleCluster] = sign;
      }
      elementClusters[element] = compatibleCluster;

      if (tangentLength > 0) {
        const other1 = sourceIndices[triangle + ((corner + 1) % 3)];
        const other2 = sourceIndices[triangle + ((corner + 2) % 3)];
        const weight = getMeshCornerAngle(sourceVertices, sourceStride, vertex, other1, other2);
        const tangent = compatibleCluster * 3;
        clusterTangents[tangent] += tx * weight;
        clusterTangents[tangent + 1] += ty * weight;
        clusterTangents[tangent + 2] += tz * weight;
      }
    }
  }

  const outputVertexCount = sourceVertexCount + splitCount;
  const clusterOutputs = new Uint32Array(clusterCount);
  let targetVertices = out.vertices;
  if (splitCount > 0) {
    const expanded = new Float32Array(outputVertexCount * targetStride);
    expanded.set(targetVertices.subarray(0, sourceVertexCount * targetStride));
    let nextVertex = sourceVertexCount;
    for (let cluster = 0; cluster < clusterCount; cluster++) {
      const source = clusterSources[cluster];
      if (primaryClusters[source] === cluster) {
        clusterOutputs[cluster] = source;
      } else {
        const output = nextVertex++;
        clusterOutputs[cluster] = output;
        const sourceOffset = source * targetStride;
        expanded.set(targetVertices.subarray(sourceOffset, sourceOffset + targetStride), output * targetStride);
      }
    }
    targetVertices = expanded;
    out.vertices = expanded;

    const needsUint32 =
      sourceIndices instanceof Uint32Array || out.indices instanceof Uint32Array || outputVertexCount > UINT16_MAX;
    const remappedIndices: Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer> = needsUint32
      ? new Uint32Array(elementCount)
      : new Uint16Array(elementCount);
    for (let element = 0; element < triangleElementCount; element++) {
      remappedIndices[element] = clusterOutputs[elementClusters[element]];
    }
    for (let element = triangleElementCount; element < elementCount; element++) {
      remappedIndices[element] = sourceIndices[element];
    }
    out.indices = remappedIndices;
    recordTangentSmoothingSources(
      out,
      geometry,
      clusterSources,
      clusterOutputs,
      clusterCount,
      sourceVertexCount,
      outputVertexCount,
    );
  } else {
    for (let cluster = 0; cluster < clusterCount; cluster++) clusterOutputs[cluster] = clusterSources[cluster];
    copyTangentSmoothingSources(out, geometry, sourceVertexCount);
  }

  for (let cluster = 0; cluster < clusterCount; cluster++) {
    const tangent = cluster * 3;
    writeMeshTangent(
      targetVertices,
      targetStride,
      clusterOutputs[cluster],
      clusterTangents[tangent],
      clusterTangents[tangent + 1],
      clusterTangents[tangent + 2],
      clusterSigns[cluster] < 0 ? -1 : 1,
    );
  }
  for (let vertex = 0; vertex < sourceVertexCount; vertex++) {
    if (primaryClusters[vertex] === -1) writeMeshTangent(targetVertices, targetStride, vertex, 0, 0, 0, 1);
  }
  out.version++;
}

function computeNonIndexedTangents(
  target: Float32Array,
  targetStride: number,
  source: Readonly<Float32Array>,
  sourceStride: number,
  vertexCount: number,
): void {
  for (let triangle = 0; triangle + 2 < vertexCount; triangle += 3) {
    const p0 = triangle * sourceStride + POSITION_OFFSET;
    const p1 = (triangle + 1) * sourceStride + POSITION_OFFSET;
    const p2 = (triangle + 2) * sourceStride + POSITION_OFFSET;
    const e1x = source[p1] - source[p0];
    const e1y = source[p1 + 1] - source[p0 + 1];
    const e1z = source[p1 + 2] - source[p0 + 2];
    const e2x = source[p2] - source[p0];
    const e2y = source[p2 + 1] - source[p0 + 1];
    const e2z = source[p2 + 2] - source[p0 + 2];
    const u0 = triangle * sourceStride + UV0_OFFSET;
    const u1 = (triangle + 1) * sourceStride + UV0_OFFSET;
    const u2 = (triangle + 2) * sourceStride + UV0_OFFSET;
    const du1 = source[u1] - source[u0];
    const dv1 = source[u1 + 1] - source[u0 + 1];
    const du2 = source[u2] - source[u0];
    const dv2 = source[u2 + 1] - source[u0 + 1];
    const determinant = du1 * dv2 - du2 * dv1;
    const reciprocal = determinant !== 0 ? 1 / determinant : 0;
    const tx = (dv2 * e1x - dv1 * e2x) * reciprocal;
    const ty = (dv2 * e1y - dv1 * e2y) * reciprocal;
    const tz = (dv2 * e1z - dv1 * e2z) * reciprocal;
    const bx = (du1 * e2x - du2 * e1x) * reciprocal;
    const by = (du1 * e2y - du2 * e1y) * reciprocal;
    const bz = (du1 * e2z - du2 * e1z) * reciprocal;
    for (let corner = 0; corner < 3; corner++) {
      const vertex = triangle + corner;
      const normal = vertex * sourceStride + NORMAL_OFFSET;
      const nx = source[normal];
      const ny = source[normal + 1];
      const nz = source[normal + 2];
      const normalDot = nx * tx + ny * ty + nz * tz;
      const tangentX = tx - nx * normalDot;
      const tangentY = ty - ny * normalDot;
      const tangentZ = tz - nz * normalDot;
      const cx = ny * tangentZ - nz * tangentY;
      const cy = nz * tangentX - nx * tangentZ;
      const cz = nx * tangentY - ny * tangentX;
      const sign = cx * bx + cy * by + cz * bz < 0 ? -1 : 1;
      writeMeshTangent(target, targetStride, vertex, tangentX, tangentY, tangentZ, sign);
    }
  }
  for (let vertex = vertexCount - (vertexCount % 3); vertex < vertexCount; vertex++) {
    writeMeshTangent(target, targetStride, vertex, 0, 0, 0, 1);
  }
}

function getMeshCornerAngle(
  vertices: Readonly<Float32Array>,
  stride: number,
  center: number,
  other1: number,
  other2: number,
): number {
  const centerOffset = center * stride + POSITION_OFFSET;
  const other1Offset = other1 * stride + POSITION_OFFSET;
  const other2Offset = other2 * stride + POSITION_OFFSET;
  const ax = vertices[other1Offset] - vertices[centerOffset];
  const ay = vertices[other1Offset + 1] - vertices[centerOffset + 1];
  const az = vertices[other1Offset + 2] - vertices[centerOffset + 2];
  const bx = vertices[other2Offset] - vertices[centerOffset];
  const by = vertices[other2Offset + 1] - vertices[centerOffset + 1];
  const bz = vertices[other2Offset + 2] - vertices[centerOffset + 2];
  const denominator = Math.sqrt((ax * ax + ay * ay + az * az) * (bx * bx + by * by + bz * bz));
  if (denominator === 0) return 1;
  const cosine = (ax * bx + ay * by + az * bz) / denominator;
  return Math.acos(Math.max(-1, Math.min(1, cosine)));
}

function writeMeshTangent(
  vertices: Float32Array,
  stride: number,
  vertex: number,
  sourceX: number,
  sourceY: number,
  sourceZ: number,
  sign: number,
): void {
  const normal = vertex * stride + NORMAL_OFFSET;
  const nx = vertices[normal];
  const ny = vertices[normal + 1];
  const nz = vertices[normal + 2];
  const normalDot = nx * sourceX + ny * sourceY + nz * sourceZ;
  let tx = sourceX - nx * normalDot;
  let ty = sourceY - ny * normalDot;
  let tz = sourceZ - nz * normalDot;
  let length = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if (length === 0) {
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
    length = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (length === 0) {
      tx = 1;
      ty = 0;
      tz = 0;
      length = 1;
    }
  }
  const tangent = vertex * stride + TANGENT_OFFSET;
  vertices[tangent] = tx / length;
  vertices[tangent + 1] = ty / length;
  vertices[tangent + 2] = tz / length;
  vertices[tangent + 3] = sign;
}

function copyTangentSmoothingSources(out: MeshGeometry, geometry: Readonly<MeshGeometry>, vertexCount: number): void {
  if (out === geometry) return;
  const sourceRuntime = geometry[EntityRuntimeKey] as MeshGeometryRuntime | undefined;
  const targetRuntime = out[EntityRuntimeKey] as MeshGeometryRuntime | undefined;
  const sources = sourceRuntime?.tangentSmoothingSources;
  if (targetRuntime !== undefined) {
    targetRuntime.tangentSmoothingSources =
      sources !== null && sources !== undefined && sources.length === vertexCount ? sources.slice() : null;
  }
}

function recordTangentSmoothingSources(
  out: MeshGeometry,
  geometry: Readonly<MeshGeometry>,
  clusterSources: Uint32Array,
  clusterOutputs: Uint32Array,
  clusterCount: number,
  sourceVertexCount: number,
  outputVertexCount: number,
): void {
  const sourceRuntime = geometry[EntityRuntimeKey] as MeshGeometryRuntime | undefined;
  const targetRuntime = out[EntityRuntimeKey] as MeshGeometryRuntime | undefined;
  if (targetRuntime === undefined) return;
  const previous = sourceRuntime?.tangentSmoothingSources;
  const sources = new Uint32Array(outputVertexCount);
  for (let vertex = 0; vertex < sourceVertexCount; vertex++) {
    sources[vertex] =
      previous !== null && previous !== undefined && previous.length === sourceVertexCount ? previous[vertex] : vertex;
  }
  for (let cluster = 0; cluster < clusterCount; cluster++) {
    const output = clusterOutputs[cluster];
    if (output >= sourceVertexCount) sources[output] = sources[clusterSources[cluster]];
  }
  targetRuntime.tangentSmoothingSources = sources;
  targetRuntime.skinBindPose = null;
  targetRuntime.morphBindPose = null;
  targetRuntime.morphBlendedWeights = null;
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
const MIN_TANGENT_CLUSTER_DOT = 0.5;
const UINT16_MAX = 65_535;
