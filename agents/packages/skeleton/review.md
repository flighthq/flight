---
package: '@flighthq/skeleton'
status: stub
score: 27
updated: 2026-07-03
ingested:
  - source
  - tests
---

# skeleton — Review

_Migrated from the 2026-07-03 depth-review generation (reviews/depth/skeleton.md)._

**Domain:** Skeletal animation / skinning — joint sets, bind poses, skin-palette computation, pose operations, and skeletal deformation — over animated `SceneNode` bones.

**Verdict:** stub — completeness 27/100

The package exports exactly three functions in one file: `createSkeleton(joints, inverseBindMatrices?)`, `setSkeletonBindPose(skeleton)`, and `computeSkeletonJointMatrices(skeleton)`, over a three-field `Skeleton` type (`joints: SceneNode[]`, `inverseBindMatrices`, `jointMatrices` — flat column-major 16-float blocks). The architectural position is deliberate and good: joints are ordinary `SceneNode`s animated through the scene binding, so the skeleton owns no second hierarchy and no sampling — only skinning math. But within that already-narrowed scope, the package implements exactly one operation (the GPU palette) and none of the rest of what a skinning library provides. Against ozz-animation (sampling/blending/local-to-model jobs, two-bone and aim IK, rest poses) or Spine runtime concepts (named bone lookup, attachments, constraints, skinned bounds), this is the first ~quarter of the smallest tier of the domain.

## Present capabilities

- `computeSkeletonJointMatrices` — the load-bearing kernel: `jointMatrices[j] = jointWorld(j) * inverseBind(j)` per joint, alloc-free via module scratch matrices, writing into the pre-allocated palette `Float32Array` ready for upload as a bone uniform. Correct and tested against a 3-joint chain, delta-from-bind, identity-at-bind, and (notably) the alias case where `jointMatrices` and `inverseBindMatrices` share a buffer — the out-parameter aliasing convention applied conscientiously.
- `createSkeleton` — accepts glTF-style inverse-bind matrices directly (a `Float32Array` accessor slots in with no conversion), or captures the current pose as the bind pose when omitted.
- `setSkeletonBindPose` — re-captures bind from the joints' current world matrices; the "current pose becomes rest pose" workflow.

The `Skeleton` type lives in `@flighthq/types` with a strong doc comment explaining palette semantics. Dependency shape is clean (`geometry`, `node`, `types`; `scene` is dev-only for tests).

## Gaps vs an authoritative skinning / skeletal-animation library

- **CPU skinning is absent entirely.** No `applySkeletonToMeshGeometry` / linear-blend-skinning of positions and normals given per-vertex `joints`/`weights` attributes. Every skinning library has the CPU path — it is what software renderers (`displayobject-skia` in the Rust port), skinned picking, and skinned bounds all sit on. Nothing in the repo consumes `jointMatrices` on the CPU today.
- **Dual-quaternion skinning:** no DQS palette or blend path (the standard fix for LBS candy-wrapper collapse; ozz and every engine offer it as a sibling mode).
- **Pose operations:** no pose type at all — no local-pose buffer, no `copySkeletonPose`/`lerpSkeletonPose`/`blendSkeletonPose` (per-joint weighted blend, additive layers — ozz's `BlendingJob`), no rest-pose reset. Pose blending may end up owned by `@flighthq/animation`'s future mixer (the flagged animation/skeleton/tween boundary), but *someone* must own per-joint masked blending, and the joint mask is inherently a skeleton concept.
- **IK:** no two-bone IK, no aim/look-at constraint solver (ozz ships both as core jobs; Spine has IK constraints). Foot placement and head tracking are table stakes for a skeletal package.
- **Joint metadata and lookup:** no joint names — `getSkeletonJointIndexByName` (sentinel `-1`) is the first thing a glTF or Spine importer needs to bind attachments and IK targets. The `Skeleton` type has no place to put names at all.
- **Skinned bounds:** no `computeSkeletonBounds` / skinned-AABB from the current palette (needed for culling an animated character; three.js `SkinnedMesh.computeBoundingBox`, ozz utilities).
- **Attachment helpers:** no `getSkeletonJointWorldMatrix`-style accessor for socketing a prop to a bone (doable via `@flighthq/node`, but the named-joint + palette-order seam belongs here).
- **Palette limits and packing:** no max-joint validation or mesh partitioning for uniform-array limits, no palette-texture packing helper for the texture-fetch bone path.
- **Validation:** `createSkeleton` accepts an `inverseBindMatrices` of any length; a mismatch (`length !== joints.length * 16`) silently reads/writes out of range. The SDK convention would be a sentinel-returning `validateSkeleton` or a documented precondition.
- **Retargeting:** absent (acceptable to defer, but part of the authoritative surface — ozz offers it via its runtime skeleton model).

## Naming / API-shape notes

- All three names carry the full `Skeleton` type word and are globally self-identifying. `create*` allocates; `compute*`/`set*` mutate in place with no hidden allocation — verb usage matches the SDK contract precisely.
- `computeSkeletonJointMatrices(skeleton: Readonly<Skeleton>)` takes `Readonly<>` yet writes `skeleton.jointMatrices` — legal (the `Float32Array` contents are not frozen by `Readonly`) but semantically off: the palette is the function's output. Either drop `Readonly` or split the palette out as an explicit `out: Float32Array` parameter; the same applies to `setSkeletonBindPose` writing `inverseBindMatrices`. The out-parameter form would also compose better with multi-skeleton instancing (many palettes, one skeleton).
- Module scratch matrices (`_invBind`, `_result`) at the bottom of the file follow source-style rules; the per-element copy loop into `_invBind` is a small inefficiency a `setMatrix4FromArray(out, array, offset)` geometry helper would clean up.
- `Skeleton` stores `joints: SceneNode[]` (mutable array of mutable nodes) — fine as plain data, but the type could take `readonly SceneNode[]` since reordering joints after palette allocation is never valid.
- The type is correctly header-first in `@flighthq/types`. When joint names/masks/poses arrive, define them there first per the header-layer rule.

## Recommendation

Keep the palette kernel and the joints-are-SceneNodes architecture — both are right. Build outward in this order:

1. **CPU skinning** (`applySkeletonToMeshGeometry` or a lower-level `skinVertices(outPositions, outNormals, positions, normals, joints, weights, jointMatrices)`): unlocks software rendering, skinned picking, and skinned bounds, and is required for Rust-port conformance fingerprinting (deterministic, GPU-free).
2. **Joint names + `getSkeletonJointIndexByName`** (sentinel `-1`) — the importer/attachment seam; add `validateSkeleton` alongside.
3. **Pose buffer + masked blending** — coordinate with `@flighthq/animation`'s blending design (the flagged boundary): the skeleton should own the joint-mask and pose-buffer types even if the mixer loop lives in animation.
4. **Skinned bounds** (`computeSkeletonBounds`) and a joint-attachment accessor.
5. **Two-bone IK and aim constraints**, then DQS as a palette-mode sibling.

The one operation present is implemented to a high standard; the package is a stub only in the sense that matters here — the domain surface. It is the single most essential function of a skinning library with nothing yet around it.
