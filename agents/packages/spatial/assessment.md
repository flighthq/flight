---
package: '@flighthq/spatial'
updated: 2026-08-01
basedOn: ./review.md
---

# spatial — Assessment

See [charter](./charter.md) for blessed direction; evidence in [review](./review.md).

## Recommended

_None open._ Re-verified against live source on 2026-08-01 (6 source files, 4 test files, 69 tests,
13 main exports). The completed items are recorded under [Landed](#landed), outside this section so the
TODO generator stops reporting them as work.

## Landed

1. ~~**De-allocate the pair enumeration's cell scan.**~~ Landed. Each cell copies ids into one
   grid-owned scratch array that is cleared and reused, replacing the per-cell `[...ids]` allocation
   without changing the `SpatialPair[]` seam.
2. ~~**Finish the guard coverage `setSpatialIndexingGuard` opened.**~~ Landed. Structured notices now
   identify insert/update/remove and report invalid cell sizes, inverted bounds, and missing-id
   update/remove calls in addition to non-finite bounds and overflow. Invalid cell sizes use the
   bounded overflow path so every query remains correct; inverted bounds decline with `false`.
3. ~~**Add brute-force property tests.**~~ Landed. Four deterministic xorshift seeds drive 400 churn
   steps against independent O(n²) pair, region, point, and ray oracles. A mutation removing half of
   the canonical-cell predicate fails with a duplicate pair at a recorded seed and step.
4. ~~**Add ray edge-case tests.**~~ Landed. Exact cell-corner traversal, origin-inside-object, and
   far-outside occupied-range entry each have direct coverage.
5. ~~**Extend the brute-force properties over overflow.**~~ Landed. Every seed explicitly crosses
   cells→overflow→cells before mixed-size random churn continues across both storage paths.

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
- [2026-08-01 · picked] Pair-scan de-allocation, complete indexing-notice coverage, deterministic
  brute-force properties over cells and overflow, and ray boundary coverage.
