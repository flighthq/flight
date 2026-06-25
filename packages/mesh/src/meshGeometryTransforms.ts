import { createAabb } from '@flighthq/geometry';
import type { Matrix4Like, MeshGeometry } from '@flighthq/types';

import { getVertexAttributeFloatOffset } from './meshGeometryAttributes';
import { computeMeshGeometryBounds } from './meshGeometryCompute';

// Geometry transform operations: apply a Matrix4 to positions and the inverse-transpose to
// normals and tangent.xyz (tangent.w handedness sign is preserved). All in-place operations
// bump geometry.version. Out-parameter variants are alias-safe (out === source is valid).

// Centers the geometry so that the cached AABB's center moves to the origin. If bounds have
// not been computed yet, they are computed first. Bumps geometry.version.
export function centerMeshGeometry(geometry: MeshGeometry): void {
  if (!geometry.bounds) {
    const bounds = createAabb();
    computeMeshGeometryBounds(bounds, geometry);
    geometry.bounds = bounds;
  }
  const b = geometry.bounds;
  const cx = (b.min.x + b.max.x) * 0.5;
  const cy = (b.min.y + b.max.y) * 0.5;
  const cz = (b.min.z + b.max.z) * 0.5;
  if (cx === 0 && cy === 0 && cz === 0) return;
  translateMeshGeometry(geometry, -cx, -cy, -cz);
}

// Scales all vertex positions in-place by (sx, sy, sz). Normals and tangents are transformed
// via the inverse-transpose of the pure scale matrix (i.e. (1/sx, 1/sy, 1/sz)) and
// re-normalized. Bumps geometry.version.
export function scaleMeshGeometry(geometry: MeshGeometry, sx: number, sy: number, sz: number): void {
  transformMeshGeometryPositions(geometry, geometry, sx, sy, sz, 0, 0, 0);
}

// Applies a Matrix4 to the geometry's vertices in place. Positions are transformed as points
// (w=1); normals and tangent.xyz are transformed by the inverse-transpose of the matrix's
// upper-left 3×3 and re-normalized. Returns false when the matrix is singular. Bumps
// geometry.version. Alias-safe (this function does not need an alias form because it is
// always in-place, but positions are read before write in the core loop).
export function transformMeshGeometry(geometry: MeshGeometry, matrix: Readonly<Matrix4Like>): boolean {
  return transformMeshGeometryInto(geometry, geometry, matrix);
}

// Applies a Matrix4 to `source` geometry and writes the result into `out`. Positions are
// transformed as points (w=1), normals and tangent.xyz are transformed by the inverse-transpose
// of the matrix's upper-left 3×3 (ignoring translation) and re-normalized. tangent.w is
// preserved. Returns false and leaves `out` unchanged when the matrix has no inverse (singular),
// because the correct normal transform is undefined. Alias-safe: out === source is valid.
export function transformMeshGeometryInto(
  out: MeshGeometry,
  source: Readonly<MeshGeometry>,
  matrix: Readonly<Matrix4Like>,
): boolean {
  // Compute inverse-transpose of the 3×3 upper-left for normals/tangents.
  const invT = computeMatrix3x3InverseTranspose(matrix);
  if (!invT) return false;
  const m = matrix.m;
  const posFloatOffset = getVertexAttributeFloatOffset(source.layout, 'position');
  const normFloatOffset = getVertexAttributeFloatOffset(source.layout, 'normal');
  const tanFloatOffset = getVertexAttributeFloatOffset(source.layout, 'tangent');
  const srcVerts = source.vertices;
  const floatsPerVertex = source.layout.stride / 4;
  const vertexCount = floatsPerVertex > 0 ? Math.floor(srcVerts.length / floatsPerVertex) : 0;
  // Allocate output if writing into a different geometry; otherwise work in-place.
  const dstVerts = out === source ? srcVerts : out.vertices;
  if (out !== source) {
    dstVerts.set(srcVerts);
  }
  for (let i = 0; i < vertexCount; i++) {
    const vertBase = i * floatsPerVertex;
    if (posFloatOffset >= 0) {
      const pb = vertBase + posFloatOffset;
      // Read inputs into locals before writing (alias-safe).
      const px = srcVerts[pb],
        py = srcVerts[pb + 1],
        pz = srcVerts[pb + 2];
      dstVerts[pb] = m[0] * px + m[4] * py + m[8] * pz + m[12];
      dstVerts[pb + 1] = m[1] * px + m[5] * py + m[9] * pz + m[13];
      dstVerts[pb + 2] = m[2] * px + m[6] * py + m[10] * pz + m[14];
    }
    if (normFloatOffset >= 0) {
      const nb = vertBase + normFloatOffset;
      const nx = srcVerts[nb],
        ny = srcVerts[nb + 1],
        nz = srcVerts[nb + 2];
      let tnx = invT[0] * nx + invT[3] * ny + invT[6] * nz;
      let tny = invT[1] * nx + invT[4] * ny + invT[7] * nz;
      let tnz = invT[2] * nx + invT[5] * ny + invT[8] * nz;
      const len = Math.sqrt(tnx * tnx + tny * tny + tnz * tnz);
      if (len > 0) {
        tnx /= len;
        tny /= len;
        tnz /= len;
      }
      dstVerts[nb] = tnx;
      dstVerts[nb + 1] = tny;
      dstVerts[nb + 2] = tnz;
    }
    if (tanFloatOffset >= 0) {
      const tb = vertBase + tanFloatOffset;
      const tx = srcVerts[tb],
        ty = srcVerts[tb + 1],
        tz = srcVerts[tb + 2];
      const tw = srcVerts[tb + 3]; // preserve handedness sign
      let ttx = invT[0] * tx + invT[3] * ty + invT[6] * tz;
      let tty = invT[1] * tx + invT[4] * ty + invT[7] * tz;
      let ttz = invT[2] * tx + invT[5] * ty + invT[8] * tz;
      const len = Math.sqrt(ttx * ttx + tty * tty + ttz * ttz);
      if (len > 0) {
        ttx /= len;
        tty /= len;
        ttz /= len;
      }
      dstVerts[tb] = ttx;
      dstVerts[tb + 1] = tty;
      dstVerts[tb + 2] = ttz;
      dstVerts[tb + 3] = tw;
    }
  }
  out.version++;
  // Recompute bounds if they were cached, since all positions have changed.
  if (out.bounds) {
    computeMeshGeometryBounds(out.bounds, out);
  }
  return true;
}

// Translates all vertex positions in-place by (x, y, z). Normals and tangents are unaffected
// by a pure translation. Bumps geometry.version.
export function translateMeshGeometry(geometry: MeshGeometry, x: number, y: number, z: number): void {
  const posFloatOffset = getVertexAttributeFloatOffset(geometry.layout, 'position');
  if (posFloatOffset < 0) return;
  const floatsPerVertex = geometry.layout.stride / 4;
  const vertexCount = floatsPerVertex > 0 ? Math.floor(geometry.vertices.length / floatsPerVertex) : 0;
  const verts = geometry.vertices;
  for (let i = 0; i < vertexCount; i++) {
    const base = i * floatsPerVertex + posFloatOffset;
    verts[base] += x;
    verts[base + 1] += y;
    verts[base + 2] += z;
  }
  geometry.version++;
  if (geometry.bounds) {
    geometry.bounds.min.x += x;
    geometry.bounds.min.y += y;
    geometry.bounds.min.z += z;
    geometry.bounds.max.x += x;
    geometry.bounds.max.y += y;
    geometry.bounds.max.z += z;
  }
}

// Computes the 3×3 column-major inverse-transpose of the upper-left 3×3 of a 4×4 matrix.
// Returns null when the 3×3 is singular (determinant near zero). The 9-element array is
// column-major: [col0row0, col0row1, col0row2, col1row0, col1row1, col1row2, col2row0, col2row1, col2row2].
function computeMatrix3x3InverseTranspose(matrix: Readonly<Matrix4Like>): Float32Array | null {
  const m = matrix.m;
  // Column-major upper-left 3×3: columns are (m[0],m[1],m[2]), (m[4],m[5],m[6]), (m[8],m[9],m[10]).
  const a00 = m[0],
    a01 = m[1],
    a02 = m[2];
  const a10 = m[4],
    a11 = m[5],
    a12 = m[6];
  const a20 = m[8],
    a21 = m[9],
    a22 = m[10];
  // Cofactors for the 3×3.
  const c00 = a11 * a22 - a12 * a21;
  const c01 = -(a10 * a22 - a12 * a20);
  const c02 = a10 * a21 - a11 * a20;
  const c10 = -(a01 * a22 - a02 * a21);
  const c11 = a00 * a22 - a02 * a20;
  const c12 = -(a00 * a21 - a01 * a20);
  const c20 = a01 * a12 - a02 * a11;
  const c21 = -(a00 * a12 - a02 * a10);
  const c22 = a00 * a11 - a01 * a10;
  const det = a00 * c00 + a01 * c01 + a02 * c02;
  if (Math.abs(det) < 1e-10) return null;
  const invDet = 1 / det;
  // Transpose of cofactor matrix (adjugate), scaled by 1/det.
  // Column-major storage (same convention as Matrix4.m).
  const out = new Float32Array(9);
  out[0] = c00 * invDet;
  out[1] = c10 * invDet;
  out[2] = c20 * invDet;
  out[3] = c01 * invDet;
  out[4] = c11 * invDet;
  out[5] = c21 * invDet;
  out[6] = c02 * invDet;
  out[7] = c12 * invDet;
  out[8] = c22 * invDet;
  return out;
}

// Applies a pure-scale transform to positions. Normals/tangents are transformed by the
// inverse scale and re-normalized. Internal helper used by scaleMeshGeometry.
function transformMeshGeometryPositions(
  out: MeshGeometry,
  source: Readonly<MeshGeometry>,
  sx: number,
  sy: number,
  sz: number,
  tx: number,
  ty: number,
  tz: number,
): void {
  const posFloatOffset = getVertexAttributeFloatOffset(source.layout, 'position');
  const normFloatOffset = getVertexAttributeFloatOffset(source.layout, 'normal');
  const tanFloatOffset = getVertexAttributeFloatOffset(source.layout, 'tangent');
  const srcVerts = source.vertices;
  const floatsPerVertex = source.layout.stride / 4;
  const vertexCount = floatsPerVertex > 0 ? Math.floor(srcVerts.length / floatsPerVertex) : 0;
  const dstVerts = out.vertices;
  if (out !== source) {
    dstVerts.set(srcVerts);
  }
  // Inverse scale factors for normals/tangents under a non-uniform scale.
  const invSx = sx !== 0 ? 1 / sx : 0;
  const invSy = sy !== 0 ? 1 / sy : 0;
  const invSz = sz !== 0 ? 1 / sz : 0;
  for (let i = 0; i < vertexCount; i++) {
    const vertBase = i * floatsPerVertex;
    if (posFloatOffset >= 0) {
      const pb = vertBase + posFloatOffset;
      const px = srcVerts[pb],
        py = srcVerts[pb + 1],
        pz = srcVerts[pb + 2];
      dstVerts[pb] = px * sx + tx;
      dstVerts[pb + 1] = py * sy + ty;
      dstVerts[pb + 2] = pz * sz + tz;
    }
    if (normFloatOffset >= 0) {
      const nb = vertBase + normFloatOffset;
      const nx = srcVerts[nb],
        ny = srcVerts[nb + 1],
        nz = srcVerts[nb + 2];
      let nnx = nx * invSx,
        nny = ny * invSy,
        nnz = nz * invSz;
      const len = Math.sqrt(nnx * nnx + nny * nny + nnz * nnz);
      if (len > 0) {
        nnx /= len;
        nny /= len;
        nnz /= len;
      }
      dstVerts[nb] = nnx;
      dstVerts[nb + 1] = nny;
      dstVerts[nb + 2] = nnz;
    }
    if (tanFloatOffset >= 0) {
      const tb = vertBase + tanFloatOffset;
      const ttx = srcVerts[tb],
        tty = srcVerts[tb + 1],
        ttz = srcVerts[tb + 2];
      const tw = srcVerts[tb + 3];
      let ntx = ttx * invSx,
        nty = tty * invSy,
        ntz = ttz * invSz;
      const len = Math.sqrt(ntx * ntx + nty * nty + ntz * ntz);
      if (len > 0) {
        ntx /= len;
        nty /= len;
        ntz /= len;
      }
      dstVerts[tb] = ntx;
      dstVerts[tb + 1] = nty;
      dstVerts[tb + 2] = ntz;
      dstVerts[tb + 3] = tw;
    }
  }
  out.version++;
  if (out.bounds) {
    computeMeshGeometryBounds(out.bounds, out);
  }
}
