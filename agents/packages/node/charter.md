---
package: '@flighthq/node'
crate: flighthq-node
draft: false
lastDirection: 2026-07-01
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# node — Charter

## What it is

Retained-mode scene-graph core — the shared base graph that display objects, sprite graphs, and future graph families build on. Its concerns are: parent/child hierarchy and z-ordering, traversal, 2D/3D transform composition (local→world), 2D/3D bounds propagation, a seven-channel invalidation/revision system, lifecycle (`createNode`/`disposeNode`), opt-in cross-family traits (appearance, clip, material, boundsRectangle, transform2d, transform3d), hierarchy change signals, and a viewport scale/align transform. This is the "node library" tier of an engine (analogous to `Node` / `Spatial` / `Object3D` in Godot, Cocos, three.js) — explicitly _not_ concrete primitives, which live in `@flighthq/displayobject`, `@flighthq/sprite`, and `@flighthq/scene`.

Where it ends and a neighbor begins: `node` owns the shared graph machinery — anything generic across graph families. A concrete primitive (bitmap, sprite, 3D mesh) belongs to its owning package. Traits on `node` are the ones that cross graph families; entity-specific properties belong on the entity package.

## North star

1. **The shared graph spine, not the primitives.** `node` is the feature-keyed base every graph family composes — hierarchy, transforms, bounds, revision, traversal — exposed through the graph-feature aliases (`HierarchyNode`, `Transform2DNode`, `BoundsNode`, `Spatial2DNode`). The same hierarchy code serves display objects, sprites, and future families without coupling to any of them.
2. **Revision/invalidation is the engine's heartbeat.** The seven-channel dirty system is the package's strongest asset and the contract higher tiers depend on; granular, lazy, revision-gated recompute (the `ensure*` recompute-if-dirty / `compute*` write-to-out / `get*` cached-read split) is the model every transform/bounds path follows.
3. **Explicit allocation, alias-safe out-params, pool brackets balanced.** Hot paths (transform conversion, bounds) are alloc-free and write to `out`; every `acquire*` has its matching `release*`.
4. **Traits are opt-in, side-effect-free, types-first.** Every capability beyond the base node is an opt-in `init*Trait` over a `Has*` contract defined in `@flighthq/types` first. No registration or mutable state at module top level; a 2D user pays nothing for 3D, and a hierarchy-only user pays nothing for appearance.

## Boundaries

**In scope:**

- Shared hierarchy, traversal, z-ordering, and the convenience operations over `HierarchyNode`.
- 2D transform composition with full affine support (x, y, rotation, scaleX, scaleY, skewX, skewY, pivot).
- 3D transform composition via raw `localMatrix: Matrix4` (user composes rotation/scale/position with geometry helpers).
- 2D bounds propagation (local/parent/world rectangles) and 3D bounds propagation (AABB).
- The revision/invalidation system and the viewport scale/align transform.
- Node lifecycle (`createNode` / `createNodeRuntime` / `disposeNode` / `setNodeEnabled`) and opt-in hierarchy signals (`enableNodeSignals`).
- Opt-in cross-family trait initializers: `appearance`, `clip`, `material`, `boundsRectangle`, `transform2d`, `transform3d`.
- `reparentNode(child, newParent)` as the world-transform-preserving reparent (inline matrix decomposition).

**Non-goals:**

- Concrete primitives (bitmap, shape, sprite, mesh) — `displayobject` / `sprite` / `scene`.
- DisplayObject-specific properties — belong in `@flighthq/displayobject`.
- Renderer registration, render state, the draw/update pipeline — `@flighthq/render`.
- Serialization — a new dedicated package with a render-like registration seam (Decision #6).
- Transform/bounds/enabled "changed" signals — the revision system is the dirty-check mechanism; invalidation marks possibly-dirty, not actually-changed, so change signals would be misleading (Decision #4).

## Decisions

- **[2026-07-01] Trait boundary: cross-family traits live on node; entity-specific traits on their entity package.** The current trait set — appearance, clip, material, boundsRectangle, transform2d, transform3d — lives on `@flighthq/node` because these are concerns shared across display objects, sprites, and 3D scene nodes. DisplayObject-specific properties (`cacheAsBitmap`, `opaqueBackground`, `scrollRect`) do not belong here — they were already dropped by the displayobject charter Decision (2026-06-25). **Resolves Open direction #1.**

  **Why:** Node is the shared graph spine. A trait that only one graph family uses belongs on that family's package. These six traits are genuinely cross-family (sprites have appearance and transforms; 3D nodes have materials and transforms). The boundary is: if it crosses graph families, it's a node trait; if it's specific to one kind, it belongs on that kind's package.

- **[2026-07-01] 3D transform is intentionally raw-matrix — not a gap.** `HasTransform3D.localMatrix: Matrix4` with `@flighthq/geometry` helpers is the blessed design. The user composes rotation, scale, and position using geometry functions (`setMatrix4FromQuaternion`, etc.) and sets the matrix directly. There is no TRS decomposition on the 3D side — the matrix is the source of truth, and users choose their own rotation representation. **Resolves Open direction #4 (rotation representation).**

  **Why:** 3D rotation representation (quaternion vs Euler vs axis-angle) is a user choice that varies by domain. Committing to one at the node level would impose a convention that doesn't serve everyone. The matrix is the universal representation; geometry provides the composition helpers.

- **[2026-07-01] 3D bounds are node-level — same tier as 2D bounds.** AABB bounds for 3D nodes (`getNodeLocalBoundsBox`/`getNodeWorldBoundsBox`) belong on `@flighthq/node`, not on `@flighthq/scene`. Bounds propagation is a graph concern, and the revision/invalidation system already has the channels. **Resolves Open direction #4 (bounds ownership).**

  **Why:** 2D bounds live here; 3D bounds are the same abstraction in a different dimension. Scene owns concrete 3D primitives, not the graph plumbing they participate in.

- **[2026-07-01] Signal coverage stays hierarchy-only.** `enableNodeSignals` covers child/parent mutation (add, remove, reorder). Transform/bounds/enabled/disposed "changed" signals are not planned. The revision system is the engine's dirty-check mechanism — `invalidateNodeLocalTransform` marks a node as _possibly_ dirty, not as _actually changed_. A signal that fires on invalidation would be noisy and semantically misleading; a signal that fires only on confirmed change would require computing inside the invalidation path, defeating the lazy recompute model. **Resolves Open direction #5.**

  **Why:** The revision IDs are the low-cost, lazy mechanism for detecting change. Signals are for unambiguous events (a child was added); revision checks are for "has anything changed since I last looked?" These serve different purposes and should not be conflated.

- **[2026-07-01] Add `skewX`/`skewY` to `HasTransform2D`.** Two fields, both defaulting to 0. When both are 0 the composition is identical to the non-skew path (a branch skips the skew math). When nonzero, the skew angles are added to the rotation before sin/cos in the local matrix composition. This completes the full 2D affine decomposition without requiring users to drop down to raw matrix manipulation for common shear effects. **Resolves Open direction #3.**

  **Why:** The cost is near-zero (two number fields, one branch check on the fast path, no renderer changes needed — renderers already honor the composed matrix). Skew is the one piece of a full 2D affine transform that cannot be expressed with x/y/rotation/scaleX/scaleY alone. Named fields are discoverable; "set the matrix directly" is not. A matrix-first model requires raw matrix manipulation for skew; Flight can do better. Flight's TRS-forward model (fields are the source of truth, matrix is derived) means skew fields are lossless — unlike a matrix-first model where decomposition loses skew information.

- **[2026-07-01] Serialization is a new dedicated package, not node functions.** `serializeNodeGraph`/`deserializeNodeGraph` are out of scope for `@flighthq/node`. Serialization follows the render analogy: a new package owns the registration seam (`registerSerializer(state, FooKind, serializer)`), the graph walk, the output format, and the versioned migration model. Each owning package plugs in how its kinds serialize, just as each plugs in how its kinds render. **Resolves Open direction #7.**

  **Why:** Serialization is cross-cutting — it needs per-kind data delegation from every entity package, a migration model, and format decisions. Node provides the graph structure that serialization walks, but does not own the serialization concern. The render analogy is precise: render defines the registration seam and the walk; each package registers its renderers. Serialization does the same for read/write.

- **[2026-07-01] `reparentNode` is the world-transform-preserving reparent — not an alias for `addNodeChild`.** `addNodeChild(parent, child)` is the basic "put this child here" (local transform unchanged). `reparentNode(child, newParent)` preserves the child's world position by decomposing the matrix and recomputing local TRS. Two genuinely different operations, distinguished by name and parameter order. The decomposition math lives **inline** in `reparentNode` — not as public getters in `@flighthq/geometry`. **Resolves Open direction #2.**

  **Why:** `addNodeChild` + `reparentNode` as two functions with genuinely different behavior (one preserves local transform, the other preserves world transform) is cleaner than a boolean flag. The decomposition is inline math for a rare, deliberate operation. Public `getMatrixRotation`/`getMatrixScaleX` getters in geometry were rejected: they hide transcendental cost behind a `get` name, they are lossy with skew (can't distinguish rotation from rotation+skew), and their only load-bearing use case is this one function. Flight's transform model is TRS-forward (fields → matrix); making the reverse direction convenient invites the wrong pattern.

## Open directions

1. **Spatial query layer.** `pickNodeAtPoint` / `queryNodesInRectangle` / frustum culling — the "what nodes are in this region?" question. For 2D, this overlaps `@flighthq/interaction`'s hit-testing domain but is also a viewport-culling concern that has nothing to do with user interaction. For 3D (frustum culling), the home is even less clear — it could be node, render, scene, or a dedicated spatial-index package. The use case is real; the home isn't settled. _(Was Open direction #6.)_

2. **Batch/deferred invalidation (`beginNodeBatch`/`endNodeBatch`).** Performance work for bulk hierarchy edits that settles bounds/transform once. Should be measured with benchmarks before adding API surface. Gold-tier.

3. **Rust `flighthq-node` crate (conformance mirror).** The slotmap-arena foundation does not exist yet. Large, separate Rust-worktree workstream. _(Was Open direction #8.)_
