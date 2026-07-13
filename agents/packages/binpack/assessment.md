---
package: '@flighthq/binpack'
updated: 2026-07-13
basedOn: ./review.md
---

# binpack — Assessment

## Recommended

Sweep-safe: within `@flighthq/binpack` (plus its own header file `types/src/BinPack.ts`), additive, no open design fork.

1. **Best-Area-Fit heuristic** (review gap 1). The North star explicitly names "best-area / best-short-side-fit"; only BSSF exists. Add `BinPackOptions.heuristic?: 'bestShortSideFit' | 'bestAreaFit'` (default `'bestShortSideFit'`, so existing results are unchanged) selecting the scoring inside `findBestPlacement`. This is fork-B's sanctioned closed-union case (a tight loop in a closed system, two members); the broader pluggable-strategy seam of Open direction 2 stays open and can supersede the option when Skyline/Guillotine arrive.
2. **Occupancy metric** (review gap 5). A pure free function `getPackResultOccupancy(result): number` (placed area ÷ `width·height`, `0` for an empty result) so callers can compare packings without hand-rolling the math. Standard in every packing tool; no result-shape change.
3. **`explainUnpackedRectangles(rects, options): …`** (review gap 6). Per the diagnostics convention, the `unpacked` sentinel gets a shakeable `explain*` query returning plain data per failed id — exceeds the cap even rotated / fixed bin exhausted / usable region non-positive (`maxWidth < 2·border`). Separately importable, costs the packer's bundle nothing.
4. **Edge-case pinning tests** (review gap 8). Define-and-test: zero/negative-dimension rects, duplicate ids, non-integer sizes, `border` collapsing the usable region (already handled in code — everything → `unpacked` — but unasserted), padding larger than the pieces.
5. **Seeded fuzz/property test** (review gap 9). Deterministic seeded generator over sizes/options asserting the invariants (pairwise non-overlap, within-bin with border, padding respected, `placements + unpacked = input`, deep-equal on re-run) across many seeds — the path-boolean precedent applied here.
6. **Drop the redundant placement clone in `finalizeResult`** (review gap 10). `packIntoBin`'s array is function-local and fresh; the `{ ...placement }` re-clone per rect is pure allocation slack against the North star's allocation-conscious clause. Behavior-identical cleanup.

## Backlog

Parked, with why:

- **Skyline + Guillotine families, and MaxRects BLSF/BL/CP** (review gaps 1–2) — parked on **charter Open direction 2**: the pluggable-strategy shape (closed union vs strategy registry, fork B on growth) must be settled before the family grows past two heuristics. Adding them now would bake in a seam design the user hasn't blessed.
- **Online/incremental allocator** (review gap 3) — parked on **charter Open direction 3** and explicitly outside the current Boundary ("offline/build-time packing... not an incremental runtime allocator"). Note for the direction session: `@flighthq/glyphatlas` already rolled its own shelf packer with no binpack dependency — real demand, one duplication already; whether that packer migrates here is a cross-package call.
- **Multi-bin/multipage packing** (review gap 4) — parked as a **candidate open direction**: the charter is silent and the result shape must change (pages in `PackResult` vs a sibling function). A design decision, not a sweep.
- **Sort-strategy option** (review gap 7) — parked because the fixed deterministic sort is written into a **charter Decision** (2026-07-10); exposing `sortBy` amends a blessed ruling and should wait for a consumer that needs it plus the user's call.
- **`@flighthq/textureatlas-packer` neighbor** — charter Open direction 1; a new package (bedrock test + user bless), cross-package by definition.
- **Package Map correction** (review: contract & docs fit) — the glyphatlas entry's "`@flighthq/binpack`-backed batch repack" claim is stale (no such dependency exists). Fixing `agents/index.md` is an admin-doc edit outside this package's sweep scope; flagged for the user alongside the Open-direction-3 discussion it feeds.

## Approved

None.
