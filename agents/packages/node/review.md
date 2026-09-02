---
package: '@flighthq/node'
status: solid
score: 91
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - review.md (prior, 2026-08-25)
  - assessment.md (2026-08-04)
  - source (packages/node/src, all 21 files + 19 colocated tests, 494 tests)
  - types surface (packages/types/src: Node.ts, HasTransform2D.ts, HasTransform3D.ts, HierarchyNode.ts, HasAppearance.ts, HasBoundsRectangle.ts, HasBlendMode.ts, HasClip.ts, HasMaterial.ts, NodeSignals.ts, ColorAdjustmentRuntime.ts, NodeOrderList.ts, NodeDescendantVisitor.ts)
  - git log since 2026-08-25 (4 commits touching packages/node)
---

# node -- Review

Evidence source: live worktree (`packages/node/src/`). Rereview superseding the 2026-08-25 revision (solid, 91/100). Four commits since the prior review: `8bc1ab323` (preserve traits through hierarchy), `30fbbb659` (test infrastructure), and two version bumps (0.4.0, 0.5.0). Five of the six prior-review code-side findings are now resolved in source.

## Verdict

**solid -- 91/100.** The 2D scene-graph tier is mature against its charter: all seven 2026-07-01 Decisions are implemented in source, the test suite is thorough (494 tests across 19 colocated files), and the five code-level nits from the prior review are resolved. Since the prior review, `8bc1ab323` landed a meaningful correctness fix: hierarchy operations now properly preserve the `Traits` type parameter through parent/child storage via `NodeOf<Traits>` casts, closing a type-narrowing gap that previously lost trait information when nodes traversed the graph. A diagnostics layer exists (`enableNodeGuards`) covering `reparentNode`, though it remains minimal. The package stops short of authoritative because the charter-blessed 3D bounds tier (Decision #3) remains unbuilt, the `invalidateContent` naming exception is still unresolved, the `adjustments`/`materials` dependency weight sits on the base graph spine, and the diagnostics layer covers only one guard out of several needed.

## Present capabilities

- **Hierarchy** (`hierarchy.ts`, 505 lines, 117 tests) -- complete child API: `addNodeChild`/`At`/`Children`, `removeNodeChild`/`At`/`Children`, `getNodeChildAt`/`ByName`/`Count`/`Index`, `getNodeParent`/`Root`, `containsNodeChild`, `setNodeChildIndex`, `swapNodeChildren`/`At`, `replaceNodeChild`, `forEachNodeChild`, `getNodeAncestors`, `getNodeCommonAncestor`, `isNodeAncestorOf`. `reparentNode` preserves world TRS with inline matrix decomposition, pivot preservation, skew-awareness, `try/finally`-balanced pool brackets, and a guard seam (`setReparentNodeGuard`) that `enableNodeGuards` installs. Since 2026-08-31, children and parents are stored as `NodeOf<Traits>`, preserving the trait type parameter through the hierarchy.

- **Traversal** (`traversal.ts`, 37 tests) -- `findNode`/`findNodeByName` (depth-first, type-guard-narrowing overload), `forEachNodeAncestor`/`forEachNodeDescendant`, `getNodeChildren` (snapshot copy, shared `_emptyChildren` sentinel), `getNodeDepth`, `getNodeNextSibling`/`getNodePreviousSibling`, `walkNodeDescendants` (early-out visitor with completion boolean). All callbacks accept `boolean | void` return.

- **Transform 2D** (`nodeTransform2d.ts`, 36 tests) -- lazy, revision-gated local/world matrices with pivot, +/-180 rotation normalization, cached sin/cos, skew-free fast path (`skewX === 0 && skewY === 0`), skewed composition otherwise. `convertNodeVector2GlobalToLocal`/`LocalToGlobal` via out-param. `setNodeLocalMatrix` decomposes and invalidates. `setNodeTransform2D`/`getNodeTransform2D` for bulk TRS read/write including all nine fields (x, y, rotation, scaleX, scaleY, skewX, skewY, pivotX, pivotY).

- **Transform 3D** (`nodeTransform3d.ts`, 28 tests) -- position/quaternion/scale TRS with a cached local `Matrix4` composed via `composeMatrix4`. Direct matrix authoring via `setNodeLocalMatrix4` (marks detached; TRS fields go dormant). `syncNodeTransform3DFromMatrix4` decomposes back. `ensureNodeWorldMatrix4`/`getNodeWorldMatrix4` with recursive parent ensure. `convertNodeVector3GlobalToLocal`/`LocalToGlobal` via pool bracket. `isNodeLocalMatrix4Detached` diagnostic.

- **Bounds** (`boundsRectangle.ts`, 65 tests) -- local/parent/world tiers. `computeNodeBoundsRectangle` with arbitrary target space and two fast paths (self, parent). `computeNodeRootLocalBoundsRectangle` for offscreen capture. Offset-only world-bounds fast recompute when rotation/scale unchanged. `getNodeWidth`/`Height` + `setNodeWidth`/`Height` with singular-axis guard. Disabled-children exclusion in world bounds.

- **Revision** (`revision.ts`, 28 tests) -- eight exported invalidators over seven dirty channels: `invalidateNodeAppearance`/`LocalBounds`/`LocalContent`/`LocalTransform`/`ParentReference`/`WorldBounds`, composites `invalidateNodeRender` (appearance+transform) and `invalidateContent` (content+localBounds), and the everything `invalidateNode`. Matching `get*Revision` readers. World-transform revision uses a monotonic counter shared across all nodes, with 0-sentinel and wrap guard.

- **Color adjustments** (`nodeColorAdjustment.ts`, 6 tests) -- `addNodeColorAdjustment`, `getNodeColorAdjustments`, `setNodeColorAdjustments`, `setNodeColorAdjustmentsTint`. Resolves authored adjustment stacks into fused `ColorScaleBias` and optional 4x5 color matrix, with channel-mixing detection. Pulls `@flighthq/adjustments` and `@flighthq/materials`.

- **Order list** (`nodeOrderList.ts`, 52 tests) -- `createNodeOrderList`/`disposeNodeOrderList`/`clearNodeOrderList`, `addNodeOrderListEntry` (O(1) bulk-fill), `setNodeOrderListEntry` (re-key with scan), `removeNodeOrderListEntry`, `applyNodeOrderList` (reorders target's children in sort-key order without touching non-members), `setNodeOrderListEntryAbove`/`Below`, `setNodeOrderListFromNodeChildren`, `swapNodeOrderListEntries`, `forEachNodeOrderListEntry`, `getNodeOrderListEntrySortKey`, `hasNodeOrderListEntry`. Scratch data structures reused across frames.

- **Scene2D fit** (`stageFit.ts`, 43 tests) -- `computeScene2DFitTransform` maps content into a view via scaleMode (noscale/exactfit/showall/noborder) and align, reading bounds through a structural `Scene2DFitContext`. Helper functions `computeScene2DFitScale`/`FillScale`/`AlignX`/`AlignY`.

- **Diagnostics** (`enableNodeGuards.ts`, 2 tests) -- `enableNodeGuards()`/`disableNodeGuards()`/`areNodeGuardsEnabled()`. Installs a guard for `reparentNode`'s singular-parent decline via `logOnce` from `@flighthq/log`.

- **Lifecycle, signals, traits, viewport** -- `createNode`/`createNodeRuntime`/`disposeNode` (recursive, signal-clearing, comment-justified absence of `destroyNode`), `enableNodeSignals`/`getNodeSignals`/`setNodeEnabled`; opt-in trait initializers `initAppearanceTrait`(+Runtime), `initBlendModeTrait`, `initClipTrait`, `initMaterialTrait`, `initBoundsRectangleTrait`(+Runtime), `initTransform2DTrait`(+Runtime), `initTransform3DTrait`(+Runtime); `createViewport`/`getViewportAspect`.

- **Manifest** -- `sideEffects: false`, two-lane exports (`.` + `./contract`), deps: `adjustments`, `entity`, `geometry`, `log`, `materials`, `math`, `signals`, `types`. All intra-SDK imports use `/contract`. No top-level side effects, no `switch(kind)` anywhere. 494 tests across 19 colocated files.

## Gaps

Vs a textbook retained-mode scene-graph base (2D/3D node library tier):

- **3D bounds tier is blessed but unbuilt.** Charter Decision #3 rules `getNodeLocalBoundsBox`/`getNodeWorldBoundsBox` (AABB) node-level; no code exists. This is the largest charter-promised capability absent from source.
- **No cached inverse-world `Matrix4`.** `convertNodeVector3GlobalToLocal` (`nodeTransform3d.ts:27-35`) is alloc-free via pool bracket but re-inverts the world matrix every call. `HasTransform3DRuntime` has no cached-inverse slot, making the 3D path asymmetric with the 2D one (which uses `inverseMatrixTransformPointXY`).
- **`adjustments`/`materials` dependency on the base graph package.** `nodeColorAdjustment.ts` pulls these two packages, adding dependency weight to the "shared graph spine." Tree-shaking eliminates them when unused, but the npm-level dependency exists for every consumer of `@flighthq/node`. Whether color adjustments belong on the base runtime (charter position) or a narrower tier is an open question.
- **Diagnostics layer is minimal.** `enableNodeGuards` covers one guard (`reparentNode` decline). Silent sentinels in `removeNodeChildAt` (returns `null`), `getNodeCommonAncestor` (returns `null`), `findNode`/`findNodeByName` (return `null`) have no `explain*` counterparts. The `canAddChild` rejection in `addNodeChild` throws but has no pre-flight guard.
- **No world-decomposition accessors.** `getNodeWorldPosition`/`Scale`/`Rotation` and `setNodeWorldTransformMatrix` do not exist; `reparentNode` proved the inline-decomposition pattern but the accessor set has not materialized.
- **Recursive traversal/dispose only.** `findNode`, `forEachNodeDescendant`, `walkNodeDescendants`, and `disposeNode` all recurse (stack depth = tree depth); no iterative variants, no BFS/post-order, and `walkNodeDescendants` has only early-exit-all (no skip-subtree-continue-siblings result).
- **No child-sort/ordering conveniences.** `sortNodeChildren(target, comparator)` and front/back move helpers are absent; composable from `setNodeChildIndex` but a hand-rolled batch sort emits O(n) reorder signals.
- **No batch/deferred invalidation.** Charter Open direction #2; gated on benchmarks.
- **No spatial query layer.** Charter Open direction #1; home unsettled.

## Charter contradictions

**None.** All seven 2026-07-01 Decisions are implemented: the trait set matches Decision #1 (no DisplayObject traits), 3D is raw-matrix per Decision #2, signals are hierarchy-only per Decision #4, `skewX`/`skewY` on `HasTransform2D` per Decision #5, no serialization functions per Decision #6, and `reparentNode`/`addNodeChild` split per Decision #7. Decision #3 (3D bounds node-level) is unfulfilled but not contradicted -- the code has not been built.

## Contract & docs fit

**Alignment with the contract is strong:** types-first (all trait interfaces and aliases defined in `@flighthq/types`), `ensure*`/`compute*`/`get*` split clean, pool brackets balanced (`reparentNode` uses `try/finally`, `convertNodeVector3GlobalToLocal` uses acquire/release), sentinels for misses with misuse-only throws, `Readonly<>` used throughout function parameters, single root export, tests mirror exports, intra-SDK imports via `/contract`.

**Resolved since prior review (verified against source):**

- **Self-import by package name** -- fixed. `nodeTransform2d.ts` now imports from `'./revision'`, not `'@flighthq/node'`.
- **`invalidateNodeLocalTransform` doc comment** -- updated. Now reads "x, y, rotation, scaleX, scaleY, skewX, skewY, or pivot" (`revision.ts:99`).
- **`hasTransform3d.ts` type re-export** -- removed. No trait file re-exports types.
- **`forEachNodeAncestor` callback asymmetry** -- fixed. Both `forEachNodeAncestor` and `forEachNodeChild` accept `(node) => boolean | void`.
- **`computeViewportRenderTransform` eslint-disable** -- resolved. Function does not exist in the package.

**Remaining findings, package side:**

- **`invalidateContent` naming exception.** Every sibling invalidator is `invalidateNode*`; this one drops `Node` from the name despite taking `target: Node<Traits>`. Landed via deliberate user commit (`23fcf86c`). Either ratify the exception or rename to `invalidateNodeContent`.
- **`contract.ts` export lines are unsorted.** `./revision` precedes `./nodeTransform2d` and `./stageFit` precedes `./nodeTransform3d`; alphabetical order should be `nodeTransform2d`, `nodeTransform3d`, `revision`, `stageFit`.
- **`stageFit.ts` is named for a type that no longer exists.** All exports are `computeScene2DFit*`; no `Stage` symbol survives anywhere in the package. The filename is the last reference.
- **Three `as unknown as` casts.** Two in `boundsRectangle.ts` (lines 126, 153: `getNodeParent(...) as unknown as Spatial2DNode<Traits> | null`) and one in `node.ts` (line 30: `createNodeRuntime as unknown as NodeRuntimeFactory<Runtime>`). The bounds casts bridge `getNodeParent`'s `NodeOf<Traits>` return to `Spatial2DNode<Traits>` where the caller knows the graph family but the type system does not.
- **`NodeRuntime` carries interaction-subsystem state on the base tier.** `interactionSignals` and `interactionState` (`types/src/Node.ts:33, :43`) sit on the runtime every node kind shares. The Entity/Runtime rule says a subsystem slot belongs on the narrowest tier with the capability; the comment itself says the fields are owned by `@flighthq/interaction`.
- **`NodeRuntime` extends `ColorAdjustmentRuntime` at the base tier.** `colorAdjustments`, `resolvedColorScaleBias`, `resolvedColorMatrix`, `colorAdjustmentsUnsupported` live on every node's runtime. Whether this is the right tier or whether it belongs on a narrower runtime is unratified.
- **`HierarchyNode` alias now exists** (`types/src/HierarchyNode.ts`). Status.md claims it is absent; this is stale. `GraphAppearanceNode` remains absent from types -- what exists is `AppearanceNode` (`types/src/HasAppearance.ts:25`). AGENTS.md names `GraphAppearanceNode` as a graph-feature alias; either the map's name or the type's name needs aligning.

**Findings, docs side (candidate revisions, user's gate):**

- The Package Map line in AGENTS.md -- "`@flighthq/node` (graph hierarchy, transforms, bounds, appearance)" -- still omits the traversal surface, lifecycle (`disposeNode`), the revision system, color adjustments, the order list, the viewport helpers, and the diagnostics layer.
- The charter's revision-channel prose ("seven-channel") predates the `localContentId` channel. The text works if `worldTransform` is counted as derived, but the charter nowhere names the content channel or explains the counting; the What-it-is section should mention content invalidation now that scene2d, shape, and text depend on it.
- Status.md's "No diagnostics layer at all" item is stale -- `enableNodeGuards` exists with a reparentNode guard. The status should acknowledge the layer exists and note that it is minimal (one guard, no `explain*` exports).

## Candidate open directions

1. **`invalidateContent` naming** -- ratify the exception or rename to `invalidateNodeContent`. It defines the cross-package direct-mutation vocabulary; callers exist in `scene2d`, `shape`, and `text`.
2. **Adjustments/materials coupling on the base tier** -- ratify `ColorAdjustmentRuntime` on `NodeRuntime` and the `adjustments`/`materials` dependency in the charter's Decisions, or extract `nodeColorAdjustment.ts` to a narrower package or opt-in module.
3. **Interaction-subsystem state on base `NodeRuntime`** -- ratify the `interactionSignals`/`interactionState` placement or move to a narrower tier.
4. **Traversal order/prune options** -- iterative and/or BFS/post-order variants, and a skip-subtree visitor result. The current surface is pre-order-with-early-exit-all only.
5. **Child sorting** -- is `sortNodeChildren(target, comparator)` in scope as a hierarchy convenience, or left to callers?
6. **`stageFit.ts` filename** -- rename to `scene2dFit.ts` or similar to match the export prefix.
