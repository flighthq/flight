---
package: '@flighthq/node'
status: solid
score: 89
updated: 2026-07-13
ingested:
  - charter.md
  - status.md
  - review.md (prior, 2026-06-24)
  - assessment.md (prior, 2026-07-02)
  - source (packages/node/src, all 15 files + 14 colocated tests, 321 tests)
  - git log since 2026-06-24 (9 commits touching packages/node)
---

# node — Review

> Rereview against the live worktree. Supersedes the 2026-06-24 bundle review; the 2026-07-01 direction session and the commits through `23fcf86c` (2026-07-12) are now in evidence.

## Verdict

**solid — 89/100.** The 2D scene-graph tier is effectively finished against its charter: every 2026-07-01 Decision has landed in source — `skewX`/`skewY` on `HasTransform2D` (Decision #5, `c5262d4c`), the world-transform-preserving `reparentNode` with inline decomposition (Decision #7, `e86c2d01`), and the three DisplayObject traits (`hasCacheAsBitmap`/`hasOpaqueBackground`/`hasScrollRect`) removed per the trait-boundary ruling (Decision #1). New since the prior review: a **content revision channel** (`localContentId` + `invalidateNodeLocalContent`/`getNodeLocalContentRevision`) and the cross-package `invalidateContent` consolidation that collapsed per-package `invalidate<Subject>` functions into one node-tier call (`23fcf86c`). It stops short of authoritative because the charter-blessed 3D bounds tier (Decision #3) is still unbuilt, the 3D path lacks a cached world-inverse, and a handful of naming/consistency nits remain — including one new export that breaks the package's own naming rule.

## Present capabilities

- **Hierarchy** (`hierarchy.ts`) — complete child API (`addNodeChild`/`At`/`Children`, `removeNodeChild`/`At`/`Children`, `getNodeChildAt`/`ByName`/`Count`/`Index`, `getNodeParent`/`Root`, `containsNodeChild`, `setNodeChildIndex`, `swapNodeChildren`/`At`, `replaceNodeChild`, `forEachNodeChild`, `getNodeAncestors`, `getNodeCommonAncestor`, `isNodeAncestorOf`) with per-signal emission and `canAddChild` gating. `reparentNode` now genuinely preserves world TRS: pooled-matrix `inverse(newParent.world) × child.world`, sqrt/atan2 decomposition, skew-aware (subtracts `skewY` from the rotation extraction, preserves existing skew fields), pivot-corrected, `try/finally`-balanced `acquireMatrix`/`releaseMatrix`.
- **Traversal** (`traversal.ts`) — `findNode`/`findNodeByName`, `forEachNodeAncestor`/`forEachNodeDescendant`, `getNodeChildren` (copy; shared `_emptyChildren` sentinel), `getNodeDepth`, `getNodeNextSibling`/`getNodePreviousSibling`, `walkNodeDescendants` (early-out visitor, completed boolean). The two-style inconsistency the prior review flagged was unified (2026-06-25 sweep).
- **Transform 2D** (`transform2d.ts`) — lazy, revision-gated local/world matrices with pivot, ±180 rotation normalization, cached sin/cos, a skew-free fast path (`skewX === 0 && skewY === 0`) and the skewed composition otherwise; `convertNodeVector2GlobalToLocal`/`LocalToGlobal` out-param converters.
- **Transform 3D** (`transform3d.ts`) — raw `localMatrix: Matrix4` composition (blessed, Decision #2), `ensureNodeWorldTransformMatrix4`/`getNodeWorldTransformMatrix4`, alloc-free `convertNodeVector3*` via the Matrix4 pool bracket.
- **Bounds** (`boundsRectangle.ts`) — local/parent/world tiers, `computeNodeBoundsRectangle` with arbitrary target space + fast paths, offset-only world-bounds fast recompute, disabled-children exclusion, scale-derived `getNodeWidth`/`Height` + setters.
- **Revision** (`revision.ts`) — now **eight** exported invalidators over the seven dirty channels: per-channel primitives (`invalidateNodeAppearance`/`LocalBounds`/`LocalContent`/`LocalTransform`/`ParentReference`/`WorldBounds`), the composites `invalidateNodeRender` (appearance+transform), `invalidateContent` (content+localBounds — the direct-mutation companion for any node kind), and the everything `invalidateNode`; matching `get*Revision` readers including the new `getNodeLocalContentRevision`.
- **Lifecycle, signals, traits, viewport** — `createNode`/`createNodeRuntime`/`disposeNode` (recursive, signal-clearing, `destroyNode` absence justified in source), `enableNodeSignals`/`getNodeSignals`/`setNodeEnabled`; opt-in trait initializers `initAppearanceTrait`, `initClipTrait`, `initMaterialTrait`, `initBoundsRectangleTrait`(+Runtime), `initTransform2DTrait`(+Runtime, now with skew defaults), `initTransform3DTrait`(+Runtime); `createViewport` + scale-mode/align transform helpers.
- **Manifest** — `sideEffects: false`, single `.` export, deps `entity`/`geometry`/`signals`/`types` only, no top-level side effects, no `switch(kind)` anywhere. 321 tests across 14 colocated files, describes alphabetized and mirroring exports (including aliased out-param cases and skew/reparent round-trips).

## Gaps

Vs a textbook retained-mode scene-graph base (2D/3D node library tier):

- **3D bounds tier is blessed but unbuilt.** Charter Decision #3 rules `getNodeLocalBoundsBox`/`getNodeWorldBoundsBox` (AABB) node-level; nothing exists. This is the largest charter-promised capability missing.
- **No cached inverse-world `Matrix4`** — `convertNodeVector3GlobalToLocal` is alloc-free but re-inverts every call; a `HasTransform3DRuntime` slot would match the 2D path's caching discipline.
- **No world-decomposition accessors** (`getNodeWorldPosition`/`Scale`/`Rotation`, `setNodeWorldTransformMatrix`) — `reparentNode` proved the inline-decomposition pattern; the accessor set has not followed.
- **Recursive traversal/dispose only.** `findNode`, `forEachNodeDescendant`, `walkNodeDescendants`, and `disposeNode` all recurse (stack depth = tree depth); no iterative variants, no BFS/post-order order options, and no subtree-prune visitor result (visit children vs skip-subtree-continue-siblings, à la DOM TreeWalker) — the one traversal affordance mature graph libraries have that this file lacks.
- **No child-sort/ordering conveniences** — `sortNodeChildren(target, comparator)` (z-sort) and front/back move helpers are standard container ops absent here (composable from `setNodeChildIndex`, but the batch sort emits O(n) reorder signals if hand-rolled).
- **No batch/deferred invalidation** (`beginNodeBatch`/`endNodeBatch`) — charter Open direction #2, gated on benchmarks.
- **No spatial query layer** — charter Open direction #1; home unsettled (`interaction` overlap).
- **No Rust `flighthq-node` crate** — Open direction #3; gated on the slotmap-arena foundation.

## Charter contradictions

**None.** All seven 2026-07-01 Decisions check out in source: the trait set matches Decision #1 exactly (the three DisplayObject trait files are gone), 3D is raw-matrix per Decision #2, signals are hierarchy-only per Decision #4, skew per Decision #5, no serialization functions per Decision #6, and `reparentNode`/`addNodeChild` split per Decision #7. Decision #3 (3D bounds node-level) is unfulfilled but not contradicted — the code simply hasn't been built.

## Contract & docs fit

**Lives up to the contract well:** types-first (`skewX`/`skewY`, `localContentId`, `NodeDescendantVisitor` all defined in `@flighthq/types`), `ensure*`/`compute*`/`get*` split clean, pool brackets balanced (`reparentNode` even uses `try/finally`), sentinels for misses with misuse-only throws, `Readonly<>` throughout, single root export, tests mirror exports.

**Findings, package side:**

- **`invalidateContent` breaks the full-type-name rule.** Every sibling is `invalidateNode*`; this one drops `Node` from the name despite taking `target: Node<Traits>` ("exported function names include the full, unabbreviated name of the type they operate on"). It landed via a deliberate user commit (`23fcf86c`, "one invalidateContent(node)"), so this may be an intentional vocabulary choice for the cross-package mutation contract — but as written it is the package's one naming outlier. Rename to `invalidateNodeContent` or record the exception.
- **Self-import by package name** — `transform2d.ts:9` imports `computeNodeWorldTransformRevision` from `'@flighthq/node'` while `transform3d.ts` imports the same function from `'./revision'`. A package importing itself through its own published name is a circular package reference; should be the relative import.
- **Stale doc comment** — `invalidateNodeLocalTransform` still enumerates "(x, y, rotation, scaleX, scaleY)"; the transform now includes `skewX`/`skewY`/pivot.
- **`hasTransform3d.ts` re-exports its types** (`export type { HasTransform3D, HasTransform3DRuntime }`) — no other trait file does; drop or standardize.
- **Early-out callback asymmetry** — `forEachNodeAncestor` requires `=> boolean` while `forEachNodeChild` accepts `=> boolean | void`; one convention should win.
- **`computeViewportRenderTransform`** carries two `eslint-disable no-explicit-any` casts — the one typed-hole spot in the package.

**Findings, docs side (candidate revisions, user's gate):**

- The Package Map line — "`@flighthq/node` (graph hierarchy, transforms, bounds, appearance)" — still omits the traversal surface, lifecycle (`disposeNode`), the revision system (arguably the package's headline feature), and the viewport helpers. Prior review flagged this; still stale.
- The charter's revision-channel prose ("seven-channel") predates the `localContentId` channel — the count still works out to seven if worldTransform is counted as derived, but the charter nowhere names the content channel; the What-it-is should mention content invalidation now that shape/text/displayobject build on it.
- `NodeRuntime` now carries the adjustments-tier slots (`colorAdjustments`, `resolvedColorTransform`, `colorAdjustmentsChannelMixing` — commit `df810bf5`, well-commented in `types/src/Node.ts`). The codebase-map rule says `NodeRuntime` "should stay empty until a subsystem truly applies to every node kind"; placing a color-adjustment stack on the base runtime rather than a narrower tier is a deliberate cross-package choice that the node charter does not record. Worth a one-line ratification either way.

## Candidate open directions

1. **Traversal order/prune options** — iterative and/or BFS/post-order variants, and a skip-subtree visitor result. Does the charter want traversal breadth here, or is pre-order-with-early-out the deliberate floor?
2. **`invalidateContent` naming** — ratify the exception or rename; it defines the cross-package mutation vocabulary, so the call is direction, not sweep.
3. **Adjustments slots on base `NodeRuntime`** — ratify the placement (vs a narrower runtime tier) in the charter's Decisions, since it touches the node/types surface this package owns.
4. **Child sorting** — is `sortNodeChildren` in scope as a hierarchy convenience, or left to callers?
