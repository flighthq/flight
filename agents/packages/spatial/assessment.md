---
package: '@flighthq/spatial'
updated: 2026-07-13
basedOn: ./review.md
---

# spatial — Assessment

See [charter](./charter.md) for blessed direction; evidence in [review](./review.md).

## Recommended

Sweep-safe, within-package, no design fork:

1. **`updateSpatialObject` fast path** — in the uniform grid, compare the old and new covered cell ranges; when unchanged, only overwrite the stored bounds instead of remove+reinsert. Behavior-identical, removes the dominant per-frame cost for small movements.
2. **De-allocate the pair enumeration's cell scan** — drop the `[...ids]` spread in `_queryGridPairs` (iterate the set with a reused scratch array on the grid, like `seen`). Keeps the seam signature untouched while honoring the North star's allocation-frugality. (Changing the `SpatialPair` result protocol itself is a seam decision — Backlog.)
3. **`enableSpatialGuards`** — guard module warning on `cellSize <= 0`, non-finite/inverted bounds, and update/remove of an id never inserted (currently a silent insert/no-op). Diagnostics-inversion work; production bundles pay nothing.
4. **Brute-force property tests** — randomized insert/update/remove churn compared against an O(n²) reference for pairs, region, point, and ray queries (seeded, deterministic). This is the test shape that catches canonical-cell and DDA edge cases the current 15 tests cannot.
5. **Ray edge-case tests** — a ray passing exactly through cell corners, a ray starting inside an object, and a ray entering the occupied range from far outside.

## Backlog

Parked, with why:

- **Quadtree backend (P2)** and **sort-and-sweep backend (P3)** — chartered phases; build order is the user's call, and the seam-signature questions below should settle first.
- **Ray entry-`t` / nearest-first results** — changes the `SpatialIndexBackend` seam in `@flighthq/types`; settle once before backends multiply. Surface to charter Open directions.
- **`SpatialPair` result protocol (objects vs flat interleaved ids)** — same seam-signature category; cross-cuts the header layer.
- **Persistent pair tracking (enter/stay/exit events)** — charter Open direction 3; composition shape (signals layer over raw query vs backend feature) is undecided.

## Approved

None.
