import { getCameraScreenToWorldRay } from '@flighthq/camera';
import {
  createAabb,
  createMatrix4,
  createRay3D,
  createVector3,
  getRay3DPointAt,
  intersectRay3DAabb,
  intersectRay3DTriangle,
  inverseMatrix4,
} from '@flighthq/geometry';
import { getMeshGeometryTriangleCount, getMeshGeometryVertexPosition } from '@flighthq/mesh';
import { ensureNodeWorldTransformMatrix4, forEachNodeDescendant, getNodeWorldTransformMatrix4 } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { getSceneNodeWorldBounds, isMesh } from '@flighthq/scene';
import type { Camera, SceneHit, SceneNode, SceneNodeTraits, Vector3 } from '@flighthq/types';

// Resolves the nearest Mesh hit by a camera pick ray through a scene, filling `out` and returning it,
// or `null` on a miss (sentinel, not a throw). `screenX`/`screenY` are normalized device coordinates
// in [-1, 1] (the viewport→NDC mapping is the caller's responsibility, mirroring the camera unproject).
//
// Bronze precision: per-node broad-phase against the world AABB, then a brute-force ray↔triangle test
// over the candidate `MeshGeometry` (a per-`MeshGeometry` BVH is a later additive optimization). The
// ray is transformed into each mesh's local space (one inverse matrix per mesh) rather than every
// vertex into world space; the local direction is intentionally left un-normalized so the parametric
// `t` stays in world-ray units and is comparable across meshes.
//
// Alias-safe: `out` is only written when a nearer hit is found; on a miss `out` is untouched.
export function pickScene(
  scene: Readonly<Scene>,
  camera: Readonly<Camera>,
  screenX: number,
  screenY: number,
  out: SceneHit,
): SceneHit | null {
  const aspect = camera.projection.kind === 'perspective' ? camera.projection.aspect : 1;
  if (!getCameraScreenToWorldRay(_worldRay, camera, screenX, screenY, aspect)) return null;

  let found = false;
  let bestT = Infinity;

  forEachNodeDescendant<SceneNodeTraits>(scene, (node) => {
    const mesh = node as SceneNode;
    if (!isMesh(mesh)) return;

    // Broad-phase: skip meshes whose world bounds the ray cannot reach.
    getSceneNodeWorldBounds(_worldBounds, mesh);
    if (intersectRay3DAabb(_worldRay, _worldBounds) < 0) return;

    // Narrow-phase: test in mesh-local space. Requires the world matrix to be invertible.
    ensureNodeWorldTransformMatrix4(mesh);
    if (!inverseMatrix4(_inverseWorld, getNodeWorldTransformMatrix4(mesh))) return;
    transformPointByMatrix4(_localRay.origin, _worldRay.origin, _inverseWorld.m);
    transformDirectionByMatrix4(_localRay.direction, _worldRay.direction, _inverseWorld.m);

    const geometry = mesh.geometry;
    const indices = geometry.indices;
    const triangleCount = getMeshGeometryTriangleCount(geometry);
    for (let triangle = 0; triangle < triangleCount; triangle++) {
      const base = triangle * 3;
      const i0 = indices ? indices[base] : base;
      const i1 = indices ? indices[base + 1] : base + 1;
      const i2 = indices ? indices[base + 2] : base + 2;
      getMeshGeometryVertexPosition(_a, geometry, i0);
      getMeshGeometryVertexPosition(_b, geometry, i1);
      getMeshGeometryVertexPosition(_c, geometry, i2);

      const t = intersectRay3DTriangle(_localRay, _a, _b, _c);
      if (t < 0 || t >= bestT) continue;

      bestT = t;
      found = true;
      out.node = mesh;
      out.distance = t;
      getRay3DPointAt(_worldPoint, _worldRay, t);
      out.pointX = _worldPoint.x;
      out.pointY = _worldPoint.y;
      out.pointZ = _worldPoint.z;
      getRay3DPointAt(_localPoint, _localRay, t);
      writeBarycentric(out, _localPoint, _a, _b, _c);
    }
  });

  return found ? out : null;
}

// Fills `out.u/v/w` with the barycentric weights of `p` within triangle `a,b,c` (weights of a, b, c
// respectively; `p = u*a + v*b + w*c`). Degenerate triangles collapse to `(1, 0, 0)`.
function writeBarycentric(
  out: SceneHit,
  p: Readonly<Vector3>,
  a: Readonly<Vector3>,
  b: Readonly<Vector3>,
  c: Readonly<Vector3>,
): void {
  const v0x = b.x - a.x,
    v0y = b.y - a.y,
    v0z = b.z - a.z;
  const v1x = c.x - a.x,
    v1y = c.y - a.y,
    v1z = c.z - a.z;
  const v2x = p.x - a.x,
    v2y = p.y - a.y,
    v2z = p.z - a.z;
  const d00 = v0x * v0x + v0y * v0y + v0z * v0z;
  const d01 = v0x * v1x + v0y * v1y + v0z * v1z;
  const d11 = v1x * v1x + v1y * v1y + v1z * v1z;
  const d20 = v2x * v0x + v2y * v0y + v2z * v0z;
  const d21 = v2x * v1x + v2y * v1y + v2z * v1z;
  const denom = d00 * d11 - d01 * d01;
  if (denom === 0) {
    out.u = 1;
    out.v = 0;
    out.w = 0;
    return;
  }
  const inv = 1 / denom;
  const v = (d11 * d20 - d01 * d21) * inv;
  const w = (d00 * d21 - d01 * d20) * inv;
  out.u = 1 - v - w;
  out.v = v;
  out.w = w;
}

// Transforms a point (w = 1) by a column-major 4x4 matrix array into `out`.
function transformPointByMatrix4(out: Vector3, p: Readonly<Vector3>, m: Readonly<Float32Array>): void {
  const x = p.x,
    y = p.y,
    z = p.z;
  out.x = m[0] * x + m[4] * y + m[8] * z + m[12];
  out.y = m[1] * x + m[5] * y + m[9] * z + m[13];
  out.z = m[2] * x + m[6] * y + m[10] * z + m[14];
}

// Transforms a direction (w = 0, translation ignored) by a column-major 4x4 matrix array into `out`.
// The result is intentionally not normalized so a ray's parametric `t` is preserved across the
// world↔local transform.
function transformDirectionByMatrix4(out: Vector3, d: Readonly<Vector3>, m: Readonly<Float32Array>): void {
  const x = d.x,
    y = d.y,
    z = d.z;
  out.x = m[0] * x + m[4] * y + m[8] * z;
  out.y = m[1] * x + m[5] * y + m[9] * z;
  out.z = m[2] * x + m[6] * y + m[10] * z;
}

const _worldRay = createRay3D();
const _localRay = createRay3D();
const _inverseWorld = createMatrix4();
const _worldBounds = createAabb();
const _a = createVector3();
const _b = createVector3();
const _c = createVector3();
const _localPoint = createVector3();
const _worldPoint = createVector3();
