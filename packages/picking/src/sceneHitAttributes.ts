import { createMatrix4, createVector3, inverseMatrix4 } from '@flighthq/geometry';
import {
  getMeshGeometryTriangleSubsetIndex,
  getMeshGeometryTriangleVertexIndices,
  getMeshGeometryVertexNormal,
  getMeshGeometryVertexTangent,
  getMeshGeometryVertexUv0,
} from '@flighthq/mesh';
import { ensureNodeWorldMatrix4, getNodeWorldMatrix4 } from '@flighthq/node';
import type { Material, Ray3D, SceneHit, Vector2Like, Vector3Like } from '@flighthq/types';

// Returns the authored material at the hit subset, or null for an absent/out-of-range/default slot.
export function getSceneHitMaterial(hit: Readonly<SceneHit>): Material | null {
  const subsetIndex = getSceneHitSubsetIndex(hit);
  return subsetIndex < 0 ? null : (hit.node.materials[subsetIndex] ?? null);
}

// Returns the material/subset slot owning the hit triangle, or -1 when no declared subset contains
// it. This is computed on demand so the nearest-hit core remains flat and small.
export function getSceneHitSubsetIndex(hit: Readonly<SceneHit>): number {
  return getMeshGeometryTriangleSubsetIndex(hit.node.geometry, hit.triangleIndex);
}

// Interpolates uv0 from the hit triangle's current geometry. Returns false without changing `out`
// when the triangle or channel is unavailable.
export function getSceneHitUv0(out: Vector2Like, hit: Readonly<SceneHit>): boolean {
  const geometry = hit.node.geometry;
  if (!getMeshGeometryTriangleVertexIndices(_triangle, geometry, hit.triangleIndex)) return false;
  if (!getMeshGeometryVertexUv0(_uv0, geometry, _triangle.i0)) return false;
  if (!getMeshGeometryVertexUv0(_uv1, geometry, _triangle.i1)) return false;
  if (!getMeshGeometryVertexUv0(_uv2, geometry, _triangle.i2)) return false;
  out.x = hit.u * _uv0.x + hit.v * _uv1.x + hit.w * _uv2.x;
  out.y = hit.u * _uv0.y + hit.v * _uv1.y + hit.w * _uv2.y;
  return true;
}

// Interpolates the vertex normal and transforms it to world space with inverse-transpose, so
// non-uniform scale remains correct. This is distinct from SceneHit.normal*, the geometric face
// normal used for culling. Returns false without changing `out` when unavailable or degenerate.
export function getSceneHitVertexNormal(out: Vector3Like, hit: Readonly<SceneHit>): boolean {
  const geometry = hit.node.geometry;
  if (!getMeshGeometryTriangleVertexIndices(_triangle, geometry, hit.triangleIndex)) return false;
  if (!getMeshGeometryVertexNormal(_normal0, geometry, _triangle.i0)) return false;
  if (!getMeshGeometryVertexNormal(_normal1, geometry, _triangle.i1)) return false;
  if (!getMeshGeometryVertexNormal(_normal2, geometry, _triangle.i2)) return false;

  const nx = hit.u * _normal0.x + hit.v * _normal1.x + hit.w * _normal2.x;
  const ny = hit.u * _normal0.y + hit.v * _normal1.y + hit.w * _normal2.y;
  const nz = hit.u * _normal0.z + hit.v * _normal1.z + hit.w * _normal2.z;
  ensureNodeWorldMatrix4(hit.node);
  if (!inverseMatrix4(_inverseWorld, getNodeWorldMatrix4(hit.node))) return false;
  const m = _inverseWorld.m;
  return writeNormalized(
    out,
    m[0] * nx + m[1] * ny + m[2] * nz,
    m[4] * nx + m[5] * ny + m[6] * nz,
    m[8] * nx + m[9] * ny + m[10] * nz,
  );
}

// Interpolates tangent xyz/w, transforms the direction to world space, orthogonalizes it against the
// interpolated world normal, and flips handedness under a mirrored world transform. Returns false
// without changing `out` when normal/tangent data is unavailable or degenerate.
export function getSceneHitVertexTangent(
  out: { w: number; x: number; y: number; z: number },
  hit: Readonly<SceneHit>,
): boolean {
  const geometry = hit.node.geometry;
  if (!getMeshGeometryTriangleVertexIndices(_triangle, geometry, hit.triangleIndex)) return false;
  if (!getMeshGeometryVertexTangent(_tangent0, geometry, _triangle.i0)) return false;
  if (!getMeshGeometryVertexTangent(_tangent1, geometry, _triangle.i1)) return false;
  if (!getMeshGeometryVertexTangent(_tangent2, geometry, _triangle.i2)) return false;
  if (!getSceneHitVertexNormal(_worldNormal, hit)) return false;

  const tx = hit.u * _tangent0.x + hit.v * _tangent1.x + hit.w * _tangent2.x;
  const ty = hit.u * _tangent0.y + hit.v * _tangent1.y + hit.w * _tangent2.y;
  const tz = hit.u * _tangent0.z + hit.v * _tangent1.z + hit.w * _tangent2.z;
  const tw = hit.u * _tangent0.w + hit.v * _tangent1.w + hit.w * _tangent2.w;
  const m = getNodeWorldMatrix4(hit.node).m;
  let wx = m[0] * tx + m[4] * ty + m[8] * tz;
  let wy = m[1] * tx + m[5] * ty + m[9] * tz;
  let wz = m[2] * tx + m[6] * ty + m[10] * tz;
  const projection = wx * _worldNormal.x + wy * _worldNormal.y + wz * _worldNormal.z;
  wx -= projection * _worldNormal.x;
  wy -= projection * _worldNormal.y;
  wz -= projection * _worldNormal.z;
  const lengthSquared = wx * wx + wy * wy + wz * wz;
  if (lengthSquared === 0) return false;
  const inverseLength = 1 / Math.sqrt(lengthSquared);
  const determinant =
    m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
  out.x = wx * inverseLength;
  out.y = wy * inverseLength;
  out.z = wz * inverseLength;
  out.w = (tw < 0 ? -1 : 1) * (determinant < 0 ? -1 : 1);
  return true;
}

// True when the world ray meets the front side of the hit's geometric face normal. Perpendicular
// rays are treated as front-facing; the ray direction need not be normalized.
export function isSceneHitFrontFacing(hit: Readonly<SceneHit>, ray: Readonly<Ray3D>): boolean {
  return ray.direction.x * hit.normalX + ray.direction.y * hit.normalY + ray.direction.z * hit.normalZ <= 0;
}

function writeNormalized(out: Vector3Like, x: number, y: number, z: number): boolean {
  const lengthSquared = x * x + y * y + z * z;
  if (lengthSquared === 0) return false;
  const inverseLength = 1 / Math.sqrt(lengthSquared);
  out.x = x * inverseLength;
  out.y = y * inverseLength;
  out.z = z * inverseLength;
  return true;
}

const _inverseWorld = createMatrix4();
const _normal0 = createVector3();
const _normal1 = createVector3();
const _normal2 = createVector3();
const _tangent0 = { w: 0, x: 0, y: 0, z: 0 };
const _tangent1 = { w: 0, x: 0, y: 0, z: 0 };
const _tangent2 = { w: 0, x: 0, y: 0, z: 0 };
const _triangle = { i0: 0, i1: 0, i2: 0 };
const _uv0 = { x: 0, y: 0 };
const _uv1 = { x: 0, y: 0 };
const _uv2 = { x: 0, y: 0 };
const _worldNormal = createVector3();
