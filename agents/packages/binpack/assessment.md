---
package: '@flighthq/binpack'
updated: 2026-08-01
basedOn: ./review.md
---

# binpack — Assessment

## Recommended

_None open._ All six items landed on 2026-08-01 and are recorded under [Landed](#landed) below.

## Landed

1. ~~**Best-Area-Fit heuristic.**~~ Landed as `BinPackOptions.heuristic`, defaulting to `'bestShortSideFit'`
   so existing packings are byte-identical. Both rules share one primary/secondary comparison; area-fit
   breaks ties on the short side rather than on free-rectangle order, so a leftover-area tie resolves the
   way short-side-fit would.
2. ~~**Occupancy metric.**~~ Landed as `getPackResultOccupancy`. Measures the **reported** extent, so
   power-of-two and square rounding show up as the waste they are — which is the number a caller comparing
   packings wants. Returns 0, not NaN, for an empty result.
3. ~~**`explainUnpackedRectangles`.**~~ Landed in its own module so the packer's bundle pays nothing.
   Separates `oversized` / `regionCollapsed` / `binExhausted`, checks region collapse **first** (when the
   border eats the caps every piece fails for that one reason, and calling each "oversized" would send the
   caller after the rectangles instead of the border), and counts rotation as a real second chance before
   calling a piece oversized.
4. ~~**Edge-case pinning tests.**~~ Landed — and they found a **defect this assessment had assumed away**.
   The item said zero/negative dimensions were "already handled in code — everything → unpacked". They were
   not: a `width: -8` rectangle was **placed**, reporting a negative extent and overlapping its neighbour,
   because a negative side consumes no space in the free-rectangle split. Non-positive sides now go to
   `unpacked`, which is the existing sentinel for "could not be placed".
5. ~~**Seeded fuzz/property test.**~~ Landed: a deterministic LCG (no `Math.random`, which the portability
   gate forbids and which would make a red run unreproducible) over 40 seeds and both heuristics, asserting
   non-overlap with padding as a real gap, containment net of border, `placements + unpacked = input`, and
   re-run determinism.
6. ~~**Drop the redundant placement clone.**~~ Landed; the array is copied, the per-placement object clone
   is gone.

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
