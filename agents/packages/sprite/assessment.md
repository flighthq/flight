---
package: '@flighthq/sprite'
updated: 2026-07-13
basedOn: ./review.md
---

# sprite — Assessment

Sorted from `review.md` (solid, 78/100 — full re-survey of the live three-quartet package post-`particleemitter` extraction). All three previously Approved items are verified landed in the live tree (signals dep declared; `Vector2Like` out-params; `QUAD_BATCH_DELETED_ID` exported).

## Recommended

Strictly sweep-safe: within `@flighthq/sprite`, no cross-package coupling, no open design decision.

- **Rewrite the `compactQuadBatch` doc comment to match Decision #1.** The body correctly filters `QUAD_BATCH_DELETED_ID`, but the comment still claims the function "does NOT filter by id," references an `id==-1` sentinel and "zero-out ids," and calls itself a no-op. Replace with the blessed mark-then-compact workflow (write `QUAD_BATCH_DELETED_ID` to `ids[i]`, then compact). _(Review Gap 3.)_
- **Fix out-param hygiene in `computeSpriteLocalBoundsRectangle`.** On the `data.rect` path, write `out.x`/`out.y` (from `rect.x`/`rect.y`) instead of leaving stale caller values; on the no-atlas/no-region path, zero all four fields. Add tests asserting a pre-dirtied `out` is fully written on every path. _(Review Gap 2.)_
- **Zero the out in QuadBatch's default bounds method when `runtime.localBoundsRectangle` is null.** `copyLocalBoundsRectangle` currently leaves `out` untouched — write `0,0,0,0` like `computeQuadBatchLocalBoundsRectangle` does. (Whether the compute function should be wired as the default is a posture question — routed to Open directions, not changed here.) _(Review Gap 2.)_
- **Add `getTilemapTiles` — the clipped row-major blit-out counterpart of `setTilemapTiles`.** Same offset/width/height signature, writes into a caller `out` array, clips identically. _(Review Gap 4.)_
- **Add `appendQuadBatchInstanceMatrix`.** The matrix3x2 append sibling of `appendQuadBatchInstance` (auto-grow, write `[a,b,c,d,tx,ty]`, emit `onInstanceAppended`), closing the append/set symmetry that `setQuadBatchInstanceMatrix` already implies. Flagged in the 2026-06-24 status, never landed. _(Review Gap 5.)_
- **Emit `onTilesChanged` from `fillTilemapTiles`** (full-grid extent), matching `clearTilemap`'s existing `onCleared` emission — fill is the same whole-surface mutation class. _(Narrow slice of Review Gap 6; the broader emit-policy ruling stays an Open direction.)_

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Int32Array widening + tile flags API.** _Parked — cross-package (blessed by charter Decision #5 but touches `@flighthq/types`, renderers, and `tilemap-formats`)._ Now the top-priority backlog item: `tilemap-formats` decodes Tiled flip bits and drops them for want of the widened grid (review Gap 1). Needs a coordinated dispatch, not a sweep.
- **Region-lookup delegation to `@flighthq/textureatlas`.** _Parked — adds a package dependency (cross-package fork; review Candidate direction 3)._ Would remove the per-call `regions.find` closure in `getSpriteRegion`/bounds.
- **`enableQuadBatchGuards` for the vector2-only mutator precondition.** _Parked — design-adjacent: Decision #3 rejected a hot-loop runtime check; an opt-in shakeable guard module is compatible but is new diagnostics surface that should be blessed._ (Review Gap 8.)
- **Mutation-signal emit policy.** _Parked — needs the ruling in review Candidate direction 2 before touching per-instance setters._
- **Tilemap capacity symmetry.** _Parked — charter Open direction #1, unsettled._
- **Bounds caching / dirty slot; default-bounds wiring posture.** _Parked — charter Open direction #2 plus review Candidate direction 1; borders the render update pipeline._
- **Edge-case hardening (NaN transforms, negative `reserve*`, ids past `atlas.regions`).** _Parked — charter Open direction #3, Gold-tier posture decision._
- **Pooling brackets.** _Parked — profiling-gated, charter Open direction #4._
- **Rust `flighthq-sprite` conformance catch-up.** _Parked — cross-worktree, charter Open direction #5._
- **Charter refresh to three-quartet identity + ParticleEmitter decision migration.** _Parked — charter edits are the user's direction session, not an assessment sweep (review Candidate direction 4)._

## Approved

- [2026-07-02 · picked] Add `@flighthq/signals` to sprite package.json — merge blocker B2
- [2026-07-02 · picked] Replace inline `{ x; y }` out-params with `Vector2Like` — charter Decision #4
- [2026-07-02 · picked] Add named constant for `0xffff` deletion sentinel — charter Decision #1
