---
package: '@flighthq/spatial'
updated: 2026-07-30
basedOn: ./review.md
---

# spatial — Assessment

See [charter](./charter.md) for blessed direction; evidence in [review](./review.md).

## Recommended

Sweep-safe, within-package, no design fork:

1. **De-allocate the pair enumeration's cell scan** — drop the `[...ids]` spread in `_queryGridPairs` (iterate the set with a reused scratch array on the grid, like `seen`). Keeps the seam signature untouched while honoring the North star's allocation-frugality. (Changing the `SpatialPair` result protocol itself is a seam decision — Backlog.)
2. **Finish the guard coverage `setSpatialIndexingGuard` opened** — the seam, the notice record, and `formatSpatialIndexingNotice` shipped 2026-07-30, and non-finite bounds and oversized extents now report through them. Still unreported, and all in the same shape: `cellSize <= 0` (which makes every cell index NaN — the insert path survives it by routing to overflow, but the grid is useless and says nothing), inverted bounds (`max < min`), and update/remove of an id never inserted (a silent insert / silent no-op). Note the original form of this item — an `enableSpatialGuards` that warns through `@flighthq/log` — **cannot be built in this package**: core-layer packages may not depend on `@flighthq/log`. See charter Open direction 5.
3. **Brute-force property tests** — randomized insert/update/remove churn compared against an O(n²) reference for pairs, region, point, and ray queries (seeded, deterministic). This is the test shape that catches canonical-cell and DDA edge cases the current 15 tests cannot.
4. **Ray edge-case tests** — a ray passing exactly through cell corners, a ray starting inside an object, and a ray entering the occupied range from far outside.
5. **Extend the brute-force property tests over the overflow path** — item 3's O(n²) reference comparison is now worth more than it was: the grid has two storage paths (cells and overflow) that must agree, and mixed-size churn across the `MAX_INDEXED_CELLS_PER_OBJECT` boundary is exactly where a divergence between them would hide. The 2026-07-30 tests pin the transitions by hand; randomized churn is what would find the case nobody thought to write.

## Backlog

Parked, with why:

- **Quadtree backend (P2)** and **sort-and-sweep backend (P3)** — chartered phases; build order is the user's call, and the seam-signature questions below should settle first.
- **Ray entry-`t` / nearest-first results** — changes the `SpatialIndexBackend` seam in `@flighthq/types`; settle once before backends multiply. Surface to charter Open directions.
- **`SpatialPair` result protocol (objects vs flat interleaved ids)** — same seam-signature category; cross-cuts the header layer.
- **Persistent pair tracking (enter/stay/exit events)** — charter Open direction 3; composition shape (signals layer over raw query vs backend feature) is undecided.

## Approved

- [2026-07-31 · completed] `updateSpatialObject` compares the old and new covered cell ranges and,
  when unchanged, overwrites only the private stored bounds instead of removing and reinserting the
  object across its cells.
