---
package: '@flighthq/node'
updated: 2026-07-13
basedOn: ./review.md
---

# node — Assessment

Sorted from `review.md` (solid, 89/100, 2026-07-13 rereview). All seven 2026-07-01 charter Decisions are landed and verified in source; the remaining work splits into small in-package consistency items (Recommended) and the blessed-but-larger 3D/accessor/performance work (Backlog).

## Recommended

Strictly sweep-safe: within `@flighthq/node`, no cross-package coupling, no breaking change, no open design decision.

- **Fix the self-import** — `transform2d.ts` imports `computeNodeWorldTransformRevision` from `'@flighthq/node'`; change to `'./revision'` to match `transform3d.ts` and remove the circular package reference.
- **Refresh the `invalidateNodeLocalTransform` doc comment** — it enumerates "(x, y, rotation, scaleX, scaleY)"; the 2D transform now includes `skewX`/`skewY` and pivot.
- **Drop the type re-export in `hasTransform3d.ts`** (`export type { HasTransform3D, HasTransform3DRuntime }`) — no other trait file re-exports its types; the barrel-consistency cleanup is local and behavior-free.
- **Unify the early-out callback convention** — `forEachNodeAncestor` requires `=> boolean` while `forEachNodeChild` accepts `=> boolean | void`; widen the ancestor walker to `boolean | void` (non-breaking) so one convention holds across the iteration family.
- **Type the `computeViewportRenderTransform` casts** — replace the two `eslint-disable no-explicit-any` casts in `viewport.ts` with a proper narrow (e.g. a `Partial<HasBoundsRectangleRuntime>` guard over the runtime), removing the package's only typed holes.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **3D bounds tier** (`getNodeLocalBoundsBox`/`getNodeWorldBoundsBox` over AABB). Blessed by charter Decision #3 but a new subsystem: an AABB bounds type/runtime slots in `@flighthq/types` and a recompute path parallel to the 2D one. The largest single item; needs its own briefed session, not a sweep.
- **World-decomposition accessors** (`getNodeWorldPosition`/`Scale`/`Rotation`, `setNodeWorldTransformMatrix`). `reparentNode` proved the inline decomposition; land these as a cohesive set with aliasing/skew semantics decided together.
- **Cached inverse-world `Matrix4` slot** for `convertNodeVector3GlobalToLocal`. Additive but requires a `HasTransform3DRuntime` change in `@flighthq/types`; land alongside the 3D bounds work rather than as an orphan slot.
- **`invalidateContent` rename** (`invalidateNodeContent`). A one-line rename in-package, but it breaks the full-type-name rule only if the user has not blessed the shorter cross-package vocabulary — and callers exist in `displayobject`/`shape`/`text`, making it a cross-package breaking rename. Route to the charter (review.md candidate open direction #2) for a ratify-or-rename ruling.
- **Traversal order/prune variants** (iterative walkers, BFS/post-order, skip-subtree visitor result). Real textbook breadth, but the visitor-result shape is a design decision (boolean vs enum) — charter Open direction territory (review.md candidate #1).
- **`sortNodeChildren(target, comparator)`** and front/back move helpers. Scope question first (review.md candidate #4): hierarchy convenience vs caller-composed.
- **Batch/deferred invalidation** (`beginNodeBatch`/`endNodeBatch`). Charter Open direction #2 — benchmark deep-tree propagation before adding API surface.
- **Spatial query layer.** Charter Open direction #1 — home unsettled (`interaction`/render/scene overlap); do not build in-package.
- **Adjustments slots on base `NodeRuntime`** — ratification of the `colorAdjustments`/`resolvedColorTransform` placement belongs in the charter's Decisions; touching it is a cross-package (`adjustments`/`types`/`render`) move either way.
- **`flighthq-node` Rust crate.** Charter Open direction #3; gated on the slotmap-arena foundation, a separate workstream.
- **`getNodeCommonAncestor` O(1)-space two-pointer LCA.** Clear over optimal, fine for typical depths. Low-value micro-optimization (carried from prior assessment).

## Approved

- [2026-07-01 · blanket "bless it all"] Add `skewX`/`skewY` to `HasTransform2D` — charter Decision #5 ✅ landed
- [2026-07-01 · blanket "bless it all"] Add skew tests — charter Decision #5 ✅ landed
- [2026-07-01 · picked] Upgrade `reparentNode` to world-transform-preserving (inline decomposition, skew preserved) — charter Decision #7 ✅ landed
- [2026-07-01 · blanket "bless it all"] Drop stale draft language from resolved Open directions
