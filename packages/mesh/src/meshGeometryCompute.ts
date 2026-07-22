import { createAabb } from '@flighthq/geometry';
import type { AabbLike, BoundingSphereLike, MeshGeometry } from '@flighthq/types';

// Per-vertex compute over the canonical interleaved PBR record: position(3) + normal(3) +
// tangent(4) + uv0(2) = 12 floats / 48 bytes, stride read from geometry.layout. These functions
// derive normals, tangents, and the local-space AABB from `geometry.vertices` (+ `geometry.indices`)
// and write into `out`. They read every input field they need into locals before writing, so each
// is safe when `out` aliases `geometry` (the bounds case) or when out fields share the source
// array (the normal/tangent cases write back into geometry.vertices in place).

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

    accum[i0 * 3] += nx;
    accum[i0 * 3 + 1] += ny;
    accum[i0 * 3 + 2] += nz;
    accum[i1 * 3] += nx;
    accum[i1 * 3 + 1] += ny;
    accum[i1 * 3 + 2] += nz;
    accum[i2 * 3] += nx;
    accum[i2 * 3 + 1] += ny;
    accum[i2 * 3 + 2] += nz;
  }

  const target = out.vertices;
  for (let i = 0; i < vertexCount; i++) {
    let nx = accum[i * 3],
      ny = accum[i * 3 + 1],
      nz = accum[i * 3 + 2];
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

// Recomputes per-vertex tangents from positions, normals, and uv0 using the Lengyel method,
// Gram-Schmidt-orthogonalizes each tangent against its normal, and stores it in the tangent slot
// of `out.vertices` with `w` = handedness sign (+1 or -1) per glTF: the bitangent is
// cross(normal, tangent.xyz) * tangent.w. Operates on indexed triangle-list geometry; non-indexed
// streams are sequential triangles. Safe in-place (out === geometry): inputs accumulate into
// scratch buffers before any write-back.
export function computeMeshGeometryTangents(out: MeshGeometry, geometry: Readonly<MeshGeometry>): void {
  const vertices = geometry.vertices;
  const floatsPerVertex = geometry.layout.stride / 4;
  const vertexCount = floatsPerVertex > 0 ? Math.floor(vertices.length / floatsPerVertex) : 0;
  const indices = geometry.indices;
  const indexCount = indices ? indices.length : vertexCount;

  const tan = new Float64Array(vertexCount * 3);
  const bitan = new Float64Array(vertexCount * 3);

  for (let t = 0; t + 2 < indexCount; t += 3) {
    const i0 = indices ? indices[t] : t;
    const i1 = indices ? indices[t + 1] : t + 1;
    const i2 = indices ? indices[t + 2] : t + 2;

    const p0 = i0 * floatsPerVertex + POSITION_OFFSET;
    const p1 = i1 * floatsPerVertex + POSITION_OFFSET;
    const p2 = i2 * floatsPerVertex + POSITION_OFFSET;

    const e1x = vertices[p1] - vertices[p0];
    const e1y = vertices[p1 + 1] - vertices[p0 + 1];
    const e1z = vertices[p1 + 2] - vertices[p0 + 2];
    const e2x = vertices[p2] - vertices[p0];
    const e2y = vertices[p2 + 1] - vertices[p0 + 1];
    const e2z = vertices[p2 + 2] - vertices[p0 + 2];

    const u0 = i0 * floatsPerVertex + UV0_OFFSET;
    const u1 = i1 * floatsPerVertex + UV0_OFFSET;
    const u2 = i2 * floatsPerVertex + UV0_OFFSET;

    const du1 = vertices[u1] - vertices[u0];
    const dv1 = vertices[u1 + 1] - vertices[u0 + 1];
    const du2 = vertices[u2] - vertices[u0];
    const dv2 = vertices[u2 + 1] - vertices[u0 + 1];

    const det = du1 * dv2 - du2 * dv1;
    const r = det !== 0 ? 1 / det : 0;

    const tx = (dv2 * e1x - dv1 * e2x) * r;
    const ty = (dv2 * e1y - dv1 * e2y) * r;
    const tz = (dv2 * e1z - dv1 * e2z) * r;
    const bx = (du1 * e2x - du2 * e1x) * r;
    const by = (du1 * e2y - du2 * e1y) * r;
    const bz = (du1 * e2z - du2 * e1z) * r;

    tan[i0 * 3] += tx;
    tan[i0 * 3 + 1] += ty;
    tan[i0 * 3 + 2] += tz;
    tan[i1 * 3] += tx;
    tan[i1 * 3 + 1] += ty;
    tan[i1 * 3 + 2] += tz;
    tan[i2 * 3] += tx;
    tan[i2 * 3 + 1] += ty;
    tan[i2 * 3 + 2] += tz;

    bitan[i0 * 3] += bx;
    bitan[i0 * 3 + 1] += by;
    bitan[i0 * 3 + 2] += bz;
    bitan[i1 * 3] += bx;
    bitan[i1 * 3 + 1] += by;
    bitan[i1 * 3 + 2] += bz;
    bitan[i2 * 3] += bx;
    bitan[i2 * 3 + 1] += by;
    bitan[i2 * 3 + 2] += bz;
  }

  const target = out.vertices;
  for (let i = 0; i < vertexCount; i++) {
    const nBase = i * floatsPerVertex + NORMAL_OFFSET;
    const nx = vertices[nBase],
      ny = vertices[nBase + 1],
      nz = vertices[nBase + 2];

    let tx = tan[i * 3],
      ty = tan[i * 3 + 1],
      tz = tan[i * 3 + 2];

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
      // Degenerate UVs: pick an arbitrary tangent perpendicular to the normal.
      tx = 1;
      ty = 0;
      tz = 0;
    }

    // Handedness: w = sign(dot(cross(n, t), accumulated bitangent)).
    const cx = ny * tz - nz * ty;
    const cy = nz * tx - nx * tz;
    const cz = nx * ty - ny * tx;
    const w = cx * bitan[i * 3] + cy * bitan[i * 3 + 1] + cz * bitan[i * 3 + 2] < 0 ? -1 : 1;

    const base = i * floatsPerVertex + TANGENT_OFFSET;
    target[base] = tx;
    target[base + 1] = ty;
    target[base + 2] = tz;
    target[base + 3] = w;
  }
}

// Recomputes a geometry's cached local bounds after an in-place vertex edit. Reuses the existing AABB
// when present and allocates it only on the first refresh; steady-state deformation is allocation-free.
export function refreshMeshGeometryBounds(geometry: MeshGeometry): void {
  let bounds = geometry.bounds;
  if (bounds === null) {
    bounds = createAabb();
    geometry.bounds = bounds;
  }
  computeMeshGeometryBounds(bounds, geometry);
}

// Canonical interleaved PBR record float offsets within one vertex (stride = 48 bytes / 12 floats):
// position[0..2], normal[3..5], tangent[6..9] (w = handedness), uv0[10..11].
const NORMAL_OFFSET = 3;
const POSITION_OFFSET = 0;
const TANGENT_OFFSET = 6;
const UV0_OFFSET = 10;
