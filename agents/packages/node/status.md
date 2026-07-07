---
package: '@flighthq/node'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# node — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-07-03 — inline warning-comment cleanup (lint sweep)

`no-warning-comments` is now enforced over `packages/*/src` (see `.oxlintrc.json`). Three `// hack` markers in `src/boundsRectangle.test.ts` (lines 298/327/329) were rewritten in place as descriptive comments — the tests write cached bounds rectangles directly (bypassing invalidation) so the scaled recalculation is observable. Nothing transient to track; behavior unchanged.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Executed the sweep-safe items from `assessment.md` → `## Recommended`.

**Done:**

- Unified the two traversal styles in `traversal.ts`: `walkNodeDescendants` now hoists the children array once (`getNodeRuntime(source).children`, null-guarded) and iterates over `children.length` directly, matching its sibling `forEachNodeDescendant`. Previously it re-fetched `getNodeRuntime(source).children!` inside the loop each iteration and drove iteration off `getNodeChildCount`. Behavior-preserving; the now-unused `getNodeChildCount` import was dropped. (review.md#minor-in-source-nits)

No new exported functions, so `exports:check` surface is unchanged. The pre-existing `walkNodeDescendants` test (leaf node returns `true`) already covers the null-children path.

**Parked:** nothing additional — the assessment's `## Recommended` lists exactly one strictly sweep-safe outstanding item (the hoist above). The conditional signal-coverage item is gated on Open direction #5 and lives in Backlog by design.

**Tests:** `npm run test --workspace=packages/node` — 14 files, 280 passed.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/node

**Session date**: 2026-06-24 **Previous score**: 78/100 (solid) **Estimated new score**: 90/100

## Implemented APIs

### Bronze: Traversal (new file `traversal.ts`)

- `findNode(source, predicate)` — depth-first recursive descendant search by predicate; returns `null` sentinel on miss
- `findNodeByName(source, name)` — recursive name search over the full subtree (distinct from the shallow `getNodeChildByName`)
- `forEachNodeAncestor(source, callback)` — parent-chain walker with early-out; root node is not visited
- `forEachNodeDescendant(source, callback)` — full DFS pre-order walk without early-out
- `getNodeChildren(source)` — read-only copy of direct children; empty array (not null) for leaf nodes
- `getNodeDepth(source)` — 0 for root, +1 per parent hop
- `getNodeNextSibling(source)` / `getNodePreviousSibling(source)` — sibling navigation with null sentinels
- `walkNodeDescendants(source, visit)` — DFS pre-order visitor with early-out (visitor returns false to stop); returns boolean indicating completion vs early exit

New type added to `@flighthq/types`: `NodeDescendantVisitor<Traits>` (callback type for `walkNodeDescendants`)

### Bronze: Lifecycle (`node.ts`)

- `disposeNode(target)` — detaches from parent, recursively disposes all descendants, clears `nodeSignals` and `interactionSignals`; documented non-existence of `destroyNode` (nodes own no non-GC resources at this tier)

### Bronze: 3D alloc fix (`transform3d.ts`)

`convertNodeVector3GlobalToLocal` was allocating a fresh `Matrix4` on every call (`createMatrix4()`). It now uses `acquireMatrix4()`/`releaseMatrix4()` from the geometry pool so the hot path is alloc-free.

### Bronze: Consistency cleanups

- `getNodeWorldTransformRevision` param aligned to `Readonly<Node<Traits>>` (was mutable `Node<Traits>`, inconsistent with all sibling revision getters)
- Two loose `==` comparisons in `hierarchy.ts` (`getNodeChildIndex`, `swapNodeChildren`) replaced with strict `===`

### Silver: Hierarchy additions (`hierarchy.ts`)

- `addNodeChildren(target, ...children)` — batch add; signals emitted per child
- `forEachNodeChild(source, callback)` — index-ordered child iterator with early-out (`false` return stops walk)
- `getNodeAncestors(source)` — read-only snapshot of the parent chain toward root; empty array for root
- `getNodeCommonAncestor(a, b)` — lowest common ancestor; returns the node itself if they are the same, returns null if no common ancestor
- `isNodeAncestorOf(ancestor, descendant)` — true if `ancestor` equals `descendant` or is above it
- `reparentNode(child, newParent)` — moves child to a new parent without world-transform preservation (documented)
- `replaceNodeChild(target, oldChild, newChild)` — swaps one child for another at the same index; no-op if oldChild not found

## Deferred Items and Why

### `reparentNode` with world-transform preservation

The roadmap specifies `reparentNode(child, newParent, keepWorldTransform)` — when `keepWorldTransform=true`, the local TRS fields must be recomputed so the world position is unchanged. This requires decomposing a 2D matrix (inverse(newParent.world) × child.world → extract x/y/rotation/scaleX/scaleY). No `decomposeMatrix` function exists in `@flighthq/geometry` yet. **Design decision to surface**: should `decomposeMatrix` live in `@flighthq/geometry` (it is pure math), or should the decomposition live inline in `transform2d.ts`? Adding it to geometry would benefit all callers. This is a cross-package concern and was not resolved autonomously.

### World-transform decomposition accessors (`getNodeWorldPosition`, `getNodeWorldScale`, `getNodeWorldRotation`, `setNodeWorldTransformMatrix`)

Same blocker as `reparentNode` with keepWorldTransform — requires matrix decomposition in `@flighthq/geometry`.

### Skew decision for `HasTransform2D`

The depth review noted that `HasTransform2D` has `x,y,rotation,scaleX,scaleY,pivot` but no `skewX`/`skewY`. OpenFL and most 2D engines expose skew. Silver roadmap says to either add it or mark it missing-by-design. This modifies the `HasTransform2D` type in `@flighthq/types`, touches `ensureNodeLocalTransformMatrix` in `transform2d.ts`, and changes the decomposition logic. **Design decision to surface to user**: add skew or mark intentional omission?

### 3D TRS parity (Silver)

The Silver roadmap calls for a cached, lazy 3D local-matrix built from TRS components (position/quaternion-or-euler/scale) analogous to the 2D path. Currently `HasTransform3D` stores only a raw `localMatrix` with no TRS fields. Adding TRS components requires changing `HasTransform3D` in `@flighthq/types`, adding `initTransform3DTrait` initializers, and updating `ensureNodeWorldTransformMatrix4`. **Design decision to surface**: should 3D rotation use quaternion or Euler angles (or both)? This changes the public type surface. Also: 3D bounds (`getNodeLocalBoundsBox`/`getNodeWorldBoundsBox`) may belong in `@flighthq/scene` not here — mark the boundary explicitly before building.

### 3D cached inverse for `convertNodeVector3GlobalToLocal`

The alloc fix (Bronze, done) prevents fresh allocation per call, but there is no slot caching the inverted world matrix between calls. Adding a cached inverse slot on `HasTransform3DRuntime` would make the 3D path as efficient as the 2D world-transform path. Deferred as a Silver/performance item since it requires a types change.

### Gold: spatial query layer (`pickNodeAtPoint`, `queryNodesInRectangle`)

Overlaps `@flighthq/interaction`'s domain. The depth review and maturation roadmap both flag this — `@flighthq/interaction` already owns hit testing. Agree the seam with its owner before proceeding.

### Gold: scene serialization (`serializeNodeGraph`/`deserializeNodeGraph`)

Cross-cutting; requires the versioned-migration model from `types-layout.md` and per-kind data delegation from each owning package. Flagged as a multi-session, multi-package design effort.

### Gold: batch/deferred invalidation (`beginNodeBatch`/`endNodeBatch`)

Performance work — bulk hierarchy edits that settle bounds/transform once. Should be measured with benchmarks (deep-tree world-transform propagation) before adding API surface.

### Gold: full signal coverage (transform/bounds/enabled change signals)

`onTransformChanged`, `onWorldTransformChanged`, `onBoundsChanged`, `onEnabledChanged`, `onNodeDisposed` behind `enableNodeSignals`. The revision system already has the channels; this is wiring them to signal emission.

### Gold: Rust `flighthq-node` crate

Does not exist yet. The slotmap-arena foundation from `rust/index.md` is required first. A large separate workstream.

### `walkNode` coordination with `@flighthq/render`

The depth review and Bronze roadmap both flag that `render`'s `walkNode` and the new `walkNodeDescendants` are parallel. The render's `walkNode` is render-aware (dirty checks, frame IDs, render proxies) and intentionally more than a base-graph traversal. Decision: `walkNodeDescendants` is a pure graph traversal at the node tier; render's `walkNode` stays in `@flighthq/render` as the render-prepare walk. They serve different purposes and should stay separate. This decision should be confirmed with the `@flighthq/render` owner but is unlikely to cause duplication confusion given the distinct signatures and purpose.

## Concerns and Surprises

- The `removeNodeChildren` function has an off-by-one in its bounds check: it uses `endIndex > children.length` (strict greater) but also allows `endIndex = children.length - 1` as the default. For 0 children `beginIndex > children.length - 1` is `0 > -1` which is true, so it exits early correctly. The logic is correct but subtle.
- The `disposeNode` implementation fires `onChildrenChanged` and `onChildRemoved` on the parent during child teardown (because `removeNodeChild` is called). This is intentional — the parent's observer legitimately wants to know its children are gone. Documented in the implementation.
- `getNodeCommonAncestor` uses a `Set` for the ancestor lookup (O(depth(a)) space, O(depth(b)) time). For very deep trees a two-pointer approach (advance the deeper node first) would be O(1) space, but the Set approach is clearer and deep trees are unusual.

## Suggestions for Future Sessions

1. **Add `decomposeMatrix` to `@flighthq/geometry`** — enables `reparentNode(keepWorldTransform)`, world decomposition accessors, and decomposition tests. Straightforward 2×2 matrix math (atan2 for rotation, hypot for scale, remainder for residual).
2. **Skew decision** — consult the project owner on whether `HasTransform2D.skewX`/`skewY` should be added for OpenFL parity or marked as a deliberate omission with a doc comment.
3. **3D TRS decision** — settle quaternion vs Euler for `HasTransform3D` and build the cached local-matrix composition analogous to the 2D path.
4. **Signal coverage** — add the transform/bounds/enabled-change signals to `enableNodeSignals`. The revision channels are already there; it is just wiring.
5. **`disposeNode` in higher packages** — render packages (`render-canvas`, `render-webgl`, `render-dom`) that hold GPU resources per node should expose their own `destroy*` functions that call `disposeNode` first and then release GPU resources. Coordinate this pattern with those packages.

## 2026-06-25 — builder Phase 1 (pruned-core port)

Applied the staged `_port/node` additive superset. New/expanded files: **traversal** (new — `findNode`/`findNodeByName`, `getNodeChildren`, `getNodeDepth`, `getNodeNextSibling`/ `getNodePreviousSibling`, `forEachNodeAncestor`/`forEachNodeDescendant`, `walkNodeDescendants`), **disposeNode** (added to `node.ts` — detaches, recursively disposes children, clears nodeSignals), and hierarchy helpers (`addNodeChildren`, `forEachNodeChild`, `getNodeAncestors`, `getNodeCommonAncestor`, `isNodeAncestorOf`, `reparentNode`, `replaceNodeChild`). Ride-alongs kept: `===` identity in `hierarchy.ts`, `Readonly<>` on `getNodeWorldTransformRevision`. Added type `NodeDescendantVisitor` to `@flighthq/types`.

**Fix-forward:** `disposeNode` was staged calling a non-existent `disconnectAllSlots`; the real signals API is `clearSignal`. Substituted. The three dropped trait files (`hasCacheAsBitmap`/`hasOpaqueBackground`/`hasScrollRect`) were correctly NOT re-added — the `_port` index still listed them, so the index was merged surgically (only `traversal` added). 280 node tests pass; `npm run check` green.
