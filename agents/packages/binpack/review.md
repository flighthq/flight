---
package: '@flighthq/binpack'
status: solid
score: 82
updated: 2026-09-02
ingested:
  - status.md
  - source
---

# binpack — Review

## Verdict

**solid — 82/100.** A well-structured, thoroughly tested MaxRects bin packer that now delivers both charter-named heuristics (BSSF and BAF), a shakeable diagnostic layer (`explainUnpackedRectangles`), and an occupancy metric. Every 2026-07-10 Decision is met. The 8-point jump from the prior review reflects the area-fit heuristic, the `explain*` query, `getPackResultOccupancy`, and the 40-seed property-test suite that closed several of the previously reported gaps. What remains is the broader toolkit breadth the North star envisions (Skyline/Guillotine families, online allocation) and the zero-consumer state.

## Present capabilities

### Core packer — `packRectangles.ts` (~390 lines, 2 exports)

- **`packRectangles(rects, options?): PackResult`** — MaxRects with two selectable heuristics via `options.heuristic`:
  - `'bestShortSideFit'` (default) — smallest leftover short side, tie-broken by leftover long side, then free-rect position, then unrotated orientation. The classic MaxRects default.
  - `'bestAreaFit'` — smallest leftover area in the free rectangle, tie-broken by short side. Better for uniformly-sized pieces.
  Both scored in `findBestPlacement`, dispatched by a simple branch in the inner loop — the charter's closed-union rationale ("tight loop in a closed system") is honored.
- **`BIN_PACK_DEFAULT_MAX_EXTENT`** (16384) — the cap applied when the caller names none. Exported so consumers computing their own usable region use the same number.
- **`getPackResultOccupancy(result): number`** — fraction of the reported bin covered by placements, in [0,1]. Returns 0 for empty/zero-extent results. Measures the *reported* extent, so power-of-two rounding shows up as waste.
- **MaxRects internals** — `splitFreeRectangles` (up to four sub-rectangles per overlapped free rect, using `intersectsRectangle` from `@flighthq/geometry`), `pruneFreeRectangles` (containment pruning via `isFreeRectangleContained`). All internal, not exported.
- **Padding + border** — geometrically exact via the effective-footprint construction in `packIntoBin`: piece inflated by a trailing `padding` gutter, usable region `bin - 2*border + padding`, so the last row/column's gutter costs no real space.
- **90-degree rotation** (`allowRotation`) — both orientations scored per free rect; `rotated: true` with swapped `width`/`height` in the placement.
- **Fixed vs growable bin** — fixed bin = exactly `maxWidth x maxHeight` with overflow to `unpacked`; growable bin seeds at `sqrt(totalArea)` (clamped to the largest single piece) and doubles the smaller dimension per retry up to the caps. Termination is structural.
- **`powerOfTwo` / `square` finalization** — applied to the tight used extent. Square-then-pot-then-square dance keeps both constraints simultaneously satisfied.
- **Determinism** — `sortRectanglesForPacking` is a documented total order (area desc, height desc, width desc, then `compareRectangleId`: numbers before strings, numeric/lexicographic). No `Math.random`/`Date`.
- **Degenerate-input handling** — zero or negative dimensions route to `unpacked` rather than producing malformed placements.

### Diagnostic layer — `explainUnpackedRectangles.ts` (~80 lines, 1 export)

- **`explainUnpackedRectangles(rectangles, options?): UnpackedRectangleExplanation[]`** — the shakeable `explain*` companion to the silent `unpacked` sentinel. Re-runs the pack (separate pass, no instrumentation of the hot path) and classifies each failure into one of three `UnpackedRectangleReason` values:
  - `'regionCollapsed'` — border consumes the caps; checked first so the caller is sent after the border, not the pieces.
  - `'oversized'` — larger than the usable region in both orientations (rotation counted as a real second chance).
  - `'binExhausted'` — fits in principle but the bin filled.
- Reports `usableWidth`/`usableHeight` (net of border) so the caller sees what the piece was measured against.
- Correctly handles duplicate ids as a multiset (count-based matching, not set membership) — fixed in commit `5979a0e67` after the prior review.

### Types — `@flighthq/types` (`BinPack.ts`, ~100 lines)

All types in the header, per convention: `RectangleId`, `PackableRectangle`, `PackedRectangle`, `BinPackOptions`, `PackResult`, `BinPackHeuristic`, `UnpackedRectangleReason`, `UnpackedRectangleExplanation`. Every field has a doc comment and documented defaults.

### Tests — 29 passing (2 files)

**`packRectangles.test.ts`** (21 tests across 4 `describe` blocks):
- `BIN_PACK_DEFAULT_MAX_EXTENT` — verifies it is the actual cap the packer applies.
- `getPackResultOccupancy` — covered fraction of reported extent (rounding waste visible), 0 for empty.
- `packRectangles` — 20 varied rects with non-overlap + border, growable no-overflow, fixed-bin overflow accounting, exact padding/border geometry, pot/square containment, rotation-required vs growth-instead, determinism, empty input, single rect at border corner, larger-than-fixed and larger-than-growth-cap.
- `packRectangles edge cases` — degenerate dimensions, duplicate ids placed distinctly, non-integer sizes, border-collapsed usable region, padding larger than pieces.
- `packRectangles properties` — 40-seed property test exercising both heuristics, with structural invariants: identity multiset accounting (placed + unpacked = input by count), placement size fidelity (rotation metadata correct), occupancy consistency, border respected, pairwise non-overlap with padding gap, determinism.

**`explainUnpackedRectangles.test.ts`** (8 tests across 2 `describe` blocks):
- Reason classification (oversized vs binExhausted, regionCollapsed, rotation as second chance).
- Usable-extent reporting (net of border).
- Cross-check against `packRectangles`: exactly one entry per unpacked piece with duplicate ids, both-fail case, 30-seed agreement check with count-based id comparison.

### Package shape

- `package.json`: deps exactly `geometry` + `types`, `"sideEffects": false`, two export lanes (`.` and `./contract`).
- `index.ts`: explicit named re-export from contract (`explainUnpackedRectangles`, `getPackResultOccupancy`, `packRectangles`).
- `contract.ts`: `export *` from the two source files.
- No side effects, no renderers, no module-level mutable state.

## Gaps

Measured against the charter's North star ("the complete rectangle-packing toolkit") and a mature bin-packing library:

1. **No Skyline or Guillotine families.** The North star names "MaxRects family" which is delivered, but Open direction 2 gestures at pluggable placement strategies (skyline, guillotine). These are absent and the design seam (strategy registry vs extended union) is unresolved. Not a sweep item.
2. **No multi-bin/multipage packing.** TexturePacker-style spill into bin 2..N instead of `unpacked`. Charter is silent; `PackResult` has no page concept.
3. **No online/incremental allocation.** One-shot only, per the charter Boundary. `@flighthq/glyphatlas` rolled its own incremental shelf packer with no binpack dependency — real internal demand for Open direction 3 already exists, duplicated once.
4. **No sort-strategy option.** Input sort is fixed to area-desc by Decision. Other libraries expose sort-by (perimeter, max-side, width, height, none). Changing this needs direction.
5. **Zero in-repo consumers outside the sdk barrel re-export.** No package imports `@flighthq/binpack` or calls `packRectangles`. The planned consumer (`glyphatlas`) has its own shelf packer and no dependency on binpack. This is not a code defect but a measure of integration maturity.
6. **Minor: the `explain*` query re-runs the full pack.** This is by design (keeps the packer loop free of reporting concerns, as the source comment explains), but for large inputs it doubles the work. A future instrumented path could avoid the re-run without contaminating the hot path, though the current approach is clean and correct.

## Charter contradictions

**None.** Every 2026-07-10 Decision is met:
- `packRectangles(rects, options?): PackResult` — exact signature. The `PackResult` shape matches (`placements`, `width`, `height`, `unpacked`).
- Full options list with documented defaults (`growable` defaults true, `heuristic` defaults `'bestShortSideFit'`).
- `BinPackHeuristic` type includes both `'bestAreaFit'` and `'bestShortSideFit'`, both implemented.
- Plain-data types in `@flighthq/types`.
- Deterministic for same input + options.
- Depends on `geometry` + `types` only.

The Boundaries (no pixels, no atlas, one-shot, layout not compositing) are respected.

## Contract and docs fit

**Package side — clean:**

- Types-first: all eight shared types in `@flighthq/types/BinPack.ts`; implementation imports via `@flighthq/types/contract`.
- Naming: `packRectangles`, `getPackResultOccupancy`, `explainUnpackedRectangles` carry full unabbreviated type names. Internal helpers (`splitFreeRectangles`, `pruneFreeRectangles`, `findBestPlacement`) are self-identifying.
- Sentinels-not-throws: no `throw` anywhere; failure is `unpacked`.
- Diagnostics convention: the silent `unpacked` sentinel has its shakeable `explain*` companion (`explainUnpackedRectangles`), separately importable so the packer's bundle pays nothing for it.
- Two export lanes (`.` public, `./contract` full surface). Both re-export the same three functions + constant.
- `"sideEffects": false`, deps exactly `geometry` + `types`.
- `Readonly<>` on all inputs throughout.
- Tests colocated, one per source file, `describe` blocks mirror exported names.
- Accessor convention: `getPackResultOccupancy` uses the `get*` prefix.

**Candidate doc revisions:**

1. **Package catalog (`catalog.md`, glyphatlas entry) claims "`@flighthq/binpack`-backed batch repack on eviction."** False: `packages/glyphatlas/` has no binpack dependency and no `packRectangles` call; its repack is a self-owned shelf packer. Either the catalog should drop the claim or the wiring is future work that never landed. (Carried from the prior review; still stale.)
2. **Package catalog (`catalog.md`, binpack entry) describes "MaxRects (Best-Short-Side-Fit)" only.** The entry does not mention the area-fit heuristic, `getPackResultOccupancy`, or `explainUnpackedRectangles`, all of which landed since the catalog was last written.

## Candidate open directions

1. **Multi-bin/multipage packing** — charter is silent; result-shape change (`PackResult` gains pages or a `PackResult[]`). Should it be a `packRectanglesIntoBins` sibling, an option, or out of scope?
2. **Shape of heuristic selection** — Open direction 2 gestures at "pluggable placement strategy." The concrete fork is closed-union option (`heuristic: 'bestShortSideFit' | 'bestAreaFit' | ...`, cheap) vs a strategy-registry seam (the codebase-map default once the family grows past MaxRects). Needs settling before Skyline/Guillotine can land.
3. **Should glyphatlas's shelf packer migrate here** when Open direction 3 (online allocator) is built, making binpack the single packing home? Cross-package; ties to doc revision 1 above.
