---
package: '@flighthq/spatial'
status: solid
score: 66
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# spatial — Review

## Verdict

solid — 66/100. The seam and the P1 uniform grid are built to the charter's decisions and the tricky parts (canonical-cell pair dedup, DDA ray walk with real-bounds confirmation) are implemented thoughtfully. It sits at the low end of solid because the backend family is still one-of-three, the pair query is not as allocation-frugal as the North star asks, `updateSpatialObject` always does a full remove+reinsert, and the test suite (15 tests) is thin for internals this easy to get subtly wrong.

## Present capabilities

- **Seam** (`packages/types/src/Spatial.ts`): `SpatialObjectId` (number), `SpatialAabb` (min/max corners, deliberately distinct from collision's and geometry's types — dependency rationale documented), `SpatialPair`, `SpatialIndexBackend` (8 operations, all out-array queries), `SpatialIndexRuntime`/`SpatialIndex` entity — exactly the 2026-07-10 decisions.
- **Facade** (`spatialIndex.ts`): `createSpatialIndex(backend?)` defaulting to a 128-unit grid (constructed on call, no import side effect — documented), plus `insertSpatialObject`/`updateSpatialObject`/`removeSpatialObject`/`clearSpatialIndex` and `querySpatialPairs`/`Region`/`Point`/`Ray`, each a thin dispatch through `runtime.backend`.
- **Uniform grid** (`uniformGrid.ts`, `createUniformGridSpatialBackend(cellSize)`): spatial hash keyed `"cx,cy"`; per-object copied bounds (caller may reuse its value — documented); occupied-cell-range tracking that only expands (conservative, reset on empty — documented); pair enumeration deduplicated by the canonical top-left shared cell, ids ordered `a < b`, never `(a,a)`; region/point queries confirm candidates against real bounds via geometry's `intersectsRectangle`/`containsRectanglePointXY` through scratch rects; ray query is an Amanatides–Woo DDA bounded to the occupied range, entry-clipped by `_rayBoxEntryT`, with per-id slab confirmation and a zero-direction degenerate to point query.
- **Hygiene** — deps `geometry` + `types` only; `sideEffects: false`; reused `seen` scratch set per grid.

## Gaps

- **Alternate backends** — quadtree (P2) and sort-and-sweep (P3) are chartered but unbuilt; the seam exists to receive them.
- **Pair-query allocation** — `_queryGridPairs` spreads each cell's id set into a fresh array (`[...ids]`) and pushes a fresh `{a, b}` object per pair, every query. The North star says "insert-update-query is allocation-frugal"; region/point/ray honor it (scratch set + out arrays) but the per-frame pair path allocates proportionally to occupancy.
- **`updateSpatialObject` re-inserts unconditionally** — remove+insert even when the object's covered cell range is unchanged (the overwhelmingly common small-movement case). A cell-range equality fast path would make per-frame updates near-free.
- **Ray results are unordered** — no nearest-first ordering or entry-`t` reporting; callers doing line-of-sight/picking must re-test and sort. (May be by design — "candidates, caller confirms" — but the charter is silent.)
- **Persistent pair events** — enter/stay/exit tracking (charter Open direction 3) unbuilt.
- **No guard layer** — `cellSize <= 0` (or non-finite bounds) silently produces broken cell indices/infinite loops; wants `enableSpatialGuards` per the diagnostics inversion rule.
- **Test depth** — 15 tests cover one happy path per operation plus a few edge cases (negative coordinates, multi-cell dedup, cross-cell-size consistency). Missing: a randomized brute-force reference test (insert/move/remove churn vs an O(n²) oracle for pairs/region/point/ray), ray tests through diagonal cell corners, and update-heavy churn.

## Charter contradictions

None structural — all three 2026-07-10 decisions hold (seam + grid default, dedup'd self-excluding pairs as ids, types in the header layer). The "allocation-frugal" North-star phrase is only partially honored on the pair path, noted above as a gap rather than a contradiction.

## Contract & docs fit

- **Contract**: good — full `Spatial*` names, out-array queries cleared-then-filled, sentinel behavior (unknown id remove is a no-op), single root export. One style note: `uniformGrid.ts` uses `_`-prefixed module-private helpers; precedent exists elsewhere (`geometry/matrix4.ts`, `application.ts`), so this is consistent-enough, not a violation.
- **Docs**: the Package Map line matches reality (including the P1/P2/P3 backend framing and the confirmed-candidates semantics).

## Candidate open directions

- Whether ray queries should report entry `t` / nearest-first order, or stay unordered candidate sets (affects the backend seam signature — settle before P2 backends multiply).
- Pair-query result protocol: keep `{a,b}` object pairs, or a flat `number[]` (a,b interleaved) for zero-allocation hot loops — a seam-signature decision, cheaper to make while one backend exists.
- Persistent-pair (enter/exit) layer: composing package function vs backend responsibility (charter Open direction 3 gestures at signals-over-raw-query).
