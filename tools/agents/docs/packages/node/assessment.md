---
package: '@flighthq/node'
updated: 2026-06-24
basedOn: ./review.md
---

# node — Assessment

Sorted from `review.md` (solid, 87/100, over bundle `builder-67dc46d64`) and the prior `reviews/maturation/depth/node.md` Bronze/Silver/Gold roadmap. The roadmap's **Bronze** tier is now essentially landed by this bundle (traversal, recursive search, ancestor iteration, `disposeNode`, the 3D alloc fix, the `Readonly<>` revision-getter cleanup), so it does not reappear below — it is absorbed. What remains is the Silver/Gold residue plus the in-source nits the review raised.

`Approved` is empty by design — approval is the user's verbal gate. Design forks and cross-package items are **not** in `Recommended`; they are surfaced to the charter's Open directions (the review already enumerates them — see the note at the end).

No registry-vs-union fork applies (the package has no closed `switch(kind)`), and no triad-layer (`-formats`/`-backend`) or new-package bedrock-test item arises — every candidate below is a function or runtime-slot addition within `@flighthq/node`, or a parked design/cross-package call.

## Recommended

Strictly sweep-safe: within `@flighthq/node`, no cross-package coupling, no breaking public-type change, no open design decision. A blanket "do all recommended" can take all of these.

- **Unify the two traversal styles in `traversal.ts`.** `walkNodeDescendants` (`traversal.ts:133`) re-fetches `getNodeRuntime(source).children!` inside the loop each iteration and drives iteration off `getNodeChildCount`, while its sibling `forEachNodeDescendant` hoists `children` once and iterates directly. Hoist the children array once in `walkNodeDescendants` to match. Pure in-file cleanup, behavior-preserving. — review.md#minor-in-source-nits
- **`forEachNodeChild` early-out parity / iteration helpers already landed** — no action; noted so a later sweep does not re-add them.
- **`getNodeNextSibling` / `getNodePreviousSibling`, `getNodeChildren`, `addNodeChildren`, `replaceNodeChild`, `isNodeAncestorOf`, `getNodeCommonAncestor`, `getNodeAncestors`, `reparentNode` (pass-through) already landed** in this bundle — no action; recorded so the Silver hierarchy wave is not mistaken for outstanding work.

> Net: the one strictly sweep-safe outstanding item is the `walkNodeDescendants` hoist cleanup. Everything else the roadmap named is either already landed by the bundle or genuinely parked below. The signal-coverage wiring, though within-package and additive, is gated on a scope ruling (Open direction #5) and so lives in Backlog, not here — keeping `Recommended` blanket-safe.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Wire the existing revision channels to change signals behind `enableNodeSignals`.** The revision/dirty channels for transform/bounds/enabled already exist; `enableNodeSignals` currently emits on child/parent mutation only. Adding `onTransformChanged` / `onWorldTransformChanged` / `onBoundsChanged` / `onEnabledChanged` / `onNodeDisposed` would be within-package and additive, but _whether_ the signal surface should grow beyond hierarchy is a scope question the stub charter has not answered → Open direction #5. Sweep-safe to build only once that ruling lands.
- **3D → 2D transform parity (cached lazy local matrix from TRS).** Adding a TRS shape (`position`/`rotation`/`scale`) and `ensureNodeLocalTransformMatrix4` to replace the raw `localMatrix: Matrix4` **changes the public `HasTransform3D` type in `@flighthq/types`** and forces a quaternion-vs-Euler rotation-representation choice. Open design decision + breaking type change → Open direction #4.
- **Cached inverse-world `Matrix4` slot for `convertNodeVector3GlobalToLocal`.** The Bronze alloc fix stopped per-call allocation but still re-inverts every call. A cached inverse slot on `HasTransform3DRuntime` is within-package and additive _in isolation_, but it is the runtime half of the 3D-parity work above and should land with it (same TRS/inverse caching design) rather than as an orphan slot. Parked to ride with Open direction #4.
- **`reparentNode(keepWorldTransform)` and world-decomposition accessors** (`getNodeWorldPosition`/`Scale`/`Rotation`, `setNodeWorldTransformMatrix`). All blocked on a missing `decomposeMatrix` in `@flighthq/geometry` — cross-package. Whether that math lives in `geometry` (benefits all callers) or inline in `transform2d.ts` is unresolved → Open direction #2.
- **Skew in `HasTransform2D` (`skewX`/`skewY`).** Either add to the type and fold into `ensureNodeLocalTransformMatrix`, or mark missing-by-design. Public-type change _or_ a deliberate omission ruling — a design decision either way → Open direction #3.
- **3D bounds tier (`getNodeLocalBoundsBox`/`getNodeWorldBoundsBox` over an AABB type).** Cross-package home question (here vs `@flighthq/scene`) and a new bounds type → Open direction #4. Not autonomous.
- **Batch/deferred invalidation (`beginNodeBatch`/`endNodeBatch`) and a 3D offset-only world-bounds fast path.** Within-package and additive, but Gold-tier performance work that the roadmap says should be **measured** (benchmark deep-tree propagation; `npm run size` for any optional hook) before landing — not a blind sweep. Parked pending that measurement bar.
- **Spatial query layer (`pickNodeAtPoint`, `queryNodesInRectangle`/`Box`, bounds-overlap helpers) and the optional spatial-index acceleration (`NodeBoundsIndexRuntime` slot).** Overlaps `@flighthq/interaction`'s hit-testing domain; the seam must be agreed with that owner first → Open direction #6. The index is additionally Gold-only, measured, gated as a nullable runtime hook.
- **Scene serialization spine (`serializeNodeGraph`/`deserializeNodeGraph` + `registerNodeMigration`).** Cross-cutting: needs the versioned-migration model from the types-layout doc and per-kind data delegation to each owning package — a multi-package effort to scope → Open direction #7.
- **`flighthq-node` Rust crate (1:1 conformance mirror).** The charter declares `crate: flighthq-node`, but the slotmap-arena foundation does not exist yet. Large, separate Rust-worktree workstream gated on that foundation — not a `node`-local task.
- **Coordinate render's `walkNode` against the new base-graph `walkNodeDescendants`.** The roadmap's one Bronze cross-package touch: decide whether `@flighthq/render`'s `walkNode` becomes a thin wrapper over the base primitive or is deduplicated. Cross-package coordination, not sweep-safe.
- **`getNodeCommonAncestor` O(1)-space two-pointer LCA.** Currently a `Set` (O(depth) space) — clear over optimal, fine for typical depths, explicitly noted as acceptable in the review. Parked as a low-value micro-optimization, not worth a sweep slot.

## Approved

_Empty. Approval is the user's verbal gate; nothing is frozen here yet._

## Note to the charter (Open directions — do not edit the charter here)

The charter is a stub (North star / Boundaries / Decisions / Open directions all `TODO`), so most of the Backlog is parked on questions the charter has not answered. The review already enumerated the seven candidate Open directions; the load-bearing ones for this assessment are:

1. **Source-data vs. graph-participation line (structural-fork A).** This bundle silently placed three canonical OpenFL _DisplayObject_ trait initializers — `initCacheAsBitmapTrait`, `initOpaqueBackgroundTrait`, `initScrollRectTrait` — at the base `node` tier (alongside the pre-existing `appearance`/`clip`/`material` traits). Ratify "node" or reverse to `@flighthq/displayobject`. **Flagged, not acted on** — it is an unflagged scope/home choice needing an explicit ruling, and it also gates the Package Map / _What it is_ line revision.
2. `decomposeMatrix` home (geometry vs inline) — gates reparent-keep-world + world decomposition.
3. Skew: add or mark-omitted.
4. 3D rotation representation (quaternion vs Euler) + 3D-bounds ownership (here vs `scene`).
5. Signal-coverage scope — whether `enableNodeSignals` grows transform/bounds/enabled/disposed change signals (the one item that would move the conditional Recommended entry to unconditional).
6. Spatial query seam with `@flighthq/interaction`.
7. Scene-serialization model (cross-package).
