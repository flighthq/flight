---
package: '@flighthq/node'
status: solid
score: 87
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/node.md
  - source
  - changes.patch
---

# node — Review

> Evidence: incoming bundle `builder-67dc46d64` (`head/packages/node/` + `changes.patch`). References below are `67dc46d64:<path>`.

## Verdict

**solid — 87/100.** The base scene-graph tier is now close to authoritative on the 2D side. This bundle closed the single largest gap the prior depth review named — first-class traversal — with a clean, well-tested `traversal.ts`, and added the missing `disposeNode` teardown verb, hierarchy convenience operations, and the 3D alloc fix. The status doc's claimed work is real and verified against the diff. It stops short of authoritative because (a) the 3D side remains a thin shell next to 2D (raw `localMatrix`, no TRS, no 3D bounds), (b) several genuinely-deferred items are blocked on a cross-package `decomposeMatrix`, and (c) the bundle silently added three OpenFL DisplayObject traits to this tier that the status report never mentions and that raise a real boundary question.

## What the bundle changed (verified against `changes.patch`)

Every status-claimed item checks out in source:

- **New `traversal.ts`** (`67dc46d64:packages/node/src/traversal.ts`) — `findNode`, `findNodeByName`, `forEachNodeAncestor`, `forEachNodeDescendant`, `getNodeChildren` (read-only copy, shared `_emptyChildren` sentinel for leaves), `getNodeDepth`, `getNodeNextSibling`, `getNodePreviousSibling`, `walkNodeDescendants` (early-out visitor returning a completed/cut-short boolean). All eight present; `NodeDescendantVisitor<Traits>` is correctly homed in `@flighthq/types` (`NodeDescendantVisitor.ts`), not inlined. 233-line colocated test, describe blocks alphabetized and mirroring exports.
- **`disposeNode`** (`node.ts:93`) — detaches from parent, recursively disposes children bottom-up over a snapshot, disconnects all five `nodeSignals` slots, clears `interactionSignals`. The doc comment correctly justifies the absence of `destroyNode` (no non-GC resources at this tier) and points higher packages at the dispose-then-release pattern. This satisfies the codebase teardown contract precisely.
- **Hierarchy additions** (`hierarchy.ts`) — `addNodeChildren`, `forEachNodeChild` (index-ordered, early-out on `false`), `getNodeAncestors`, `getNodeCommonAncestor` (LCA via ancestor `Set`), `isNodeAncestorOf`, `reparentNode` (world-transform _not_ preserved, documented), `replaceNodeChild` (no-op when `oldChild` absent).
- **3D alloc fix** (`transform3d.ts:21`) — `convertNodeVector3GlobalToLocal` now brackets `acquireMatrix4()`/`releaseMatrix4()` instead of `createMatrix4()` per call. The hot path is alloc-free and the bracket is balanced.
- **Consistency cleanups** — `getNodeWorldTransformRevision` param now `Readonly<Node<Traits>>` (`revision.ts` diff confirms the one-line signature change), aligning it with sibling revision getters.

## Undocumented in the status report (found in the diff)

Three brand-new trait files were added in this bundle that the worker status report does **not** mention anywhere — they are not in the Implemented, Deferred, or Concerns sections:

- `hasCacheAsBitmap.ts` → `initCacheAsBitmapTrait` (over `HasCacheAsBitmap`: `cacheAsBitmap`, `cacheAsBitmapMatrix`)
- `hasOpaqueBackground.ts` → `initOpaqueBackgroundTrait` (over `HasOpaqueBackground`: `opaqueBackground`)
- `hasScrollRect.ts` → `initScrollRectTrait` (over `HasScrollRect`: `scrollRect`)

All three are confirmed `new file mode 100644` against `base/`, all three have colocated tests, and all three types are properly homed in `@flighthq/types` (`HasCacheAsBitmap.ts`, `HasOpaqueBackground.ts`, `HasScrollRect.ts`) with good doc comments. The code is clean. The concern is twofold: (1) the status report is an **incomplete** account of the delta — a reviewer trusting it would miss a real public-API expansion; and (2) `cacheAsBitmap`, `opaqueBackground`, and `scrollRect` are canonical OpenFL _DisplayObject_ properties, and placing their trait initializers at the base `node` tier is a boundary decision (source-data vs. graph-participation, structural-fork A) that was made silently rather than surfaced. They follow the established `init*Trait` pattern faithfully, so this is not a code defect — it is an unflagged scope/home choice that deserves an explicit ruling.

## Present capabilities (full picture)

Carried forward from the depth review and re-confirmed in this bundle:

- **Hierarchy** — the complete OpenFL-faithful child API (`addNodeChild`/`At`, `removeNodeChild`/ `At`/`Children`, `getNodeChildAt`/`ByName`/`Count`/`Index`, `getNodeParent`/`Root`, `containsNodeChild`, `setNodeChildIndex`, `swapNodeChildren`/`At`) plus this bundle's convenience additions, with signal emission and `canAddChild` gating.
- **Transform 2D** (`transform2d.ts`) — lazy, cached, revision-gated local/world matrices with pivot, ±180 rotation normalization, cached sin/cos, and `convertNodeVector2*` conversions.
- **Transform 3D** (`transform3d.ts`) — `ensureNodeWorldTransformMatrix4`, Matrix4 world composition, `convertNodeVector3*` (now alloc-free).
- **Bounds** (`boundsRectangle.ts`) — three coordinate tiers, `computeNodeBoundsRectangle` with arbitrary target space, scale-derived sizing, offset-only fast recompute.
- **Revision/invalidation** (`revision.ts`) — seven distinct dirty channels; the strongest part of the package, more granular than most engines expose.
- **Lifecycle & traits** — `createNode`/`createNodeRuntime`/`getNodeRuntime`/`setNodeEnabled`, opt-in signals via `enableNodeSignals`, and the opt-in trait initializers (`hasAppearance`, `hasClip`, `hasMaterial`, `hasBoundsRectangle`, `hasTransform2d`, `hasTransform3d`, and the three new traits).
- **Viewport** — `createViewport` + scale-mode/align transform helpers.

`package.json` is correct: `"sideEffects": false`, a single `"."` export (no subpaths), and a clean dependency set (`entity`, `geometry`, `signals`, `types`). No top-level side effects. No closed `switch(kind)` anywhere — no registry-vs-union fork applies here.

## Gaps vs an authoritative scene-graph base

The traversal and dispose gaps are now **closed**. What remains:

- **3D is still a thin shell next to 2D.** `HasTransform3D` stores a raw `localMatrix: Matrix4` only (confirmed in `types/src/HasTransform3D.ts`) — no cached/lazy local-matrix build from TRS components, no 3D bounds tier, no 3D parent-bounds. The 3D path also still lacks a cached inverse slot for `convertNodeVector3GlobalToLocal` (the alloc fix prevents per-call allocation but re-inverts every call). The 2D/3D asymmetry the depth review flagged persists.
- **Reparent does not preserve world transform.** `reparentNode(child, newParent)` is a documented pass-through to `addNodeChild`; the standard `keepWorldTransform` affordance is absent, blocked on a missing `decomposeMatrix` in `@flighthq/geometry`.
- **No world-transform decomposition accessors** — `getNodeWorldPosition`/`Scale`/`Rotation`, `setNodeWorldTransformMatrix`. Same `decomposeMatrix` blocker.
- **No skew in `HasTransform2D`** — still `x,y,rotation,scaleX,scaleY,pivot` only. OpenFL/Flash `Matrix` and most 2D engines expose it; absence remains unmarked-by-design.
- **No change signals beyond hierarchy.** `enableNodeSignals` covers child/parent mutation only; the revision channels for transform/bounds/enabled exist but are not wired to `onTransformChanged`/`onBoundsChanged`/`onEnabledChanged`/`onNodeDisposed` emission.
- **No batch/deferred invalidation** (`beginNodeBatch`/`endNodeBatch`) for bulk edits.
- **No Rust `flighthq-node` crate yet** — the charter declares `crate: flighthq-node`, but the slotmap-arena foundation does not exist; the conformance mirror is unbuilt.

## Charter contradictions

**None to report** — and that is itself a finding: the charter's only authored section is _What it is_; North star, Boundaries, Decisions, and Open directions are all `TODO`. There is no stated principle, boundary, or ruling for the code to contradict. Judged against the codebase-map AAA fallback instead, the package is in good standing. (The unmarked DisplayObject-trait placement would be a _Boundaries_ contradiction if the charter had drawn the source-data/graph-participation line — it has not, which is why this lands as a candidate open direction rather than a violation.)

## Contract & docs fit

**Lives up to the contract well:**

- Names are fully self-identifying (every export carries the `Node` type word); `get`/`has`/`is` prefixes respected; the `ensure*` (recompute-if-dirty) / `compute*` (write-to-out) / `get*` (cached read) three-way split is clean.
- Types-first: `NodeDescendantVisitor` and the three new `Has*` traits are defined in `@flighthq/types` before being implemented against here.
- `dispose*` used correctly, with the `destroy*` absence justified in source.
- Pool bracket (`acquireMatrix4`/`releaseMatrix4`) balanced; `Readonly<>` applied to the corrected revision getter and throughout the new traversal signatures.
- Sentinels (`null`, `-1`, empty array) used for expected misses; the few `throw`s in `hierarchy.ts` (`addNodeChildAt` self-add / bounds, `throwOutOfBoundsError`) are misuse-only, matching the rule.
- Single root export, `sideEffects: false`. Tests colocated, alphabetized, mirroring exports.

**Minor in-source nits (carried from depth review or new this bundle):**

- `walkNodeDescendants` (`traversal.ts:133`) re-fetches `getNodeRuntime(source).children!` _inside_ the loop each iteration and drives iteration off `getNodeChildCount`, while its sibling `forEachNodeDescendant` hoists `children` once and iterates directly. Two traversal styles in one file for the same job — harmless, but an inconsistency a disciplined file would unify (hoist the children array once).
- `getNodeCommonAncestor` uses a `Set` (O(depth a) space); a two-pointer LCA is O(1) space. Clear over optimal; fine for typical depths, noted in status.

**Candidate doc revisions (user's gate, not mine):**

- The Package Map line `@flighthq/node: graph hierarchy, transforms, bounds, appearance, and invalidation` no longer enumerates the now-substantial **traversal** surface, the **lifecycle** (`disposeNode`) surface, the **viewport** transform helpers, or the **clip/material/cacheAsBitmap/ opaqueBackground/scrollRect** traits the tier now hosts. If those traits stay here, the map line and the charter's _What it is_ should name them; if they belong in `displayobject`, that is the ruling to record.
- The charter is a stub (four `TODO` sections). The whole _North star / Boundaries / Decisions_ set is unwritten — every assumption below is a consequence of that silence.

## Candidate open directions (feeds the charter)

These are questions the stub charter does not answer that this review had to assume:

1. **Where is the source-data / graph-participation line (fork A)?** Do OpenFL DisplayObject properties — `cacheAsBitmap`, `opaqueBackground`, `scrollRect`, and the pre-existing `appearance`/ `clip`/`material` — belong at the base `node` tier as opt-in traits, or in `@flighthq/displayobject`? This bundle answered "node" silently for three of them; the charter should ratify or reverse it.
2. **`decomposeMatrix` home.** `reparentNode(keepWorldTransform)` and the world-decomposition accessors are all blocked on 2×2 matrix decomposition. Does it live in `@flighthq/geometry` (pure math, benefits all callers) or inline in `transform2d.ts`? Cross-package; surfaced, not decided.
3. **Skew: add or mark-omitted.** Settle `HasTransform2D.skewX`/`skewY` for OpenFL parity, or record a deliberate-omission decision with a doc comment.
4. **3D rotation representation.** Bringing 3D to 2D parity (cached lazy local matrix from TRS) needs a quaternion-vs-Euler choice; it changes the public `HasTransform3D` surface. Also: do 3D bounds (`getNodeLocalBoundsBox`/`WorldBoundsBox`) belong here or in `@flighthq/scene`? Mark the boundary before building.
5. **Signal coverage scope.** Should `enableNodeSignals` grow transform/bounds/enabled/disposed change signals (the revision channels already exist), or is hierarchy-only the intended surface?
6. **Spatial query layer (`pickNodeAtPoint`, `queryNodesInRectangle`).** Overlaps `@flighthq/interaction`'s hit-testing domain — agree the seam with that owner before building, or declare it out of scope for `node`.
7. **Scene serialization (`serializeNodeGraph`/`deserializeNodeGraph`).** Cross-cutting, needs the versioned-migration model and per-kind data delegation; a multi-package effort to scope, not a node-local task.
