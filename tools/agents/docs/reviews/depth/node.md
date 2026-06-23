# Depth Review: @flighthq/node

**Domain**: Retained-mode scene-graph core — the shared base graph that display objects, sprite graphs, and future graph families build on. Its concerns are: parent/child hierarchy and z-ordering, 2D/3D transform composition (local→world), bounds propagation, an invalidation/revision system, optional appearance/clip/material traits, hierarchy change signals, and a viewport scale/align transform. This is the "node library" tier of an engine (analogous to the `Node`/`Spatial`/`Object3D` base of Godot, Cocos, three.js, or PIXI's `Container` core) — explicitly _not_ concrete primitives, which live in `@flighthq/displayobject`, `@flighthq/sprite`, and `@flighthq/scene`.

**Verdict**: solid — 78/100

The package covers the canonical spine of a scene-graph base cleanly and with real engineering depth (a fine-grained revision/dirty-flag system, cached lazy transforms, an offset-only fast path for world bounds). It is more than a stub and reads as deliberate. It falls short of "authoritative" because several traversal/query and convenience operations that a mature graph base is expected to provide are simply absent rather than excluded by design, and the 3D side is markedly thinner than the 2D side.

## Present capabilities

Hierarchy (`hierarchy.ts`) — a complete, OpenFL-faithful child API:

- `addNodeChild`, `addNodeChildAt` (with reparenting, self-add guard, `canAddChild` gate, bounds checks)
- `removeNodeChild`, `removeNodeChildAt`, `removeNodeChildren(begin, end)`
- `getNodeChildAt`, `getNodeChildByName`, `getNodeChildCount`, `getNodeChildIndex`
- `getNodeParent`, `getNodeRoot`, `containsNodeChild` (ancestor walk)
- `setNodeChildIndex`, `swapNodeChildren`, `swapNodeChildrenAt` (z-order, with `onChildrenOrderChanged` emission)

Transform 2D (`transform2d.ts`) — lazy, cached, revision-gated:

- `getNodeLocalTransformMatrix` / `getNodeWorldTransformMatrix` with `ensure*` recompute guards
- pivot-aware local matrix build (`x,y,rotation,scaleX,scaleY,pivotX,pivotY`), rotation normalized to ±180 with cached sin/cos
- world = parent.world × local composition with parent-chain walk
- `convertNodeVector2LocalToGlobal` / `convertNodeVector2GlobalToLocal`

Transform 3D (`transform3d.ts`):

- `getNodeWorldTransformMatrix4` / `ensureNodeWorldTransformMatrix4`, Matrix4 world composition
- `convertNodeVector3LocalToGlobal` / `convertNodeVector3GlobalToLocal`

Bounds (`boundsRectangle.ts`) — three coordinate tiers with caching:

- `getNodeLocalBoundsRectangle` (own extent via pluggable `computeLocalBoundsRectangle`)
- `getNodeParentBoundsRectangle` (local × localTransform)
- `getNodeWorldBoundsRectangle` (world transform + recursive child union, skips disabled/empty)
- `computeNodeBoundsRectangle(out, source, targetCoordinateSpace)` — arbitrary-space bounds with fast paths
- `getNodeWidth/Height`, `setNodeWidth/Height` (scale-derived sizing)
- offset-only fast recompute (`tryFastRecomputeWorldBoundsRectangle`) when only translation changed

Revision / invalidation (`revision.ts`) — fine-grained, distinct dirty channels:

- separate counters for appearance, local bounds, local content, local transform, world bounds, parent reference, world transform
- `invalidateNode` (full), `invalidateNodeRender` (appearance + transform), and per-channel invalidators
- `getNode*Revision` accessors; world transform revision packs local+parent ids

Node lifecycle & traits:

- `createNode` (kind + optional data/runtime factories), `createNodeRuntime`, `getNodeRuntime`, `setNodeEnabled`
- signals: `createNodeSignals`, `enableNodeSignals`, `getNodeSignals` — `onChildAdded/Removed`, `onChildrenChanged`, `onChildrenOrderChanged`, `onParentChanged`
- opt-in trait initializers: `hasAppearance` (alpha/visible/blendMode), `hasClip`, `hasMaterial`, `hasBoundsRectangle`, `hasTransform2d`, `hasTransform3d` — each with paired runtime-trait init where state is needed
- viewport: `createViewport` + `computeViewportRenderTransform` with `noscale/exactfit/showall/showall-fill` scale modes and 9-way align (`computeViewportAlignX/Y`, `computeViewportFitScale`, `computeViewportFillScale`)

Tests are colocated and substantial (bounds and hierarchy test files are ~18KB each), including alias-case coverage expected by the project rules.

## Gaps vs an authoritative scene-graph-base library

Traversal / iteration (the largest gap). A mature graph base offers structured traversal as first-class API; here every consumer must hand-roll a walk over `getNodeChildCount`/`getNodeChildAt`:

- no `walkNode` / `traverseNode` / `forEachNodeDescendant` (depth-first visitor) — there _is_ a `walkNode` but it lives in `@flighthq/render`, not here, so the base graph itself ships no traversal primitive
- no `getNodeDescendants` / `findNode(predicate)` / `findNodeByName` recursive search (only the shallow, single-level `getNodeChildByName`)
- no ancestor iteration helper (`getNodeAncestors` / `forEachNodeAncestor`) despite `getNodeRoot`/`containsNodeChild` both walking parents internally
- no `getNodeDepth` / `getNodeLevel`
- no node iterator/`Symbol.iterator` over children

Hierarchy convenience operations present in peer engines:

- no `addNodeChildren(...)` batch add, no `replaceNodeChild`
- no `reparentNode(child, newParent, keepWorldTransform)` — reparenting works but never preserves world transform, a standard scene-graph affordance
- no `getNodeNextSibling` / `getNodePreviousSibling` / `getNodeChildren` (read-only snapshot)
- no `isNodeAncestorOf` / `getNodeCommonAncestor` (LCA) — useful for the coordinate-space conversions the package already does

Transform depth:

- no decomposition/inspection helpers: no `getNodeWorldPosition` / `getNodeWorldScale` / `getNodeWorldRotation`, no `setNodeWorldTransformMatrix` (world→local inverse setter)
- no skew support in the 2D trait (`x,y,rotation,scaleX,scaleY,pivot` only) — OpenFL/Flash `Matrix` and most 2D engines expose skew; its absence may be deliberate but is unmarked
- `convertNodeVector3*` allocates a fresh `Matrix4` per call (`createMatrix4()` inside the function) — contrary to the package's own hot-loop/no-alloc discipline; the 2D path caches and the 3D path does not
- 3D is asymmetric with 2D: no cached/lazy local-matrix build from TRS components (3D stores a raw `localMatrix` only), no 3D bounds tier, no 3D parent-bounds — the 3D side is a thin shell next to the 2D side

Lifecycle:

- no `disposeNode` / `destroyNode` — the project's teardown-verb rules (`dispose*` detach-to-GC, `destroy*` free-resource) are defined codebase-wide, and a node owning child arrays + signals is exactly where a `disposeNode` (detach signals, clear children) is expected. Its absence is a real omission for a base that manages signal registries.

## Naming / API-shape notes

- Naming is consistent and self-identifying per the project rules: every function carries the full `Node` type word, `get/has/is` prefixes are respected, `ensure*` (recompute-if-dirty) vs `compute*` (write-to-out) vs `get*` (cached read) is a clean, legible three-way split.
- The trait model (`init*Trait` + paired `init*RuntimeTrait`, pluggable `computeLocalBoundsRectangle` / `canAddChild`) is a genuinely good fit for the entity/runtime + tree-shakable architecture; traits are opt-in and side-effect-free.
- The revision system is the strongest part of the package — distinct `appearance / localBounds / localContent / localTransform / worldBounds / worldTransform / parentReference` channels are more granular than most engines expose and are clearly thought through.
- Minor inconsistency: `getNodeWorldTransformRevision` takes `Node<Traits>` (mutable) while sibling revision getters take `Readonly<Node<Traits>>`.
- `getNodeChildIndex` and the swap/contains paths use loose `==` rather than `===` in a couple of spots — harmless here but stylistically off for a codebase this disciplined.
- The viewport functions read slightly out of domain for a "base node" package (scale-mode/align is application-layer concern), but it is small, pure, and reasonably parked here.

## Recommendation

Treat as **solid**, with a clear, bounded path to authoritative. Highest-value additions, roughly in order:

1. A traversal primitive set in the package itself: `walkNode`/`forEachNodeDescendant` (visitor with early-out), recursive `findNode`/`findNodeByName`, and `getNodeAncestors`. This is the single biggest thing separating it from an authoritative base graph.
2. `disposeNode` (and decide whether nodes ever own destroyable resources → `destroyNode`) to satisfy the codebase's own teardown contract.
3. Bring 3D to 2D parity: cached lazy 3D local-matrix from TRS, fix the per-call `Matrix4` allocation in `convertNodeVector3*`, and decide explicitly whether 3D bounds belong here or in `@flighthq/scene` (mark the boundary either way).
4. Reparent-with-world-transform-preservation and sibling navigation (`getNodeNextSibling`/`getNodePreviousSibling`), plus world-transform decomposition accessors.
5. Decide and document the skew question for `HasTransform2D` — either add it or mark it missing-by-design.

Most gaps are missing-by-omission (traversal, dispose, 3D parity, reparent), not missing-by-design; the few plausibly-deliberate exclusions (skew, concrete primitives) are simply unmarked. Closing items 1–3 would move this to authoritative.
