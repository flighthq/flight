---
package: '@flighthq/filters'
updated: 2026-06-25
basedOn: ./review.md
---

# filters — Assessment

Reasoned over the merge-gate `review.md` (the `integration-b2824e3d8` delta vs the approved `origin/main` base `eb73c3d74`). The delta adds a descriptor-ops / guards / validation / margin / quality spine on top of the base factory layer — purely additive, correct, but shipped **without colocated tests for any of the six new files**, which is a hard `exports:check`-gate violation and the one thing blocking merge. The within-package, sweep-safe fixes are below in Recommended; cross-package, design-fork, and Rust-pass items are parked in Backlog. Design forks and boundary questions are routed to the charter's **Open directions** (noted, not acted on here).

## Recommended

Sweep-safe: within `@flighthq/filters`, no cross-package coupling, no breaking change, no open design decision. Safe for a blanket "do all recommended."

- **Add the six missing colocated test files (`exports:check` gate).** One `*.test.ts` per new source file: `bitmapFilterOps.test.ts`, `bitmapFilterGuards.test.ts`, `bitmapFilterValidation.test.ts`, `bitmapFilterMargin.test.ts`, `blurQuality.test.ts`, `colorMatrixMath.test.ts`, with `describe` blocks alphabetized and mirroring the exports. Pin the behaviors the review names: `normalizeBitmapFilter` idempotence per kind; `getBitmapFilterMargin` per-kind expansion **and** the `out === filter` aliased case; `getBlurPassCountForQuality` at the 1 / 8 / 9 / 15 boundaries; `copyBitmapFilterInto` kind-mismatch throw and `out === source` aliasing; `equalsBitmapFilter` array-awareness and kind mismatch; `clampFilterQuality`/`clampFilterStrength` range edges. This is the merge blocker — required before the delta lands. (review.md → finding #1.)
- **Complete the per-kind guard set to all 14 kinds.** Add `isColorMatrixFilter`, `isConvolutionFilter`, `isDisplacementMapFilter`, `isInnerGlowFilter`, `isInnerShadowFilter`, `isMedianFilter`, `isPixelateFilter`, `isSharpenFilter` alongside the seven existing guards in `bitmapFilterGuards.ts`, each with its colocated test, so the guard family is symmetric and AAA-complete. Within-package, no new cross-package surface. (review.md → finding #3.)
- **Guard-exhaustiveness assertion.** Add a colocated test that every `BitmapFilter` kind enumerated by `isBitmapFilter` is matched by exactly one per-kind `is*` guard — the structural law that keeps the guard set honest as kinds are added. Within-package. (review.md → finding #3.)

## Backlog

Parked: cross-package coordination, a design decision, a boundary question, or the Rust pass. Each notes _why_ it is not sweep-safe.

- **Move `BitmapFilterMargin` to `@flighthq/types` (types-first).** The interface is declared inline in `bitmapFilterMargin.ts` and re-exported from the root, but it is a cross-package type (backends consume it to size intermediate surfaces). Parked rather than swept because no backend consumes it yet and the exact home/shape (a margin record vs a `Rectangle`-style expansion) touches the `filters-*` backend seam — confirm the consumer shape before relocating, and do it as a coordinated header change. (review.md → finding #2.)
- **Registry vs closed union for kind dispatch (Fork B, design).** Whether `normalizeBitmapFilter` / `getBitmapFilterMargin` / `isValidBitmapFilter` / `isBitmapFilter` should dispatch through an open registry keyed by kind (so vendor-prefixed custom filters can participate) or stay closed switches over the built-in set is a blessed-decision-shaped question, especially given `BitmapFilter` is an _open contract_ in types. Not autonomous work — routed to charter Open directions. (review.md → finding #4.)
- **Bevel margin distance offset.** Whether `getBitmapFilterMargin` should add the `distance`-projected offset for bevel / gradient-bevel (as it does for drop-shadow) or treat bevels as centered. Parked — a correctness/semantics ruling that wants a functional-test oracle, not a mechanical fix. (review.md → finding #5.)
- **Backend defaulting de-duplication.** `normalizeBitmapFilter` + the `DEFAULT_FILTER_*` constants are the seam to delete duplicated defaulting in `filters-canvas/css/gl/wgpu/surface`. Parked — it edits five other packages; raise as a coordinated cross-package change.
- **Cross-backend functional/visual scene.** A `tests/functional` scene confirming filter descriptors render consistently across backends. Parked — needs the `functional-test` skill and depends on the backend packages; not isolated to this package.
- **Rust parity (`flighthq-filters` crate).** 1:1 mirror of the ops/guards/validation/margin/quality spine with snake_case free functions and `&mut` out-params, added to the conformance map. Parked to the Rust pass; this is a strong value-typed-leaf conformance target but out of scope for a within-package TS sweep.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

These design/boundary forks were surfaced by the review and belong in `charter.md › Open directions`, not in Recommended:

1. **Fork B — registry vs closed union.** Four dispatchers (`normalizeBitmapFilter`, `getBitmapFilterMargin`, `isValidBitmapFilter`, `isBitmapFilter`) re-close the open `BitmapFilter` contract. Decide registry-by-default vs a deliberately-closed built-in switch. (Already charter Open direction #2; this delta is fresh evidence it is still live.)
2. **`BitmapFilterMargin` home + shape.** Its move to `@flighthq/types` and whether the margin is a bespoke record or reuses a geometry type is a header/boundary decision tied to the `filters-*` backend seam.
3. **Bevel margin model.** Whether bevel margins include the `distance` offset is a descriptor-geometry ruling that wants a backend oracle.
