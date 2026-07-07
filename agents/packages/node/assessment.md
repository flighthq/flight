---
package: '@flighthq/node'
updated: 2026-07-02
basedOn: ./review.md
---

# node — Assessment

Sorted from `review.md` (solid, 87/100) and the direction session (2026-07-01). The Bronze tier is fully landed. The direction session resolved seven of nine original Open directions, producing seven Decisions. Builder executed the approved skew and reparentNode work (landed 2026-07-02).

## Recommended

Strictly sweep-safe: within `@flighthq/node`, no cross-package coupling, no unresolved design decision.

- **Drop stale "proposed" / "DRAFT" language from any remaining doc references** that pointed at the old Open directions now resolved by Decisions.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **World-decomposition accessors** (`getNodeWorldPosition`, `getNodeWorldScale`, `getNodeWorldRotation`, `setNodeWorldTransformMatrix`). Same inline decomposition approach as `reparentNode`. Should land as a cohesive set after `reparentNode` proves the pattern.
- **3D bounds tier** (`getNodeLocalBoundsBox` / `getNodeWorldBoundsBox` over an AABB type). Charter Decision #3 blessed this as node-level, but it requires a new AABB-based bounds type in `@flighthq/types` and a 3D bounds recompute path parallel to the 2D one. Not a sweep item — it's a new subsystem.
- **Cached inverse-world `Matrix4` slot for `convertNodeVector3GlobalToLocal`.** The Bronze alloc fix stopped per-call allocation but still re-inverts every call. A cached inverse slot on `HasTransform3DRuntime` is additive but should land alongside any 3D subsystem work rather than as an orphan slot.
- **Batch/deferred invalidation (`beginNodeBatch`/`endNodeBatch`).** Gold-tier performance work. The charter leaves this as an Open direction pending measurement (benchmark deep-tree propagation before adding API surface).
- **Coordinate render's `walkNode` against `walkNodeDescendants`.** Cross-package: decide whether `@flighthq/render`'s render-aware `walkNode` becomes a thin wrapper or stays separate. Low priority — they serve different purposes (pure graph traversal vs render-prepare walk).
- **`getNodeCommonAncestor` O(1)-space two-pointer LCA.** Currently a `Set` (O(depth) space). Clear over optimal, fine for typical depths. Low-value micro-optimization.
- **`flighthq-node` Rust crate.** Large, separate workstream gated on the slotmap-arena foundation. Not a node-local task.

## Approved

- [2026-07-01 · blanket "bless it all"] Add `skewX`/`skewY` to `HasTransform2D` — charter Decision #5 ✅ landed
- [2026-07-01 · blanket "bless it all"] Add skew tests — charter Decision #5 ✅ landed
- [2026-07-01 · picked] Upgrade `reparentNode` to world-transform-preserving (inline decomposition, skew preserved) — charter Decision #7 ✅ landed
- [2026-07-01 · blanket "bless it all"] Drop stale draft language from resolved Open directions
