import type { AabbLike, MeshGeometry } from '@flighthq/types';

// Per-vertex compute over the canonical interleaved PBR record: position(3) + normal(3) +
// tangent(4) + uv0(2) = 12 floats / 48 bytes, stride read from geometry.layout. These functions
// derive normals, tangents, and the local-space AABB from `geometry.vertices` (+ `geometry.indices`)
// and write into `out`. They read every input field they need into locals before writing, so each
// is safe when `out` aliases `geometry` (the bounds case) or when out fields share the source
// array (the normal/tangent cases write back into geometry.vertices in place).

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

// Canonical interleaved PBR record float offsets within one vertex (stride = 48 bytes / 12 floats):
// position[0..2], normal[3..5], tangent[6..9] (w = handedness), uv0[10..11].
const NORMAL_OFFSET = 3;
const POSITION_OFFSET = 0;
const TANGENT_OFFSET = 6;
const UV0_OFFSET = 10;
