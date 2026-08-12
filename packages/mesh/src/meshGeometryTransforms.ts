import { createAabb } from '@flighthq/geometry/contract';
import type { Matrix4Like, MeshGeometry } from '@flighthq/types/contract';

import { getVertexAttributeFloatOffset } from './meshGeometryAttributes';
import { computeMeshGeometryBounds } from './meshGeometryCompute';

// Geometry transform operations: apply a Matrix4 to positions, the inverse-transpose to normals,
// and the plain upper 3x3 to tangent.xyz — a normal is a covector and a tangent is a true vector,
// so they follow different matrices and only coincide under rotation and uniform scale. A transform
// that mirrors (determinant < 0) also reverses triangle winding and negates tangent.w, because a
// baked transform leaves no determinant for a renderer to detect. All in-place operations bump
// geometry.version. Out-parameter variants are alias-safe (out === source is valid).

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

// Scales all vertex positions in-place by (sx, sy, sz). Normals are transformed by the
// inverse-transpose of the scale (1/sx, 1/sy, 1/sz) and tangents by the scale itself, both
// re-normalized. A negative-determinant scale mirrors the mesh, so triangle winding is reversed and
// tangent.w negated to keep front faces front-facing. Bumps geometry.version.
export function scaleMeshGeometry(geometry: MeshGeometry, sx: number, sy: number, sz: number): void {
  transformMeshGeometryPositions(geometry, geometry, sx, sy, sz, 0, 0, 0);
  restoreMirroredWindingAndHandedness(geometry, sx * sy * sz);
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
      const tw = srcVerts[tb + 3]; // handedness, a sign rather than a direction
      // A tangent lies ALONG the surface, so it is a true vector and follows the plain upper 3x3,
      // the same matrix a position follows. Only the normal is a covector needing the
      // inverse-transpose. The two coincide under rotation and uniform scale, which is why sharing
      // one matrix looked right; under non-uniform scale it tilts the tangent off the surface and
      // out of perpendicular with its own normal. `skinTangents` draws the same distinction.
      let ttx = m[0] * tx + m[4] * ty + m[8] * tz;
      let tty = m[1] * tx + m[5] * ty + m[9] * tz;
      let ttz = m[2] * tx + m[6] * ty + m[10] * tz;
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
  restoreMirroredWindingAndHandedness(
    out,
    m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]),
  );

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
// Restores the counter-clockwise-front / outward-normal invariant after a transform that mirrors the
// geometry (determinant < 0). A reflection turns every triangle inside out and flips the handedness
// of every tangent frame, and a BAKED transform leaves no determinant behind for a renderer to notice
// — the mesh simply uploads inside-out under an identity model matrix. So the correction has to
// happen here, at the point the mirror is applied.
//
// Mirroring is a legitimate request, not an error, so this never rejects a negative determinant.
//
// `tangent.w` is handedness (B = w * cross(N, T)), so a reflection negates it. That part is
// topology-independent and always applied. The winding reversal is not: swapping two corners of a
// triple is only meaningful for a triangle list. A triangle STRIP shares each vertex between up to
// three triangles, so per-triple swaps do not describe it, and this repository has no established
// strip winding reversal to follow — the one in `scene3d-formats` (`reverseTriangleWinding`) steps by
// three and is list-only. Rather than invent one, strips are left unreversed and the gap is reported.
// A line or point stream has no winding to reverse at all.
function restoreMirroredWindingAndHandedness(geometry: MeshGeometry, determinant: number): void {
  if (determinant >= 0) return;

  const tanFloatOffset = getVertexAttributeFloatOffset(geometry.layout, 'tangent');
  const floatsPerVertex = geometry.layout.stride / 4;
  const vertices = geometry.vertices;
  if (tanFloatOffset >= 0 && floatsPerVertex > 0) {
    const vertexCount = Math.floor(vertices.length / floatsPerVertex);
    for (let i = 0; i < vertexCount; i++) {
      const wIndex = i * floatsPerVertex + tanFloatOffset + 3;
      vertices[wIndex] = -vertices[wIndex];
    }
  }

  if (geometry.topology !== 'triangle-list') return;

  const indices = geometry.indices;
  if (indices !== null) {
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const swap = indices[i + 1];
      indices[i + 1] = indices[i + 2];
      indices[i + 2] = swap;
    }
    return;
  }

  // Non-indexed: the records themselves carry the order, so the second and third of each triple swap.
  if (floatsPerVertex <= 0) return;
  const vertexCount = Math.floor(vertices.length / floatsPerVertex);
  const scratch = new Float32Array(floatsPerVertex);
  for (let triangle = 0; triangle + 2 < vertexCount; triangle += 3) {
    const second = (triangle + 1) * floatsPerVertex;
    const third = (triangle + 2) * floatsPerVertex;
    scratch.set(vertices.subarray(second, second + floatsPerVertex));
    vertices.copyWithin(second, third, third + floatsPerVertex);
    vertices.set(scratch, third);
  }
}

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
      // Plain scale, not the inverse: a tangent lies along the surface and follows the same
      // transform a position does. See the note on `transformMeshGeometryInto`.
      let ntx = ttx * sx,
        nty = tty * sy,
        ntz = ttz * sz;
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
