---
package: '@flighthq/node'
updated: 2026-08-13
by: builder3
---

# node — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

The mutation item was checked on 2026-08-13; the remaining items were re-checked against
`packages/node/src/` (and `packages/types/src/`) on 2026-08-08. A file:line here is a claim about this
tree, not about a session.

- **Three `nodeOrderList.ts` mutation survivors are UNRESOLVED, not equivalent.** The `<` → `<=`
  survivors in `addNodeOrderListEntry`, `applyNodeOrderList`'s child scan, and
  `removeNodeOrderListEntryAtIndex` depend respectively on equal backing-array capacities, a valid
  `Node` in every active entry, and callers never observing retained capacity. The factory and package
  mutators preserve those conditions, but `NodeOrderList` is a caller-owned structural interface with
  public mutable `entryCount`, `nodes`, and `sortKeys`; no type or runtime boundary enforces them. The
  other two survivors are structurally equivalent under locally enforced write structure, with their
  preconditions and invalidation tripwires recorded beside the loops.
- **No diagnostics layer at all.** `packages/node/src/` contains zero `enable*Guards` and zero
  `explain*` exports, while 20+ sibling packages carry both. Node returns silent sentinels —
  `removeNodeChildAt` → `null` (`hierarchy.ts:286`), `getNodeCommonAncestor` → `null`,
  `findNode`/`findNodeByName` → `null` (`traversal.ts`) — so each is a missing `explain*` query,
  and `addNodeChild`'s `canAddChild` rejection (`types/src/Node.ts:26`) is a missing guard.
- **`NodeSignals` covers hierarchy only.** `types/src/NodeSignals.ts:4` declares
  `onChildAdded`/`onChildRemoved`/`onChildrenChanged`/`onChildrenOrderChanged`/`onParentChanged`
  and nothing else. No transform, world-transform, bounds, appearance, or dispose signal, although
  the revision counters that would drive them already exist (`revision.ts`).
- **The 3D point path pays an inversion per call.** `convertNodeVector3GlobalToLocal`
  (`nodeTransform3d.ts:26`) acquires a pooled `Matrix4` and inverts the world matrix on every
  invocation. `HasTransform3DRuntime` (`types/src/HasTransform3D.ts:18`) has no cached-inverse slot,
  so the 3D path is asymmetric with the 2D one, which caches.
- **Two graph-feature aliases AGENTS.md names do not exist.** `HierarchyNode` and
  `GraphAppearanceNode` are absent from `packages/types/src/`. What exists is `AppearanceNode`
  (`types/src/HasAppearance.ts:25`) and `BlendModeNode` (`types/src/HasBlendMode.ts:12`), and both
  have **zero** consumers outside `types`. `Transform2DNode`, `BoundsNode`, and `Spatial2DNode` are
  real and used. Either the map's names are wrong or the aliases were never renamed.
- **`NodeRuntime` carries interaction-subsystem state on the base tier.** `types/src/Node.ts:32`
  (`interactionSignals`) and `:41` (`interactionState`) sit on the runtime every node kind shares.
  The Entity/Runtime rule puts a subsystem slot on the narrowest tier that has the capability, and
  the `interactionState` comment itself says the fields are owned by `@flighthq/interaction`.
- **`stageFit.ts` is named for a type that no longer exists.** Every export in it is
  `computeScene2DFit*` (`stageFit.ts:18`, `:25`, `:32`, `:42`, `:55`); no `Stage` symbol survives
  anywhere in this package. The filename is the last reference.
- **`contract.ts` export lines are unsorted** — `./revision` precedes `./nodeTransform2d` and
  `./stageFit` precedes `./nodeTransform3d`.
- **No spatial-query, serialization, or batch-invalidation surface.** `pickNodeAtPoint`,
  `queryNodesInRectangle`, `serializeNodeGraph`/`deserializeNodeGraph`, and
  `beginNodeBatch`/`endNodeBatch` appear nowhere in `packages/`. The first pair overlaps
  `@flighthq/interaction` and needs a seam ruling before it is built here.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-13** — Re-audited all five `nodeOrderList.ts` mutation survivors: two internal loop
  boundaries have structural proofs and source tripwires; three valid-window-dependent survivors are
  explicitly UNRESOLVED in `Open` because the structural list contract does not enforce their premise.
- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The largest false claim dropped: the
  whole transform-decomposition blocker ("`reparentNode` moves child without world-transform
  preservation … no `decomposeMatrix` exists in `@flighthq/geometry`", plus the deferred
  `getNodeWorld*` accessors, the `skewX`/`skewY` question, and "`HasTransform3D` stores only a raw
  `localMatrix` with no TRS fields"). All four are closed: `reparentNode` decomposes inline at
  `hierarchy.ts:336-368`, `geometry` exports `decomposeMatrixToTransform2D`, `HasTransform2D` has
  `skewX`/`skewY` (`types/src/HasTransform2D.ts:16`), and `HasTransform3D` authors
  position/quaternion/scale over a cached matrix (`types/src/HasTransform3D.ts:12`). Rust-crate and
  conformance items were also dropped — there is no `rust/` tree and no `agents/rust/` in this repo.
- **2026-08-05** — 2D root renamed `Stage`→`Scene2D`; world transform/appearance revisions now
  propagate to descendants at any depth; `NodeOrderList` matured to query/remove/swap/capture.
- **2026-07-03** — `no-warning-comments` enforced over `packages/*/src`; three `// hack` markers in
  `boundsRectangle.test.ts` rewritten as descriptive comments.
- **2026-06-25** — `walkNodeDescendants` hoists the children array once, matching
  `forEachNodeDescendant` (`traversal.ts`).
- **2026-06-25** — Pruned-core port: new `traversal.ts`, `disposeNode`, and the hierarchy helpers
  (`addNodeChildren`, `getNodeAncestors`, `getNodeCommonAncestor`, `reparentNode`, …).
- **2026-06-24** — Traversal/lifecycle/hierarchy surface landed; `convertNodeVector3GlobalToLocal`
  switched from `createMatrix4()` to the geometry pool.
