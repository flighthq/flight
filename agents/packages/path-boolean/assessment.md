---
package: '@flighthq/path-boolean'
updated: 2026-07-13
basedOn: ./review.md
---

# path-boolean — Assessment

See [charter](./charter.md) for blessed direction; evidence in [review](./review.md).

## Recommended

Sweep-safe: within `@flighthq/path-boolean`, no cross-package coupling, no breaking change, no open design fork.

1. **Add `out?: Path` to `offsetPath` and `simplifyPath`.** Non-breaking optional-parameter addition matching `booleanPaths`/`unionAllPaths` and the charter's out-param decision; include the aliased-`out` test each (`out` = the input path).
2. **DRY the contour→path rebuild loop.** The identical "ring → moveTo/lineTo/close, skip <6" loop appears in `booleanPaths.ts` (`writeContours`), `unionAllPaths.ts` (inline), and `resolvePathRegions.ts`. Extract one module-private helper (file-exported for its colocated test, not barrelled, like `resolvePathRegions`).
3. **`explain*` queries for the silent empty-path sentinels.** Per the diagnostics convention, the expected-failure sentinels — over-deflation collapse dropping a ring, degenerate/too-few-vertex input, zero-area contours — should each be answerable by a shakeable plain-data query (e.g. `explainPathOffsetResult`); keep it data-only so it adds no `@flighthq/log` dependency (a guard module can come later with `debug` wiring).
4. **Durable re-entrancy comment on the backend seam.** `martinezKernel.ts`'s module-scoped `vertexSnap`/`nextEventId` make the default kernel single-entrant; record that constraint on `PathBooleanBackend`'s doc comment (types-side wording is one sentence; the hazard is real if a backend composes booleans internally).
5. **Same-winding self-overlap fuzz invariant.** The status log's corrected discriminator (two same-wound overlapping rings: nonZero fills, evenOdd punches) exists as unit tests; add it as a 40-iteration fuzz invariant so the evenOdd/nonZero divergence is exercised on random inputs, not just the fixed square/pentagram cases.

## Backlog

Parked, with why:

- **Open-path (polyline) clipping** — cross-package: needs `flattenPath` in `@flighthq/path` to carry per-subpath closedness, plus a kernel notion of unclosed subject edges. Also the true fix for the closed-vs-open inference caveat in `offsetPath`. Waiting on an Open direction.
- **Minkowski sum/difference** — scope decision the charter is silent on; surface to the charter's Open directions before building.
- **PolyTree-style hierarchical result (parent/hole nesting)** — an output-shape design fork on the `PathBooleanBackend` contract; not sweep-safe.
- **Deflation hardening for densely tessellated rings** — edge-length-aware inner joins / reflex-only vertex routing; geometry-correctness work large enough to be its own gated pass with its own degeneracy bar (the round-join double-offset failure is the acceptance test).
- **Performance/allocation pass** (O(n²) classification, string-keyed maps, linear `findStatus`, per-event allocation) — the charter deliberately bought correctness over speed in the default kernel; perf belongs to the chartered swap-in tier (Clipper-faithful port / wasm `path-boolean-rs`), not to churning the reference kernel.
- **Exact predicates / snap-rounding robustness tier** — beyond the blessed floating-point + relative-epsilon design; would be a different kernel behind the same seam.
- **Batch symmetry (`intersectAllPaths` etc.)** — charter chartered batch *union* only; unclear demand, park until a consumer asks.
- **Charter/doc touch-ups from the review** (drop the stale `@flighthq/geometry` mention, record the `cleanPath`-lives-in-`path` split, temper the Package Map's "full AAA set", add `by:` to status.md front matter) — charter and admin-doc edits are the user's gate, not a sweep.

## Approved

None.
