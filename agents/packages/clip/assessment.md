---
package: '@flighthq/clip'
updated: 2026-07-13
basedOn: ./review.md
---

# clip — Assessment

Sorted from the 2026-07-13 rereview (solid, 83/100). The conservative operations library is complete and charter-conformant; the prior review's two MAJOR objections are closed (contours deep-copy landed; conservative `contains` was blessed by charter Decision #1). The headline change since the last assessment: `@flighthq/path-boolean` now exists and its `PathBooleanBackend` seam consumes clip's exact flat-contour format, so the exact-tier work is unblocked — but its composition shape is a design fork, so it stays parked pending direction.

## Recommended

Sweep-safe: within `@flighthq/clip`, no breaking change, no open design decision.

- **Add the guard/`explain*` diagnostics module.** `enableClipRegionGuards` (via `@flighthq/log`, the SDK-standard pattern) covering the three caller-facing warning comments the inversion rule bans inline: unclosed/odd-length contours in `createClipRegionFromContours`, use-after-release and double-release on the pool bracket. Convention-mandated, separately importable, costs production bundles nothing. — review.md gap #2.
- **Region-vs-region conservative predicates.** `clipRegionContainsClipRegion` / `clipRegionIntersectsClipRegion` over bounds, matching Decision #1's conservative-tier naming (exact variants join the future `*Exact` family). Pure additions in the established style. — review.md gap #3.
- **`setClipRegionToContours` in-place retarget.** Sibling of `setClipRegionToRectangle`: deep-copies the input contours, recomputes bounds via the existing helper, bumps version. Closes the pooled/animated-contour asymmetry. — review.md gap #4.
- **Close the test blind spots.** Contour-form cases for `clipRegionContainsRectangle` / `clipRegionIntersectsRectangle` pinning the conservative contract where it is conservative; alias cases (`out === input`) for `normalizeClipRegion`, `unionClipRegions`, and the contour branch of `transformClipRegion`. — review.md gap #5.
- **Fix the test-file import order** in `clipRegion.test.ts` (`npm run order:fix`). — review.md gap #9.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Exact boolean algebra (`*Exact` functions).** _Parked — design fork, though now unblocked._ The kernel exists (`@flighthq/path-boolean`, and `PathBooleanBackend.computePathBoolean` takes clip's flat contours with no reshaping), but whether clip takes a direct dependency or accepts the backend through a parameter is an open composition decision → charter Open direction #1 (needs rewording to reflect the built kernel). — review.md gap #1.
- **`Float32Array` contour migration.** _Parked — cross-package, design needed._ Blessed by Decision #2, but the flat layout (offsets array vs. sentinel separators) and the `@flighthq/types` `ClipRegion` change coordinate with every backend clip module. Charter Open direction #2 / review candidate direction #3. — review.md gap #6.
- **Functional / visual parity scene.** _Parked — cross-tree._ Needs a `functional/` scene exercising nested clip composition across Canvas/DOM/WebGL; would also be the first in-tree consumer of clip's functions. Charter Open direction #3. — review.md gap #7.
- **Rust `flighthq-clip` crate.** _Parked — separate repo (flight-rs), sequenced after the storage migration._ Charter Open direction #4. — review.md gap #8.
- **`MatteFilter` doc terminology.** _Parked — outside this package's write scope._ Stale post-fork-H references in `packages/types/src/ClipRegion.ts` and this charter; the soft-matte destination needs naming (likely an `@flighthq/effects` composite) — a candidate charter/types revision for the user. — review.md candidate direction #2.

## Approved

_(None — the prior ledger had no entries; approval is the user's verbal gate.)_
