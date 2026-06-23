---
id: node
title: '@flighthq/node'
type: depth
target: node
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/node.md
  - tools/agents/docs/reviews/depth/node.md
depends_on: []
updated: 2026-06-23
---

## Summary

(from depth review): solid — 78/100; the canonical spine of a scene-graph base is present with real engineering depth (fine-grained revision/dirty channels, cached lazy transforms, offset-only world-bounds fast path), but traversal/query primitives, lifecycle teardown, and 3D parity are missing-by-omission rather than excluded-by-design.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The 20% that closes the largest authoritative gap (traversal) and satisfies the codebase's own teardown contract. Shippable, basic, high-leverage.

- **Traversal primitive (the single biggest gap).** Bring `walkNode` into this package as the base-graph depth-first visitor — it currently lives in `@flighthq/render` against `Renderable`, so the base graph itself ships no traversal. Add:
  - `walkNodeDescendants(source, visit)` — DFS pre-order visitor returning `boolean` (early-out when `visit` returns `false`), operating on `HierarchyNode` so display objects, sprites, and scene nodes all share it. Define the `NodeDescendantVisitor<Traits>` callback type in `@flighthq/types`.
  - `forEachNodeDescendant(source, callback)` — non-early-out convenience over the same walk.
- **Recursive search** (only the shallow `getNodeChildByName` exists today):
  - `findNode(source, predicate): NodeOf<Traits> | null` (sentinel `null`).
  - `findNodeByName(source, name): NodeOf<Traits> | null` — recursive counterpart to the single-level `getNodeChildByName`.
- **Ancestor iteration** — both `getNodeRoot` and `containsNodeChild` already walk parents internally; expose it:
  - `getNodeDepth(source): number` (root = 0).
  - `forEachNodeAncestor(source, callback)` (root-ward walk, early-out variant matching `walkNodeDescendants`).
- **Lifecycle teardown** (`dispose*` is mandated codebase-wide and absent here):
  - `disposeNode(target)` — detach/clear `nodeSignals` + `interactionSignals`, recursively detach descendants from the graph, null out `children`/`parent`, leave the node as plain GC memory. Decide and mark whether any node owns a non-GC resource; if not, no `destroyNode` (document the absence).
- **Fix the 3D allocation regression** flagged in review: `convertNodeVector3GlobalToLocal` allocates a fresh `Matrix4` per call via `createMatrix4()`. Cache an inverse-world `Matrix4` slot on `HasTransform3DRuntime` (mirroring the 2D path's cached transforms) so the hot path is alloc-free.
- **Consistency cleanups** the disciplined codebase expects: align `getNodeWorldTransformRevision`'s param to `Readonly<Node<Traits>>` like its sibling revision getters; replace the loose `==` in `getNodeChildIndex`/swap/contains paths with `===`.

### Silver

Competitive with a good, well-regarded scene-graph base (Godot `Node`, three.js `Object3D`, PIXI `Container` core). Common professional use, important edge cases, 2D/3D symmetry.

- **Hierarchy convenience** matching peer engines:
  - `addNodeChildren(target, ...children)` batch add (single bounds/signal settle).
  - `replaceNodeChild(target, oldChild, newChild)`.
  - `getNodeNextSibling(source)` / `getNodePreviousSibling(source)` (sentinel `null`).
  - `getNodeChildren(source): readonly NodeOf<Traits>[]` — read-only snapshot for callers that need an array without touching internal `children`.
  - `Symbol.iterator`-friendly accessor or `forEachNodeChild(source, callback)` so consumers stop hand-rolling `getNodeChildCount`/`getNodeChildAt` loops.
- **Reparenting that preserves world transform** — the standard scene-graph affordance the review calls out; reparenting works today but always drops world transform:
  - `reparentNode(child, newParent, keepWorldTransform)` — when `keepWorldTransform`, recompute local TRS so world transform is unchanged after the move.
- **Ancestry queries** (the package already does coordinate-space conversion that wants these):
  - `isNodeAncestorOf(ancestor, descendant): boolean`.
  - `getNodeCommonAncestor(a, b): NodeOf<Traits> | null` (lowest common ancestor) — the natural primitive behind cross-node coordinate conversion.
  - `getNodeAncestors(source): readonly NodeOf<Traits>[]` snapshot.
- **World-transform decomposition accessors** (none exist; consumers can only read the matrix):
  - `getNodeWorldPosition(out, source)`, `getNodeWorldScale(out, source)`, `getNodeWorldRotation(source): number` for 2D; `out`-param, alias-safe.
  - `setNodeWorldTransformMatrix(target, worldMatrix)` — world→local inverse setter (set position by giving a world matrix).
- **Resolve the skew question for `HasTransform2D`** (`x,y,rotation,scaleX,scaleY,pivot` only today; OpenFL `Matrix` and most 2D engines expose skew). Either add `skewX`/`skewY` to the type in `@flighthq/types` and fold them into `ensureNodeLocalTransformMatrix`, or mark skew missing-by-design in the type's doc comment. Silver leans toward adding it — OpenFL parity is the stated feature target.
- **Bring 3D to 2D parity** (3D is "a thin shell next to the 2D side"):
  - Cached, lazy 3D local-matrix built from TRS components — add a `HasTransform3D` TRS shape (`position`/`rotation` quaternion or euler/`scale`) and an `ensureNodeLocalTransformMatrix4`, instead of storing a raw `localMatrix` only.
  - `convertNodeVector3*` should consume the cached path (already alloc-fixed in Bronze).
  - **Surface the 3D-bounds boundary decision**: decide explicitly whether a 3D bounds tier (`getNodeLocalBoundsBox`/`getNodeWorldBoundsBox` over an AABB type) lives here or in `@flighthq/scene`, and mark the boundary in `index.md` either way. This is a cross-package design item, not an autonomous add.
- **Iteration order/options** common in mature bases: an optional bottom-up (post-order) traversal mode on `walkNodeDescendants` for teardown/aggregation passes, and a `visibleOnly`/`enabledOnly` filter flag so the world-bounds skip logic generalizes to all walks.

### Gold

Authoritative / AAA — the canonical reference for a retained-mode graph base. Exhaustive, performant, fully tested and documented, with 1:1 Rust parity.

- **Spatial query layer** (what separates an engine-grade base from a graph utility):
  - `pickNodeAtPoint(source, point, predicate?)` top-most-first hit walk against `worldBounds` (the structural primitive `@flighthq/interaction` builds richer hit testing on; coordinate with that package's owner before adding).
  - `queryNodesInRectangle(out, source, rectangle)` / `queryNodesInBox` broad-phase collection against cached bounds.
  - `getNodeBoundsIntersection` / `doNodeBoundsOverlap` convenience over existing bounds tiers.
- **Optional spatial-index acceleration** for large graphs, gated as a nullable runtime hook so it tree-shakes when unused (per the "gate optional subsystems with nullable hooks" memory): a `NodeBoundsIndexRuntime` slot fed by the world-bounds invalidation channel, with `rebuildNodeBoundsIndex` / `queryNodeBoundsIndex`. Premature for Bronze/Silver; Gold-only and measured.
- **Scene serialization spine** — kind-string round-trip the codebase's kind model is explicitly designed for: `serializeNodeGraph(source)` / `deserializeNodeGraph(data, registry)` producing plain JSON keyed by `*Kind` strings, plus a versioned migration seam (`registerNodeMigration`) per the types-layout doc's versioned-scene-migration model. Per-kind data is delegated to each owning package; the base owns hierarchy + traits + transform.
- **Full signal coverage via `enable*` groups**: add transform/bounds/enabled-change signals (`onTransformChanged`, `onWorldTransformChanged`, `onBoundsChanged`, `onEnabledChanged`, `onNodeDisposed`) behind the existing `enableNodeSignals` opt-in, so observers can react to the revision channels without polling. Keep them off the default cost path.
- **Performance hardening**: batch/deferred invalidation (`beginNodeBatch`/`endNodeBatch`) so bulk hierarchy edits settle bounds/transform once; an offset-only fast path for 3D world bounds matching the existing 2D `tryFastRecomputeWorldBoundsRectangle`; benchmark coverage for deep-tree world-transform propagation.
- **Exhaustive edge-case + alias-case tests**: cycle-detection guard on `addNodeChild`/`reparentNode` (adding an ancestor as a descendant — throw on misuse per the sentinel-vs-throw rule), every `out`-param function tested with `out === input` aliasing, traversal early-out and post-order tests, dispose-during-traversal safety.
- **Docs**: a package-level orientation doc covering the entity/runtime split for nodes, the revision-channel model (the package's strongest, least-obvious feature), the trait opt-in model, and the traversal/query API — the kind of reference a domain expert expects.
- **1:1 Rust parity** in a `flighthq-node` crate (does not yet exist): the slotmap-arena scene graph from `rust/index.md` (`NodeId`, `NodeArena<T>`, free functions over `(&mut NodeArena<T>, NodeId)`), `KindId` registry, the full traversal/query/transform/bounds/revision API mirrored snake_case, and conformance entries pairing it against the TS package in the divergence map.

## Sequencing & effort

Recommended order, dependencies, and items to surface rather than do autonomously.

1. **Bronze first, in one pass** (low effort, self-contained, no other-package coupling): traversal (`walkNodeDescendants`/`forEachNodeDescendant`), recursive `findNode`/`findNodeByName`, ancestor helpers (`getNodeDepth`/`forEachNodeAncestor`), `disposeNode`, the 3D alloc fix, and the `==`/`Readonly` consistency cleanups. Define `NodeDescendantVisitor` in `@flighthq/types` before implementing. **Coordinate with `@flighthq/render`** on `walkNode`: decide whether render's `walkNode` becomes a thin wrapper over the new base-graph primitive or is deduplicated — this is the one cross-package touch in Bronze and should be raised, not done silently.
2. **Silver, in two sub-waves.** First the pure-hierarchy/ancestry batch (`addNodeChildren`, `replaceNodeChild`, siblings, `getNodeChildren`, `isNodeAncestorOf`, `getNodeCommonAncestor`, `reparentNode`) — all local, medium effort, build directly on Bronze traversal. Then the transform-shape work (world decomposition accessors, the skew decision, 3D TRS parity) which requires **types-first changes to `HasTransform2D`/`HasTransform3D` in `@flighthq/types`** and touches `@flighthq/geometry` for any new decomposition/AABB helpers. The **skew question and the 3D-bounds-ownership boundary** are design decisions to surface to the user before acting — both change the type header and one (3D bounds) may belong in `@flighthq/scene` instead of here.
3. **Gold is the genuine frontier and spans packages.** Spatial query (`pickNodeAtPoint`, `query*`) overlaps `@flighthq/interaction`'s domain — agree the seam with its owner first. Serialization needs the versioned-migration model from the types-layout doc and per-package data delegation — a cross-cutting design effort, not a single-package task. The spatial index and batch-invalidation are performance work that should be measured (`npm run size` for tree-shaking of the optional index; benchmarks for propagation) before landing. The Rust `flighthq-node` crate is a large, separate workstream gated on the slotmap-arena foundation in the Rust worktree.

**Effort summary**: Bronze is small and high-value (mostly local, one cross-package coordination). Silver is medium and gated on two `@flighthq/types` header edits plus two design decisions. Gold is large, cross-package, and partly a Rust-port workstream — the real distance from "solid" to "authoritative" is Bronze + the Silver transform/3D-parity wave; everything past that is engine-grade extension.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/node` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
