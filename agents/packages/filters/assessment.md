---
package: '@flighthq/filters'
updated: 2026-07-02
basedOn: ./review.md
---

# filters — Assessment

Sorted from the depth review (70/100 — test blocker and guard asymmetry since resolved in live tree), verified against the live tree (75 exports, 225 tests, 22 source files, all 14 guards present), and the direction session (2026-07-02). Six charter decisions blessed, most significantly the registry migration.

The package is mature — 14 filter kinds with full type coverage, factories, guards, color-matrix preset library, convolution kernels, serialization, validation. The major remaining work is the registry migration (architectural) and the `BitmapFilterMargin` type relocation.

## Recommended

Sweep-safe: within `@flighthq/filters` and `@flighthq/types`, no open design decision beyond what the charter has blessed.

1. **Move `BitmapFilterMargin` to `@flighthq/types`.** Per charter Decision #2. The margin type is defined inline in `bitmapFilterMargin.ts` and consumed by renderers. Move the interface to `packages/types/src/BitmapFilterMargin.ts`, add to the types barrel, update imports in `filters`. Run `npm run packages:check`.

2. **Update Package Map description for filters.** The codebase map's description understates the package (omits presets, kernels, serialization, validation, margin). Add a more complete one-liner. Per charter Open direction #5.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Registry migration for utility dispatch.** _Parked — architectural._ Blessed (Decision #1). Convert `getBitmapFilterMargin`, `cloneBitmapFilter`, `normalizeBitmapFilter`, `isValidBitmapFilter` from closed `switch(kind)` to open registries. Built-in 14 kinds self-register. Largest remaining item — touches multiple functions and potentially the backends.

- **Bevel margin distance offset.** _Parked — open direction._ The margin calculation for bevel filters may omit the distance offset. Needs verification with a functional test oracle.

- **Backend defaulting de-duplication.** _Parked — cross-package._ A shared defaulting function in `filters` could remove ~150 lines of duplicated logic across 5 backend packages.

- **Constructor throw policy symmetry.** _Parked — open direction._ `createColorMatrixFilter` throws on wrong-length matrix; other paths return sentinels. Needs a policy ruling.

- **Cross-backend functional/visual scene.** _Parked — cross-package._ Confirming filter descriptors render consistently across backends.

- **Rust `flighthq-filters` crate.** _Parked — global posture._ Strong value-typed-leaf conformance target.

## Approved

- [2026-07-02 · picked] Sweep items 1–2: BitmapFilterMargin → types, Package Map description update
