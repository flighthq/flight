---
package: '@flighthq/geometry'
updated: 2026-08-08
by: principal
---

# geometry — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/geometry/src/` on 2026-08-08. A file:line here is a
claim about this tree, not about a session.

- **`setPerspectiveMatrix4`'s second parameter is the tangent of the half-FOV, not a field of view.**
  The body computes `top = fov * zNear` (`matrix4.ts:1181`) while the parameter is named `fov`
  (`:1172`). Both callers pre-multiply and carry a warning comment to say so —
  `camera/src/projection.ts:69-71` and `render/src/sceneRender.ts:374-375`. The name is the defect.
- **OBB hot paths allocate per call**, in the package whose north star is allocation-free math:
  `obbLocalAxes` returns a fresh 9-tuple (`obb.ts:320-322`, destructured at `:51`, `:84`, `:129`,
  `:171-172`), `intersectRay3DObb` builds three temporary arrays (`obb.ts:86-88`), and
  `obbSatSeparated` creates an `onAxis` closure per invocation (`obb.ts:380`).
- **Four pair predicates are absent** over already-homed types: `isAabbIntersectingSphere` (Arvo),
  `isObbIntersectingSphere`, `isCapsuleIntersectingAabb`, `isFrustumIntersectingObb`. A repo-wide grep
  over `packages/` finds no definition of any of them.
- **Conventional singles are absent**: `transformRay3DByMatrix4` (the picking-into-local-space
  primitive), `getQuaternionAxisAngle` (inverse of the existing `setQuaternionFromAxisAngle`), and the
  scalar 2D kit `crossVector2` / `rotateVector2` / a plain `getVector2Angle` — only
  `getVector2AngleBetween` exists (`vector2.ts:91`). 2D `Matrix` also has no skew or SRS decompose.
- **`transformVector3ByMatrix3` takes an inline matrix shape** — `Readonly<{ m: Readonly<Float32Array> }>`
  at `vector3.ts:445` instead of `Matrix3Like`. Same types-homing drift already repaired on
  `expandAabbBySphere`.
- **`enableGeometryPoolGuards()` is chartered (2026-07-03) but unbuilt** — no guard module exists
  anywhere in the tree.
- **`__getAxisRotation` never normalizes its axis**, so a non-unit axis silently produces a scaling
  matrix rather than a rotation: `let ax = x, ay = y, az = z` (`matrix4.ts:1284-1286`) feeds the
  Rodrigues terms with no length division, and axis `(0, 0, 2)` at 90 degrees yields `m[1] = 2`,
  `m[4] = -2`, `m[10] = 4`. It reaches callers through all three public rotation entry points —
  `appendRotationMatrix4` (`matrix4.ts:33`), `prependRotationMatrix4` (`:775`), and `rotateMatrix4`
  (`:852`). The unit-axis precondition is now stated on each of those three doc comments, matching
  `setQuaternionFromAxisAngle` (`quaternion.ts:309`), which carries and documents the identical
  precondition — so this is a package-wide convention with a documentation gap, not a matrix4 defect.
  Turning it into a runtime warning belongs to the unbuilt `enableGeometryPoolGuards()` route above.
- **Doc/style hygiene:** the Float32Array bridges say "byte offset" where the offset is in elements
  (`matrix3.ts:331`, `:437`; `vector3.ts:390`, `:456`; `vector4.ts:369`, `:405`); `var` relics survive
  in `rotateMatrix` (`matrix.ts:433`, `:437`, `:441`).
- **There is no `crates/` directory in this repo.** The `crate: flighthq-geometry` stamp and every
  crate-conformance note point at the separate flight-rs repo, not at work reachable from this tree.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The headline 2026-08-05 claim checked out
  **false**: "2D translation still leaves a distinct output's linear terms stale" — `translateMatrix`
  writes through `setMatrix(out, a, b, c, d, tx + dx, ty + dy)` (`matrix.ts:587-590`), so a distinct
  `out` receives all six fields. The Obb/Capsule "cross-package type decision" (both types now home in
  `@flighthq/types`, `obb.ts`/`capsule.ts` built) and the `setQuaternionFromEuler` /
  `setQuaternionLookRotation` formula concerns are likewise closed and dropped.
- **2026-08-05** — Transform2D/Transform3D carriers added; Matrix3 storage aligned with the
  column-major Matrix4/GL ABI; the perspective infinite-far limit made explicit.
- **2026-07-09** — `setPerspectiveMatrix4` wrote `m[15] = 1` (an identity leftover) where a perspective
  matrix requires `0`; the fix staled every perspective 3D functional regression fingerprint.
- **2026-07-09** — `rotateMatrix4` / `appendRotationMatrix4` / `prependRotationMatrix4` flipped from
  degrees to radians, making the package uniformly radians and the layer rule uniform.
- **2026-06-25** — Closest-point suite added; `getQuaternionEuler` rewritten as the true inverse of
  `setQuaternionFromEuler` for all six orders; `expandAabbBySphere` moved to `BoundingSphereLike`.
- **2026-06-25** — Ray3D, AABB/sphere/plane/frustum expansion, Matrix3/4 Float32Array bridges, and the
  quaternion Euler/look-rotation family landed from the staged port.
