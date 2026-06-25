---
package: '@flighthq/surface-rs'
updated: 2026-06-25
basedOn: ./review.md
---

# Assessment: @flighthq/surface-rs (merge gate — integration-b2824e3d8)

> Sorts the review's findings into what an in-package sweep may do now (Recommended), what is parked (Backlog), and what is frozen-approved (Approved — empty until the user's verbal gate). Cross-package and design forks route to the charter's Open directions, not here. Reasoned over `./review.md` (the 2026-06-25 merge-gate review of the head-vs-base delta; supersedes the prior 2026-06-24 authoritative-94 assessment, which judged the package in the live worktree rather than as a merge candidate).

surface-rs is the **lead Wasm-mixing leaf** ([structural fork D](../structural-forks.md#d-two-seam-dimensions--runtime-backend-vs-wasm-mixing-distinguish)) — the value-in/value-out drop-in over `flighthq-surface-wasm`, `crate: null` by design. Its identity rule is that its signatures are **byte-and-shape-identical to the `@flighthq/surface` that actually ships**. The integration-b2824e3d8 delta is mostly excellent test-hardening, but it violated that identity rule for `floodFillSurface` by tracking an _intended_ upstream signature that never landed, which is what holds this assessment's Recommended list to "realign, then merge the rest."

## Recommended (sweep-safe, within-package)

All within `packages/surface-rs/` (source + colocated test) — pure realignment to the dependency that already exists in the tree. No design decision, no new public surface, no cross-package edit.

- **Revert `floodFillSurface` to the 4-arg reference signature.** In `surfaceWasm.ts` restore `export function floodFillSurface(out: Surface, x: number, y: number, color: number): void`, delete the `_visited` parameter and its (false) explanatory comment. The wasm body already ignores any visited buffer, so no body change is needed. Re-establishes identical-signature drop-in parity with `@flighthq/surface`'s unchanged `floodFillSurface`. — review.md defect 1 + 3.
- **Fix the two reference call sites in `surfaceWasm.test.ts`.** Restore `reference.floodFillSurface(refSurface, 4, 4, 0xff8800ff)` (drop `refVisited`/`rsVisited`) and `reference.scrollSurface(refSurface, 2, -1)` (drop the `scratch` local). The surface-rs `scrollSurface` export is already 3-arg-correct; only the test's _reference_ call was wrongly widened. Makes `tsc -b` pass again. — review.md defect 2.
- **Keep every other test addition as-is.** Shadow-conformance gate, discriminant-cardinality describes, palette-map all-null/alpha-only, aliased-in-place version tests, wasm-memory-growth stability, sub-region marshalling, zero-area edge cases, and the discriminant-drift comments in `surfaceWasm.ts` all merge unchanged. — review.md §"approve-as-is".

## Backlog (parked, with reason)

- **The intended `floodFillSurface(..., visited)` / `scrollSurface(..., scratch)` hidden-state removal.** A real, desirable change — both reference functions still use module-level mutable buffers (`_floodFillVisited` in `surfaceFill.ts:4`, the scroll scratch in `surfaceTransform.ts`), the no-hidden-state violation the SDK wants gone. **Parked because it is a `@flighthq/surface` change, not a `surface-rs` change**, and it did not land in this integration. surface-rs must not lead its own dependency. When the upstream signature change is authored and merged in `@flighthq/surface` (with the paired Rust `flood_fill_surface`/`scroll_surface` divergence recorded in the conformance map), surface-rs re-adds the parameter **in that same merge** — not before.
- **Median hidden-state buffer (`surfaceMedian.ts`).** Same category, same owner (`@flighthq/surface`, not surface-rs). Parked here only so the binding-side `EXPECTED_WASM_SHADOWS` / discriminant tests are updated in lockstep if/when that signature changes.
- **`apply*FilterToSurface` interposition gap and unaccelerated fingerprint/compare scans.** Unchanged from the prior assessment; correctly deferred as cross-boundary / fork-D design questions. Not touched by this delta.

## Approved

_None. Approval is the user's verbal gate; this section is an append-only ledger written only when the user blesses an item. Nothing is frozen yet._

## Notes for the charter's Open directions

- **surface-rs signatures track the _shipped_ `@flighthq/surface`, never an intended one.** This is the package's identity rule and the root cause of this merge gate: the delta changed the binding first, against a surface that never changed. The charter's North star should state it explicitly.
- **Hidden-state removal is an upstream-first, paired change.** `floodFillSurface`, `scrollSurface`, and `medianSurface` carry module-level mutable buffers in `@flighthq/surface`. The deliberate fix (caller-provided scratch) must originate in `@flighthq/surface`, ship with the matching `flighthq-surface` Rust divergence in the conformance map, and only _then_ be mirrored here.
- **Conformance-map ownership.** Any intentional TS↔Rust scratch-vs-clone divergence belongs in the conformance divergence map (separate owner), not only in a status doc or a binding-side comment.
