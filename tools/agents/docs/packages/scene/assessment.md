---
package: '@flighthq/scene'
updated: 2026-06-24
basedOn: ./review.md
---

# scene — Assessment

> Recommendation layer over `review.md` (the `builder-67dc46d64` survey, `solid — 68/100`). Sorts the review's gaps into sweep-safe `Recommended` and parked `Backlog`. No prior `reviews/maturation/depth/scene.md` exists in this worktree — its roadmap (Bronze/Silver/Gold) is already absorbed into the review's status-verification table and gaps, so there is no separate seed to remove. Design forks and cross-package items are routed to the charter's Open directions, not into `Recommended`. `Approved` is empty until verbal approval.

## Recommended

Strictly sweep-safe: within `@flighthq/scene`, no cross-package coupling, no breaking public-API change, no open design decision. A blanket "do all recommended" can bless this set.

1. **Collapse the raycaster's dead ternaries.** `sceneNodeRaycast.ts` carries two no-op ternaries (`absoluteTriIndex = indexedMode ? tri : tri` and the identical-branch `absoluteIndexStart`). Both branches are equal, so the dead logic should collapse to the plain assignment. Pure within-file cleanup, no behavior change. — review.md#gaps (Raycaster code quality)

2. **Use `createVector3` instead of literal casts in the raycaster.** `sceneNodeRaycast.ts` builds `point` as `{ x, y, z } as Vector3` and defines a local `_createVector3()` returning `{ x:0,y:0,z:0 } as Vector3` _next to the imported `createVector3` it never calls_. Replace the literal casts with the constructor and delete the local helper — satisfies the source-style "constructors over object literals for SDK entity types" rule. Within-package, no API change. (The result type still allocates a hit per call; whether to _pool_ those hits is an Open direction, not part of this cleanup — see below.) — review.md#gaps (Raycaster code quality)

3. **Correct raycast normals to the inverse-transpose.** Raycast normals are transformed by the world matrix's upper-3×3 rather than its inverse-transpose, documented as a uniform-scale-only approximation but wrong under non-uniform scale. Switching to the inverse-transpose (or transforming the triangle and recomputing the geometric normal in world space) is a within-package correctness fix with no cross-package coupling and no public-signature change. — review.md#gaps (Normal accuracy)

## Backlog

Parked: each waits on a cross-package coordination, a larger scope, or an Open direction the charter must settle first.

- **BVH/octree spatial acceleration.** Culling and raycasting are linear O(n) subtree walks. Adding a BVH/octree is the review's named performance ceiling, but its _home_ (scene-internal vs. a `scene-spatial` neighbor) is a bedrock/decomposition call — Open direction #4. Parked until the charter rules. — review.md#gaps (No spatial acceleration)

- **Per-node visibility / render-layer mask.** Culling keys only on `enabled`; a `renderLayer` / visibility-mask field is a `@flighthq/types` change coordinated with `render` and the cull walk — cross-package, and Open direction #6. Parked. — review.md#gaps (No per-node visibility/layer mask)

- **Skinning/animation node family (`Bone`/`Skeleton`/`SkinnedMesh`).** The largest Gold item; cross-package (mesh skin weights + a backend palette upload) and gated on fork G's within-3D boundary question (`scene` vs. a future `skeleton`/`animation` package) — Open direction #7. Parked. — review.md#gaps (Skinning/animation node family absent)

- **Scene serialization / descriptor round-trip.** No round-trip to a plain descriptor; needs a resource-key strategy and touches `types`/`resources` — cross-package. Parked. — review.md#gaps (No serialization / scene descriptor)

- **`flighthq-scene` Rust crate.** Unstarted; TS is authoritative and the mirror is downstream conformance work, not within-package TS maturation. Parked (and worth a register note that the mirror is pending). — review.md#gaps (No Rust crate yet)

- **Flip `cloneSceneNode`'s per-kind cascade to a registry (fork B).** `_cloneNode` is a closed `if (isInstancedMesh) … else if (isLodMesh) …` cascade over the taxonomy. Fine today under fork B's "tight loop within a closed system" exception, but a candidate to flip to a per-kind `cloneNode` registered beside each constructor _as the taxonomy grows_. Tracked, not yet acting — revisit on growth, not a sweep item. — review.md#structural-fork-fit (Fork B)

## Approved

_None. Approval is the user's verbal gate; this section is frozen only when an item is approved._

## Routed to charter Open directions

Surfaced for the user to settle in `charter.md`; **not** acted on here (each needs a North-star or Boundary decision):

- **North star / bar** — minimal spatial graph + queries vs. a full three.js/Babylon-class system. (review open direction #1)
- **`Scene` vs `Group` vs bare `SceneNode`** — bless the root-identity / named-container / anonymous- transform distinction or collapse it. Resolves the `createScene`/`createGroup` overlap gap. (review open direction #2; review.md#gaps)
- **Cull/render-walk contract ownership** — ratify the caller-driven cull-list seam (scene builds → render consumes) vs. `prepareSceneRender` owning culling. (review open direction #3)
- **Acceleration-structure home** — `scene`-internal vs. a `scene-spatial` neighbor (bedrock call; gates the BVH/octree backlog item). (review open direction #4)
- **Instance-data home (fork A)** — per-instance matrices/colors on `InstancedMesh` vs. a separate instancing data layer. (review open direction #5)
- **Visibility/layer mask scope** — whether a `renderLayer`/visibility-mask field is in scope (gates the mask backlog item). (review open direction #6)
- **Skinning/animation node family home** — in `scene` vs. a future `skeleton`/`animation` package (gates the skinning backlog item). (review open direction #7)
- **Raycast result allocation policy** — per-call allocation (current) vs. pooled acquire/release for pointer-move-frequency picking. Settles whether the recommended raycaster constructor cleanup is the end state or a way-station to pooling. (review open direction #8)
