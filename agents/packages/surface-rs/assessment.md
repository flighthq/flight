---
package: '@flighthq/surface-rs'
updated: 2026-07-28
basedOn: ./review.md
---

# surface-rs — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

1. Revert `floodFillBitmap` to the 4-arg reference signature in `surfaceWasm.ts` — delete the `_visited` parameter. Re-establishes identical-signature parity with shipped `@flighthq/bitmap`.
2. Fix two reference call sites in `surfaceWasm.test.ts` — drop `refVisited`/`rsVisited` from `floodFillBitmap` calls and `scratch` from `scrollBitmap` call. Makes `tsc -b` pass.

## Approved

None.

## Backlog

- `floodFillBitmap(..., visited)` hidden-state removal — upstream-first change in `@flighthq/bitmap`, then mirrored here in same merge.
- `scrollBitmap(..., scratch)` and `medianBitmap` hidden-state buffers — same upstream-first discipline.
- `apply*FilterToSurface` interposition gap — `filters-surface-rs` neighbor approved as reasonable direction, exact shape TBD.
- Fingerprint/compare/mismatch wasm bridging — acceptable as JS unless profiling shows value.
- Generated discriminant bridge (Gold-tier) — current guard test sufficient for now.
