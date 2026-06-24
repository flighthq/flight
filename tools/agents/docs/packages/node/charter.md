---
package: '@flighthq/node'
crate: flighthq-node
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

# node — Charter

## What it is

Retained-mode scene-graph core — the shared base graph that display objects, sprite graphs, and future graph families build on. Its concerns are: parent/child hierarchy and z-ordering, traversal, 2D/3D transform composition (local→world), bounds propagation, an invalidation/revision system, lifecycle (`createNode`/`disposeNode`), opt-in appearance/clip/material traits, hierarchy change signals, and a viewport scale/align transform. This is the "node library" tier of an engine (analogous to the `Node` / `Spatial` / `Object3D` base of Godot, Cocos, three.js, or PIXI's `Container` core) — explicitly _not_ concrete primitives, which live in `@flighthq/displayobject`, `@flighthq/sprite`, and `@flighthq/scene`.

Where it ends and a neighbor begins: `node` owns the _shared_ graph machinery — anything generic across graph families. A concrete primitive (a bitmap, a sprite, a 3D mesh) is its neighbor's; the line between "a node's source data / simulation" and "its participation in the shared graph" is the live, unsettled question (structural-fork A) and is the central open direction below.

## North star (proposed)

_Durable principles inferred from the design and the SDK-wide forks. Edit, cut, or promote into real direction._

1. **The shared graph spine, not the primitives.** `node` is the feature-keyed base every graph family composes — hierarchy, transforms, bounds, revision, traversal — exposed through the graph-feature aliases (`HierarchyNode`, `Transform2DNode`, `BoundsNode`, `Spatial2DNode`). The same hierarchy code must keep serving display objects, sprites, and future families without coupling to any of them.
2. **Revision/invalidation is the engine's heartbeat.** The seven-channel dirty system is the package's strongest asset and the contract higher tiers depend on; granular, lazy, revision-gated recompute (the `ensure*` recompute-if-dirty / `compute*` write-to-out / `get*` cached-read split) is the model every transform/bounds path follows.
3. **Explicit allocation, alias-safe out-params, pool brackets balanced.** Hot paths (transform conversion, bounds) are alloc-free and write to `out`; every `acquire*` has its matching `release*`. This is the C/C++-portability and bundle-discipline rule made concrete at the tier most engines make implicit.
4. **Traits are opt-in, side-effect-free, types-first.** Every capability beyond the base node is an opt-in `init*Trait` over a `Has*` contract defined in `@flighthq/types` first. No registration or mutable state at module top level; a 2D user pays nothing for 3D, and a hierarchy-only user pays nothing for appearance.
5. **2D and 3D reach the same bar.** The 2D transform/bounds tier is near-authoritative; 3D should reach parity (cached lazy local matrix, a 3D bounds tier) as a strictly-additive family — present 3D properly or mark the asymmetry as deliberate, never leave it an unexplained thin shell.

## Boundaries (proposed)

_Drawn from the review and neighbors. Confirm or redraw — especially the trait line, which the bundle decided silently._

**In scope (proposed):**

- Shared hierarchy, traversal, z-ordering, and the convenience operations over `HierarchyNode`.
- 2D/3D transform composition, bounds propagation, the revision/invalidation system, and the viewport scale/align transform.
- Node lifecycle (`createNode` / `createNodeRuntime` / `disposeNode` / `setNodeEnabled`) and opt-in hierarchy signals (`enableNodeSignals`).
- Opt-in trait initializers over `Has*` contracts — currently `appearance`, `clip`, `material`, `boundsRectangle`, `transform2d`, `transform3d`, and the bundle's `cacheAsBitmap`, `opaqueBackground`, `scrollRect`.

**Non-goals (proposed):**

- Concrete primitives (bitmap, shape, sprite, mesh) — those are `displayobject` / `sprite` / `scene`.
- Renderer registration, render state, and the draw/update pipeline — `@flighthq/render`.
- Hit-testing / spatial picking as a public query layer — overlaps `@flighthq/interaction` (open direction 6).
- Scene serialization — cross-cutting, needs the versioned-migration model (open direction 7).

## Decisions

None blessed yet.

## Open directions

_Every candidate question from the review, plus the structural forks that touch this package. This is where the uncertainty lives until you settle it._

1. **Where is the source-data / graph-participation line (structural-fork A)?** Do OpenFL DisplayObject properties — `cacheAsBitmap`, `opaqueBackground`, `scrollRect`, and the pre-existing `appearance` / `clip` / `material` — belong at the base `node` tier as opt-in traits, or in `@flighthq/displayobject`? This bundle answered "node" **silently** for three of them (added with tests but unmentioned in the worker status). The charter should ratify or reverse it, and the ruling sets the package's central boundary. _(Touches: structural-fork A; displayobject.)_
2. **`decomposeMatrix` home (cross-package).** `reparentNode(keepWorldTransform)` and the world-decomposition accessors (`getNodeWorldPosition`/`Scale`/`Rotation`, `setNodeWorldTransformMatrix`) are all blocked on 2×2 matrix decomposition. Does it live in `@flighthq/geometry` (pure math, benefits all callers) or inline in `transform2d.ts`? Surfaced, not decided.
3. **Skew: add or mark-omitted.** Settle `HasTransform2D.skewX`/`skewY` for OpenFL/Flash `Matrix` parity, or record a deliberate-omission decision with a doc comment. Currently absent and unmarked-by-design.
4. **3D parity and rotation representation.** Bringing 3D to 2D parity (cached lazy local matrix from TRS, a 3D bounds tier, a cached inverse for `convertNodeVector3GlobalToLocal`) needs a quaternion-vs-Euler choice that changes the public `HasTransform3D` surface (today: raw `localMatrix: Matrix4` only). Also: do 3D bounds (`getNodeLocalBoundsBox`/`WorldBoundsBox`) belong here or in `@flighthq/scene`? Mark the boundary before building. _(Touches: structural-fork G — 3D is in scope and strictly additive; scene.)_
5. **Signal coverage scope.** `enableNodeSignals` covers child/parent mutation only. Should it grow transform/bounds/enabled/disposed change signals (`onTransformChanged`/`onBoundsChanged`/`onEnabledChanged`/`onNodeDisposed`) — the revision channels already exist but are unwired — or is hierarchy-only the intended surface? Related: batch/deferred invalidation (`beginNodeBatch`/`endNodeBatch`) for bulk edits.
6. **Spatial query layer.** `pickNodeAtPoint` / `queryNodesInRectangle` overlap `@flighthq/interaction`'s hit-testing domain. Agree the seam with that owner before building, or declare it out of scope for `node`.
7. **Scene serialization.** `serializeNodeGraph` / `deserializeNodeGraph` is cross-cutting — needs the versioned-migration model and per-kind data delegation; a multi-package effort to scope, not a node-local task.
8. **Rust `flighthq-node` crate (conformance mirror).** The charter declares `crate: flighthq-node`, but the slotmap-arena foundation does not exist yet. When and to what shape does the Rust mirror get built? _(Touches: the conformance goal.)_
9. **Charter rubric is otherwise silent.** North star, Boundaries, and Decisions above are _proposed_ from evidence, not blessed. Until you confirm them, every review of this package falls back to the codebase-map AAA standard and flags the silence — confirming these turns the fallback into a real rubric.
