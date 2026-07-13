---
package: '@flighthq/binpack'
status: solid
score: 74
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# binpack — Review

_Note: the cell contains only `charter.md`; no `status.md` exists yet, so there was no continuity log to ingest._

## Verdict

**solid — 74/100.** A textbook-correct, well-commented, well-tested MaxRects (BSSF) one-shot packer that fully delivers the charter's 2026-07-10 Decisions — but it is one heuristic of the two the North star names, with none of the toolkit breadth (heuristic variants, occupancy metrics, `explain*` diagnostics) a mature rectangle-packing library carries.

## Present capabilities

All in one source file, `packages/binpack/src/packRectangles.ts` (single export, ~330 lines, heavily documented with durable semantic comments):

- **`packRectangles(rects, options?): PackResult`** — the exact signature the charter Decision specifies. MaxRects with the Best-Short-Side-Fit heuristic (`findBestPlacement`: smallest leftover short side, tie-broken by leftover long side, then free-rect order, then unrotated orientation).
- **MaxRects core** — `splitFreeRectangles` (up to four sub-rectangles per overlapped free rect, using `intersectsRectangle` from `@flighthq/geometry`) and `pruneFreeRectangles` (containment pruning via `isFreeRectangleContained`).
- **Padding + border, geometrically exact** — the effective-footprint construction (`packIntoBin`: piece inflated by a trailing `padding` gutter, usable region `bin − 2·border + padding`) guarantees ≥ `padding` between neighbors and ≥ `border` from every edge without wasting the last row/column's gutter. The test asserts exact placements (`{x: 4, y: 4}` / `{x: 16, y: 4}` for padding 2 / border 4).
- **90° rotation** (`allowRotation`) — both orientations scored per free rect; `rotated: true` with swapped `width`/`height` in the placement. Tested in both the fits-only-rotated and grows-instead cases.
- **Fixed vs growable bin** — fixed bin = exactly `maxWidth × maxHeight` with overflow to `unpacked`; growable bin seeds at `√(totalArea)` (clamped to the largest single piece) and doubles the smaller dimension per retry up to the caps (`DEFAULT_MAX_EXTENT = 16384`). Termination is structural (doubling reaches the cap in log steps).
- **`powerOfTwo` / `square` finalization** — `finalizeResult`/`ceilToPowerOfTwo`, applied to the tight used extent, with the square-then-pot-then-square dance keeping both constraints simultaneously satisfied.
- **Determinism** — `sortRectanglesForPacking` is a documented total order (area desc, height desc, width desc, then `compareRectangleId`: numbers before strings, numeric/lexicographic), no `Math.random`/`Date`; the deep-equal-twice test pins it.
- **Reporting** — placements + tight used `width`/`height` + `unpacked` ids, per the charter's Boundary ("layout, not compositing").
- **Header-first types** — `RectangleId`, `PackableRectangle`, `PackedRectangle`, `BinPackOptions`, `PackResult` live in `packages/types/src/BinPack.ts` with full per-field doc comments and documented defaults.
- **Tests** (`packRectangles.test.ts`, 12 cases) — pairwise non-overlap on 20 varied rects, growable no-overflow, fixed-bin overflow accounting (placed + unpacked = total), exact padding/border geometry, pot/square containment, rotation required vs growth instead, determinism, empty input, single rect at border corner, larger-than-fixed-bin and larger-than-growth-cap unpacked.

## Gaps

Measured against a textbook rectangle-packing library (RectangleBinPack / rectpack2D / rectpack):

1. **One heuristic only.** The North star names "MaxRects family — best-area / best-short-side-fit"; only BSSF exists. Best-Area-Fit (BAF) is charter-named and absent. The wider family — BLSF, Bottom-Left, Contact-Point — is likewise absent (that breadth is Open direction 2 territory).
2. **No Guillotine or Skyline families.** Skyline (bottom-left / min-waste) is the standard cheap-and-good atlas packer; Guillotine matters for texture-page workloads with split-rule control. Explicitly parked in Open direction 2 (pluggable strategy), so a design question, not a sweep item.
3. **No online/incremental packing.** One-shot only, per the charter Boundary. Notably, `@flighthq/glyphatlas` — the in-repo dynamic-atlas consumer — rolled its **own** incremental shelf packer (`glyphAtlas.ts` `packBottom` shelf state) and has **no binpack dependency at all**. Real internal demand for Open direction 3 exists, already duplicated once.
4. **No multi-bin packing.** TexturePacker-style multipage output (spill into bin 2..N instead of `unpacked`) is standard in atlas tooling; `PackResult` has no page concept. Charter is silent — a candidate open direction.
5. **No occupancy/utilization metric.** Every packing tool reports used-area ÷ bin-area; a caller comparing options (rotation on/off, pot on/off) must recompute it by hand.
6. **No `explain*` for `unpacked`.** `unpacked` reports *that* an id failed but never *why* (exceeds the cap even rotated, fixed bin full, `maxWidth < 2·border`). Per the diagnostics convention, a silent-ish sentinel wants a shakeable `explain*` query.
7. **No sort-strategy option.** The input sort is fixed (area desc). rectpack2D-class libraries expose sort-by (perimeter, max-side, width, height, none) since it materially changes results — but the fixed sort is written into a charter Decision, so changing it needs direction, not a sweep.
8. **Edge cases undefined/untested** — zero- or negative-dimension rectangles, duplicate ids, non-integer sizes, `border` so large the usable region is non-positive (handled: everything → `unpacked`, but untested), padding larger than the pieces. Behavior should be pinned by tests even where the answer is "garbage in, unpacked out".
9. **No seeded fuzz/property coverage.** The invariants (no pairwise overlap, in-bin, padding/border respected, placed + unpacked = input) are ideal property-test material; path-boolean set the repo precedent.
10. **Minor allocation slack.** `finalizeResult` re-clones every placement (`{ ...placement }`) even though `packIntoBin`'s array is function-local and fresh — a redundant per-rect allocation against the North star's "allocation-conscious" clause. Cosmetic, not behavioral.

## Charter contradictions

**None.** The implementation matches every 2026-07-10 Decision precisely — signature, `PackResult` shape, the full options list with the documented defaults (`growable` defaulting true included), deterministic total-order sort, plain-data types in the header. The Boundaries (no pixels, no atlas, one-shot) are respected. The only daylight is North-star *incompleteness* (best-area named but unbuilt), which is a gap, not a contradiction.

## Contract & docs fit

**Package side — clean:**

- Types-first: all five shared types in `@flighthq/types` (`BinPack.ts`), implementation imports them. ✓
- Naming: `packRectangles` carries the full subject; internal helpers (`splitFreeRectangles`, `pruneFreeRectangles`, `findBestPlacement`) are self-identifying; no abbreviations. ✓
- Sentinels-not-throws: no `throw` anywhere; failure is `unpacked`. ✓
- Single root export (`index.ts` → `./packRectangles`), `"sideEffects": false`, deps exactly `geometry` + `types`, module constants (`DEFAULT_MAX_EXTENT`) at the bottom of the file. ✓
- `Readonly<>` on inputs throughout, including `readonly Readonly<PackableRectangle>[]`. ✓
- Tests colocated, one per source file, invariant-based. ✓
- Rust-crate mirror (`flighthq-binpack` per the charter front matter): not verifiable from this repo (flight-rs is separate); noted, not judged.

**Candidate doc revisions (stale admin docs):**

1. **Package Map (`agents/index.md`, glyphatlas entry) claims "`@flighthq/binpack`-backed batch repack on eviction".** False today: `packages/glyphatlas` has no binpack dependency and no `packRectangles` call; its repack is a self-owned shelf packer. Either the map should drop the claim or the wiring it describes is future work that never landed — worth the user's call, since it also bears on Open direction 3.
2. The prompt-level assumption that glyphatlas is a "known consumer" propagates from the same stale line; as of this review binpack has **zero in-repo consumers** outside the sdk barrel re-export.

## Candidate open directions

1. **Multi-bin/multipage packing** — charter is silent; result-shape change (`PackResult` gains pages or a `PackResult[]`). Should it be a `packRectanglesIntoBins` sibling, an option, or out of scope?
2. **Shape of heuristic selection** — Open direction 2 gestures at "pluggable placement strategy"; the concrete fork is closed-union option (`heuristic: 'bestShortSideFit' | …`, cheap, fork-B "tight loop in a closed system") vs a strategy-registry seam (fork-B default once the family grows past MaxRects). Needs settling before Skyline/Guillotine land.
3. **Should glyphatlas's shelf packer migrate here** when Open direction 3 (online allocator) is built, making binpack the single packing home? Cross-package; ties to doc revision 1 above.
4. **Sort strategy as an option** — the fixed sort is a Decision; exposing `sortBy`/`sort: false` would amend it. Worth a ruling only when a consumer needs it.
