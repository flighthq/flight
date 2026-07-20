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
import { ensureNodeWorldMatrix4, getNodeRuntime, getNodeWorldMatrix4 } from '@flighthq/node';
import { getSceneNodeWorldBounds, isMesh } from '@flighthq/scene';
import type { Camera, Mesh, Ray3D, SceneHit, SceneNode, Vector3 } from '@flighthq/types';

// Filters applied to a scene pick query. All fields are optional; an omitted field imposes no
// constraint. `predicate` includes a Mesh in the query only when it returns `true` (a per-mesh
// include/exclude test; it does not prune the mesh's descendants). `maxDistance` rejects hits whose
// parametric distance `t` exceeds it (in the pick ray's direction-length units; for a camera pick
// the ray direction is unit-length, so `t` is world distance). `cullBackfaces` discards triangles
// whose geometric face normal points away from the ray (a back-facing hit) — the default is
// double-sided (both faces hit).
export interface ScenePickOptions {
  cullBackfaces?: boolean;
  maxDistance?: number;
  predicate?: (mesh: Readonly<Mesh>) => boolean;
}

// Allocates a zeroed SceneHit. Handy for the `out` of `pickScene`/`pickSceneWithRay3D` and for
// growing the `outArray` of the multi-hit queries. `node` is null until a pick fills it.
export function createSceneHit(): SceneHit {
  return {
    distance: 0,
    node: null as unknown as Mesh,
    normalX: 0,
    normalY: 0,
    normalZ: 0,
    pointX: 0,
    pointY: 0,
    pointZ: 0,
    triangleIndex: -1,
    u: 0,
    v: 0,
    w: 0,
  };
}

// Resolves the nearest Mesh hit by a camera pick ray through a scene, filling `out` and returning it,
// or `null` on a miss (sentinel, not a throw). `screenX`/`screenY` are normalized device coordinates
// in [-1, 1] (the viewport→NDC mapping is the caller's responsibility, mirroring the camera unproject).
// A thin wrapper: it unprojects the camera ray, then delegates to `pickSceneWithRay3D`.
//
// Alias-safe: `out` is only written when a hit is found; on a miss `out` is untouched.
export function pickScene(
  scene: Readonly<SceneNode>,
  camera: Readonly<Camera>,
  screenX: number,
  screenY: number,
  out: SceneHit,
  options?: Readonly<ScenePickOptions>,
): SceneHit | null {
  if (!buildCameraPickRay(_cameraRay, camera, screenX, screenY)) return null;
  return pickSceneWithRay3D(scene, _cameraRay, out, options);
}

// Collects every Mesh hit by a camera pick ray into `outArray`, sorted by ascending distance, and
// returns `outArray`. A thin wrapper over `pickSceneAllWithRay3D` that first unprojects the camera
// ray; on an unprojectable camera the array is emptied and returned.
export function pickSceneAll(
  scene: Readonly<SceneNode>,
  camera: Readonly<Camera>,
  screenX: number,
  screenY: number,
  outArray: SceneHit[],
  options?: Readonly<ScenePickOptions>,
): SceneHit[] {
  if (!buildCameraPickRay(_cameraRay, camera, screenX, screenY)) {
    outArray.length = 0;
    return outArray;
  }
  return pickSceneAllWithRay3D(scene, _cameraRay, outArray, options);
}

// Collects every Mesh hit by a world-space `ray` into `outArray`, sorted by ascending distance, and
// returns `outArray` (its `length` is set to the hit count; empty on a miss). Existing slots are
// reused and new ones allocated as needed, so the array can be kept and refilled across picks. The
// general primitive behind `pickSceneAll`; the ray need not be unit-length (see `ScenePickOptions`).
export function pickSceneAllWithRay3D(
  scene: Readonly<SceneNode>,
  ray: Readonly<Ray3D>,
  outArray: SceneHit[],
  options?: Readonly<ScenePickOptions>,
): SceneHit[] {
  let count = 0;
  forEachSceneRayHit(scene, ray, options, (hit) => {
    let slot = outArray[count];
    if (slot === undefined) {
      slot = createSceneHit();
      outArray[count] = slot;
    }
    copySceneHit(slot, hit);
    count++;
  });
  outArray.length = count;
  outArray.sort(compareSceneHitByDistance);
  return outArray;
}

// Resolves the nearest Mesh hit by a world-space `ray` through a scene, filling `out` and returning
// it, or `null` on a miss. The general primitive behind `pickScene`: `pickScene` builds the ray from
// a camera and delegates here. The ray direction need not be unit-length; `t` (and `out.distance`)
// is in direction-length units.
//
// Bronze precision: per-node broad-phase against the world AABB, then a brute-force ray↔triangle test
// over the candidate `MeshGeometry` (a per-`MeshGeometry` BVH is a later additive optimization). The
// ray is transformed into each mesh's local space (one inverse matrix per mesh) rather than every
// vertex into world space; the local direction is intentionally left un-normalized so the parametric
// `t` stays in world-ray units and is comparable across meshes.
//
// Alias-safe: `out` is only written when a nearer hit is found; on a miss `out` is untouched.
export function pickSceneWithRay3D(
  scene: Readonly<SceneNode>,
  ray: Readonly<Ray3D>,
  out: SceneHit,
  options?: Readonly<ScenePickOptions>,
): SceneHit | null {
  let found = false;
  let bestT = Infinity;
  forEachSceneRayHit(scene, ray, options, (hit) => {
    if (hit.distance >= bestT) return;
    bestT = hit.distance;
    found = true;
    copySceneHit(out, hit);
  });
  return found ? out : null;
}

// Unprojects a camera pick ray into `out`. Orthographic projections ignore `aspect` (their extents
// are the half-width/half-height on the descriptor), so the passed value only matters for
// perspective, where it must be the projection's own aspect to avoid a horizontal ray skew.
function buildCameraPickRay(out: Ray3D, camera: Readonly<Camera>, screenX: number, screenY: number): boolean {
  const aspect = camera.projection.kind === 'perspective' ? camera.projection.aspect : 1;
  return getCameraScreenToWorldRay(out, camera, screenX, screenY, aspect);
}

// Field-copies `src` into `out`. SceneHit is a plain result struct (no runtime identity), so a shallow
// field copy is a full copy.
function copySceneHit(out: SceneHit, src: Readonly<SceneHit>): void {
  out.node = src.node;
  out.distance = src.distance;
  out.triangleIndex = src.triangleIndex;
  out.u = src.u;
  out.v = src.v;
  out.w = src.w;
  out.pointX = src.pointX;
  out.pointY = src.pointY;
  out.pointZ = src.pointZ;
  out.normalX = src.normalX;
  out.normalY = src.normalY;
  out.normalZ = src.normalZ;
}

// Ascending-distance comparator for `Array.sort` over SceneHit results.
function compareSceneHitByDistance(a: Readonly<SceneHit>, b: Readonly<SceneHit>): number {
  return a.distance - b.distance;
}

// Walks every enabled Mesh in the scene, tests `ray` against its triangles under `options`, and calls
// `onHit` once per passing triangle with the fully-populated shared `_hit` scratch. Disabled nodes
// (`enabled === false`) prune their whole subtree, mirroring scene culling; the `predicate` option
// excludes an individual mesh without pruning its descendants. `onHit` must consume `_hit` before it
// returns — the scratch is overwritten on the next triangle.
//
// Non-reentrant (C/C++ port note): this pass and its narrow-phase run on module-level scratch
// (`_hit`, `_localRay`, the vertex/point/normal temporaries, and the shared `_cameraRay` filled by the
// camera wrappers). It must not be called re-entrantly, and `onHit` must not itself start another
// pick. A native port replaces this shared scratch with per-call stack storage.
function forEachSceneRayHit(
  scene: Readonly<SceneNode>,
  ray: Readonly<Ray3D>,
  options: Readonly<ScenePickOptions> | undefined,
  onHit: (hit: Readonly<SceneHit>) => void,
): void {
  const predicate = options?.predicate;
  const maxDistance = options?.maxDistance ?? Infinity;
  const cullBackfaces = options?.cullBackfaces ?? false;
  pickNode(scene as unknown as SceneNode, ray, predicate, maxDistance, cullBackfaces, onHit);
}

// Depth-first pruning walk: a disabled node contributes nothing and skips its subtree; an enabled
// Mesh is narrow-phase tested; every enabled node's children are descended.
function pickNode(
  node: Readonly<SceneNode>,
  ray: Readonly<Ray3D>,
  predicate: ((mesh: Readonly<Mesh>) => boolean) | undefined,
  maxDistance: number,
  cullBackfaces: boolean,
  onHit: (hit: Readonly<SceneHit>) => void,
): void {
  if (!node.enabled) return;
  if (isMesh(node) && (predicate === undefined || predicate(node))) {
    intersectMeshTriangles(node, ray, maxDistance, cullBackfaces, onHit);
  }
  const children = getNodeRuntime(node).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      pickNode(children[i] as SceneNode, ray, predicate, maxDistance, cullBackfaces, onHit);
    }
  }
}

// Broad-phase (world AABB) then brute-force ray↔triangle narrow-phase for one mesh, reporting each
// passing triangle through `onHit`.
function intersectMeshTriangles(
  mesh: Readonly<Mesh>,
  ray: Readonly<Ray3D>,
  maxDistance: number,
  cullBackfaces: boolean,
  onHit: (hit: Readonly<SceneHit>) => void,
): void {
  getSceneNodeWorldBounds(_worldBounds, mesh);
  if (intersectRay3DAabb(ray, _worldBounds) < 0) return;

  ensureNodeWorldMatrix4(mesh);
  const worldMatrix = getNodeWorldMatrix4(mesh);
  if (!inverseMatrix4(_inverseWorld, worldMatrix)) return;
  transformPointByMatrix4(_localRay.origin, ray.origin, _inverseWorld.m);
  transformDirectionByMatrix4(_localRay.direction, ray.direction, _inverseWorld.m);

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
    if (t < 0 || t > maxDistance) continue;

    // World-space geometric face normal (normalized cross of two world edges). Transforming the
    // three verts by the world matrix — rather than the local normal by the inverse-transpose —
    // keeps the sign correct under mirroring/negative scale and yields the world normal directly.
    transformPointByMatrix4(_wa, _a, worldMatrix.m);
    transformPointByMatrix4(_wb, _b, worldMatrix.m);
    transformPointByMatrix4(_wc, _c, worldMatrix.m);
    if (!writeFaceNormal(_worldNormal, _wa, _wb, _wc)) continue;

    // Back-facing when the ray runs along the same side as the normal (dot > 0). Only the sign
    // matters, so the un-normalized ray direction is fine here.
    if (
      cullBackfaces &&
      ray.direction.x * _worldNormal.x + ray.direction.y * _worldNormal.y + ray.direction.z * _worldNormal.z > 0
    ) {
      continue;
    }

    _hit.node = mesh;
    _hit.distance = t;
    _hit.triangleIndex = triangle;
    _hit.normalX = _worldNormal.x;
    _hit.normalY = _worldNormal.y;
    _hit.normalZ = _worldNormal.z;
    getRay3DPointAt(_worldPoint, ray, t);
    _hit.pointX = _worldPoint.x;
    _hit.pointY = _worldPoint.y;
    _hit.pointZ = _worldPoint.z;
    getRay3DPointAt(_localPoint, _localRay, t);
    writeBarycentric(_hit, _localPoint, _a, _b, _c);
    onHit(_hit);
  }
}

// Writes the unit geometric face normal of triangle `a,b,c` (normalized `(b-a) × (c-a)`) into `out`,
// returning `false` for a degenerate (zero-area) triangle, in which case `out` is left untouched.
function writeFaceNormal(out: Vector3, a: Readonly<Vector3>, b: Readonly<Vector3>, c: Readonly<Vector3>): boolean {
  const e1x = b.x - a.x,
    e1y = b.y - a.y,
    e1z = b.z - a.z;
  const e2x = c.x - a.x,
    e2y = c.y - a.y,
    e2z = c.z - a.z;
  const nx = e1y * e2z - e1z * e2y;
  const ny = e1z * e2x - e1x * e2z;
  const nz = e1x * e2y - e1y * e2x;
  const lengthSquared = nx * nx + ny * ny + nz * nz;
  if (lengthSquared === 0) return false;
  const inv = 1 / Math.sqrt(lengthSquared);
  out.x = nx * inv;
  out.y = ny * inv;
  out.z = nz * inv;
  return true;
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

// Module-level scratch. This makes the pick pass non-reentrant (see forEachSceneRayHit) — a C/C++
// port moves these to per-call stack storage.
const _cameraRay = createRay3D();
const _localRay = createRay3D();
const _inverseWorld = createMatrix4();
const _worldBounds = createAabb();
const _a = createVector3();
const _b = createVector3();
const _c = createVector3();
const _wa = createVector3();
const _wb = createVector3();
const _wc = createVector3();
const _worldNormal = createVector3();
const _localPoint = createVector3();
const _worldPoint = createVector3();
const _hit = createSceneHit();
