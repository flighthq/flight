---
package: '@flighthq/filters'
updated: 2026-06-24
basedOn: ./review.md
---

# filters — Assessment

The Bronze tier and nearly all of Silver from the prior maturation roadmap have landed (kind catalog, guards, clone/copy/equals/normalize, serialization + validation spine, color-matrix preset library, convolution-kernel builders with separability, the quality→passes bridge, and `getBitmapFilterMargin`). What remains splits into a small set of within-package hardening and naming-consistency fixes (Recommended) and a larger set of cross-package, design-fork, and Rust-pass items (Backlog). The maturation roadmap (`reviews/maturation/depth/filters.md`) is fully absorbed here and can be removed.

Design forks and cross-package items are routed to the charter's **Open directions** (noted below, not acted on here); the charter is a stub and the items the review surfaced should seed it.

## Recommended

Sweep-safe: within `@flighthq/filters`, no cross-package coupling, no breaking change, no open design decision. Safe for a blanket "do all recommended."

- **Make the three kind-dispatch switches reference the `*Kind` constants, not string literals.** `normalizeBitmapFilter` (`bitmapFilterOps.ts`), `getBitmapFilterMargin` (`bitmapFilterMargin.ts`), and `isValidBitmapFilter` (`bitmapFilterValidation.ts`) branch on hardcoded `case 'BevelFilter'` literals while the constructors and guards already use the imported constants. Replacing the literals with the `@flighthq/types` constants is the internal-consistency half of the Fork B finding and is purely mechanical — the cases stay a closed switch, only the comparand changes. (review.md → "Closed `switch` on magic kind literals"; the _registry-vs-closed_ half is a design fork, routed to Open directions.) This is the clearest single thing standing between `solid` and `authoritative`.
- **Numeric robustness in the matrix/kernel builders.** NaN/Infinity guarding in the color-matrix and convolution builders, and zero/negative-blur normalization to a clean no-op descriptor in `normalizeBitmapFilter`. Pure within-package edge hardening from the Gold "Robustness & edge cases" list; no API shape change. (roadmap → Gold/robustness.)
- **Deterministic deep-clone coverage for nested gradient arrays.** Confirm and test that `cloneBitmapFilter`/`copyBitmapFilterInto` fully copy nested gradient color/ratio/alpha arrays (not alias them) for `GradientGlow`/`GradientBevel`. The ops are alias-safe by construction per the review; this adds the colocated assertion the Gold tier calls for. (roadmap → Gold/test coverage.)
- **Round out the structural-law tests.** Add the remaining colocated assertions the Gold tier names and that `exports:check` would otherwise leave thin: guard exhaustiveness (every kind matched by exactly one `is*`), `equalsBitmapFilter` reflexive/symmetric, `normalizeBitmapFilter` idempotent, and `fromBitmapFilterData(toBitmapFilterData(f))` round-trip per kind. Within-package, no new surface. (roadmap → Gold/test coverage.)
- **Package README (descriptor reference).** An OpenFL-filter-class → Flight-descriptor mapping plus a color-matrix preset/recipe cheat-sheet, scoped to this package. Documentation only; no code change. (roadmap → Gold/docs.)

## Backlog

Parked: cross-package coordination, a design decision, a new-package proposal, or the Rust pass. Each notes _why_ it is not sweep-safe.

- **Registry vs closed union for kind dispatch (Fork B, design).** Whether `normalize`/`margin`/ `validate` should dispatch through an open registry keyed by `*Kind` (so vendor-prefixed custom filter kinds can participate) or stay a closed built-in switch is a blessed-decision-shaped question, not autonomous work. Parked → routed to charter Open directions. (The constants-in-cases cleanup above is the sweep-safe subset and is recommended on its own.)
- **Backend defaulting de-duplication.** `normalizeBitmapFilter` + the `DEFAULT_FILTER_*` constants are the seam to delete the duplicated defaulting in `filters-canvas/css/gl/wgpu/surface`. Parked — it edits five other packages; raise as a coordinated cross-package change, not within-package work.
- **Cross-backend functional/visual scene.** A `tests/functional` scene rendering color-matrix and convolution presets across Canvas/DOM/WebGL for visual parity. Parked — needs the `functional-test` skill and depends on the backend packages rendering the descriptors; not isolated to this package.
- **Exact-form (LUT) path for the approximate presets.** `createColorBalanceColorMatrix` and `createLevelsColorMatrix` cannot be exact as a 4×5 affine and point at a nonexistent LUT path. Parked — whether to ship an exact `*ColorLut` builder here or hand off to `filters-surface` is a boundary decision against `surface`/`filters-surface`. Routed to charter Open directions.
- **`enableBitmapFilterSignals` group.** Live-mutation change notification for editors/inspectors, dispatched via `@flighthq/signals`. Parked pending the intentional `@flighthq/signals` dependency decision (and whether live filter-stack mutation is in scope for this package at all). Routed to charter Open directions.
- **`@flighthq/filters-formats` neighbor.** An importer for OpenFL/SWF/Lottie filter blobs. Parked — it is a new `-formats` triad cell and fails the **plurality guard** today (no plurality of import formats on the roadmap). Revisit only when a concrete format is requested; surface to the user before building.
- **Constructor throw policy.** `createColorMatrixFilter` throws on wrong length while the validators and `fromBitmapFilterData` return sentinels. Parked — settling throw-vs-sentinel for the whole `create*` family is a design ruling, not a mechanical fix. Routed to charter Open directions.
- **Rust parity (`flighthq-filters` crate).** 1:1 mirror of the descriptor/preset/blur math with snake_case free functions and `&mut` out-params, added to the conformance map and a parity scene. Parked to the Rust pass per the conformance map; this crate is a strong early value-typed-leaf conformance target but is out of scope for a within-package TS sweep.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._
