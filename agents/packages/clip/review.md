---
package: '@flighthq/clip'
status: solid
score: 83
updated: 2026-07-13
ingested:
  - charter.md (lastDirection 2026-07-02, 4 decisions)
  - status.md (builder Phase 3 entry + as-claimed 2026-06-24 report)
  - prior review.md (2026-06-25 merge review, 78/100) — continuity
  - prior assessment.md (2026-07-02)
  - packages/clip/src/clipRegion.ts + clipRegion.test.ts + index.ts + package.json (full, live worktree)
  - packages/types/src/ClipRegion.ts, packages/types/src/PathBooleanBackend.ts
  - packages/path-boolean/src (surface scan — kernel-home evidence)
  - agents/packages/CONTRACT.md, structural-forks.md, agents/index.md
---

# clip — Review

> Rereview at HEAD (post `0ee47767`), replacing the 2026-06-25 merge review. Both of that review's MAJOR objections are closed: `createClipRegionFromContours` now deep-copies with `Readonly` input (`clipRegion.ts:83-91`, tests assert non-observation of later caller edits), and the conservative `clipRegionContainsRectangle` behavior was **charter-blessed** by Decision #1 (2026-07-02) as the fast-path tier, with `*Exact` variants chartered for later. The `package.json` description reword also landed. Since then the only source change is the SDK-wide rename `clipRegionsEqual` → `equalsClipRegion` (`0ee47767`), aligning with the `equals*` family.

## Verdict

**solid — 83/100.** The conservative clip-region operations library is complete, house-style-clean, and fully tested (23 exports, 56 colocated tests, alias cases on the main out-param functions). What separates it from authoritative is the chartered-but-unbuilt exact tier (`*Exact` algebra — now genuinely unblocked, see below), the absence of the guard/`explain*` diagnostics layer the SDK's inversion rule requires, and the parked `Float32Array` storage migration.

## Present capabilities

All in `packages/clip/src/clipRegion.ts`, exported through a single root barrel; `sideEffects: false`; deps exactly `geometry` + `path` + `types`.

- **Constructors (6):** `createClipRegionFromRectangle` (scissor-eligible, clones input), `createClipRegionFromPath` (flattens via `@flighthq/path` `flattenPath`, carries `path.winding`), `createClipRegionFromContours` (deep-copies, `Readonly` input), `createClipRegionFromCircle` / `createClipRegionFromEllipse` / `createClipRegionFromRoundedRectangle` (cubic-Bezier builders over `appendPath*`, KAPPA constant; rounded-rect falls back to plain rect at `radius <= 0`).
- **Composition (conservative tier):** `intersectClipRegions` (rect∩rect exact and scissor-eligible; disjoint → empty; mixed/contour forms keep contours with bounds-intersected rect), `unionClipRegions` (`mergeRectangle` bounds; contour heuristic keeps the input with more sub-paths). Both alias-safe via locals-first reads, both bump `version`.
- **Queries:** `clipRegionContainsPoint` (rect fast-reject then exact winding-number ray-cast in `pointInContours`, both `nonZero` and `evenOdd`), `clipRegionContainsRectangle` / `clipRegionIntersectsRectangle` (bounds-based, conservative per Decision #1), `getClipRegionBounds`, `isClipRegionEmpty`, `isClipRegionRectangular`, `equalsClipRegion` (structural, version-independent).
- **Transform:** `transformClipRegion` — axis-aligned matrices keep the rect form (scissor-eligibility invariant, North star #2); rotation/skew promotes to a 4-point quad contour; contour form transforms every point and recomputes bounds. Alias-safe.
- **Canonicalization:** `normalizeClipRegion` — promotes a single-contour 4-point axis-aligned quad (within `NORMALIZE_EPSILON`) back to the scissor-eligible rect form; copies through otherwise.
- **Lifecycle:** `cloneClipRegion` / `copyClipRegion` (deep copies; copy no-ops on identity), `setClipRegionToRectangle` (in-place retarget), `invalidateClipRegion` (`>>> 0` wrap), `acquireClipRegion`/`releaseClipRegion` pool bracket (reset-on-acquire, module-level pool at file bottom).
- **Tests:** `clipRegion.test.ts`, 23 alphabetized `describe` blocks mirroring every export, 56 cases: pool reuse/reset/identity, alias cases (`intersectClipRegions` ×2, `copyClipRegion`, `transformClipRegion` rect form), rect and contour paths for point queries, disjoint intersection, winding preservation, rotation promotion, all five `normalizeClipRegion` branches including the 90°-rotation round-trip.

## Gaps

Judged against the charter (which speaks clearly here) plus a mature clip-region library within the conservative tier:

1. **The exact tier does not exist — and is now unblocked.** No `intersectClipRegionsExact` / `subtractClipRegionsExact` / `unionClipRegionsExact` / `xorClipRegionsExact` / `clipRegionContainsRectangleExact`. Charter Open direction #1 asked where the kernel would live; **that question is answered**: `@flighthq/path-boolean` exists, and its `PathBooleanBackend.computePathBoolean(subject, clip, op, fillRule)` seam (`packages/types/src/PathBooleanBackend.ts`) takes *exactly* clip's storage — flat `readonly number[]` contour rings, "the same flat shape `flattenPath` emits". Clip's `*Exact` functions can compose contours-in/contours-out with no reshaping. Remaining design question: direct dependency on `@flighthq/path-boolean` vs. accepting the backend through a parameter/seam (tree-shaking favors separate importability either way).
2. **No diagnostics layer.** Three caller-facing warning comments — "caller is responsible for providing valid, closed contours" (`createClipRegionFromContours`), "must not use the region after release" / "initialize the acquired region immediately" (pool bracket) — are, per the inversion rule, missing guards, not comments. No `enableClipRegionGuards`, no `explain*` query for the conservative-answer cases.
3. **Missing region-vs-region predicates.** `clipRegionContainsRectangle`/`clipRegionIntersectsRectangle` exist, but there is no `clipRegionContainsClipRegion` / `clipRegionIntersectsClipRegion` (conservative over bounds) — the queries a culling or nested-clip consumer reaches for first.
4. **In-place retarget asymmetry.** `setClipRegionToRectangle` exists; there is no `setClipRegionToContours`, so pooled/animated contour-clip workflows must hand-assign fields (bypassing the bounds recompute and version bump).
5. **Test blind spots.** No contour-form cases for `clipRegionContainsRectangle` / `clipRegionIntersectsRectangle` (the conservative contract is untested exactly where it is conservative); no alias case for `normalizeClipRegion`, `unionClipRegions`, or the contour branch of `transformClipRegion`.
6. **`Float32Array` contour storage** — blessed (Decision #2) but undesigned; the per-contour `.map((c) => c.slice())` copies and `new Array` allocations in `transformClipRegion` are the cost it removes. Cross-package (`@flighthq/types` + every backend clip module).
7. **No functional/visual scene** exercises clip composition across backends (charter Open direction #3); notably, no in-tree code imports `@flighthq/clip` functions today (backends consume the `ClipRegion` *type* from `@flighthq/types` directly) — a functional scene would be the first real consumer.
8. **Rust `flighthq-clip` crate** — does not exist; lives in the separate flight-rs repo, sequenced after the storage migration.
9. **Lint nit:** the import list in `clipRegion.test.ts` is out of canonical order (`equalsClipRegion` sorted between `clipRegionIntersectsRectangle` and `cloneClipRegion`); `npm run order:fix` territory.

## Charter contradictions

**None.** The code honors every Decision: conservative names unchanged (Decision #1), contours deep-copied, winding consumed but not converted (Decision #3, `pointInContours` duplication explicitly justified there), rasterization/soft-masking/trait-wiring all absent (Decision #4). Scissor-eligibility is preserved everywhere the charter demands (transform, rect∩rect, normalize). The prior review's contains-direction objection is now settled charter policy, not a contradiction.

## Contract & docs fit

**Package vs contract — strong.** Types live in `@flighthq/types`; every export carries the full unabbreviated `ClipRegion` name; `is*`/`get*`/`equals*` verb conventions hold (the `0ee47767` rename closed the last inconsistency); `Readonly<>` on all inputs; out-params with locals-first alias safety; sentinels not throws; allocation verbs honored (`create*`/`clone*`/`acquire*` allocate, `copy*`/`set*`/compose write to `out`); pool bracket paired; module-level state at file bottom; single root export, `sideEffects: false`. The one contract shortfall is the diagnostics inversion rule (gap #2).

**Docs needing revision (candidate revisions, user's gate):**

- **`MatteFilter` is stale vocabulary.** The `ClipRegion` type doc (`packages/types/src/ClipRegion.ts:6`) and this charter's "What it is"/North star #3 both delegate softness to "MatteFilter" — but fork H (2026-07-11) dissolved `@flighthq/filters`; no `MatteFilter` exists anywhere in the tree. The soft-matte home is now presumably an `@flighthq/effects` composite. Both docs should name the real destination.
- **Charter Open direction #1 is resolved by events.** The kernel home is `@flighthq/path-boolean` (built, full AAA per the Package Map). The direction should be rewritten from "decide the kernel's home" to "decide clip's composition shape over the existing `PathBooleanBackend` seam".
- The Package Map line for clip ("constructors, composition, queries, transform, pool bracket") is accurate; no change needed.

## Candidate open directions

1. **Composition shape for the exact tier:** direct `@flighthq/path-boolean` dependency vs. passing a `PathBooleanBackend` in — the seam's flat-contour contract matches clip's storage byte-for-byte, so either is thin. Also whether `subtractClipRegions` gets a conservative form (result = `a`'s bounds is a valid over-approximation) or arrives exact-only.
2. **Post-fork-H softness naming:** what replaces "MatteFilter" in clip-adjacent docs (charter + types doc).
3. **`Float32Array` layout** (offsets array vs. sentinel separators) — unchanged from charter Open direction #2, still needs design before the Rust seam locks.
