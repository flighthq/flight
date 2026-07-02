---
package: '@flighthq/filters'
crate: flighthq-filters
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# filters — Charter

## What it is

`@flighthq/filters` is the **backend-independent definition layer** for bitmap filters — plain-data descriptors (one `create*` per kind), backend-independent math and metadata: kind catalog + guards, clone/equals/normalize/serialize/validate spine, color-matrix preset library (18 artistic presets), convolution-kernel builders with separability, quality-to-passes bridge, and bounds expansion (`getBitmapFilterMargin`). Blur sigma/radius math and shadow offset math live in `@flighthq/filters-math`, a shared leaf package that exists because backend packages need the same math but can't depend on `filters`.

It does not rasterize — pixel work lives in five `filters-*` backend packages: `filters-gl` (14 kinds, WebGL 2), `filters-wgpu` (14 kinds, WebGPU), `filters-surface` (14 kinds, CPU pixel ops), `filters-canvas` (3 kinds, Canvas2D), `filters-css` (3 kinds, CSS).

Filters are genuinely separate from effects. Effects (`@flighthq/effects`) is a layer above — post-processing render pipeline passes (bloom, tone-mapping, SSAO, motion blur). An effect may compose filters internally (e.g., bloom uses blur), but the type hierarchies (`BitmapFilter` vs `RenderEffect`), application models (per-display-object vs render pipeline), and package dependencies are distinct.

## North star

1. **Descriptors are plain data; backends do the pixels.** Every filter is a tree-shakable value with no backend coupling and no hidden runtime behavior.
2. **Open contract, user-extensible.** `BitmapFilter` is an open interface (`kind: Kind`). Users can define custom filter kinds with vendor prefixes. Utility functions (margin, clone, normalize, validate) dispatch through a **registry**, not a closed switch — custom kinds register their own handlers and tree-shake identically to built-ins.
3. **One canonical home for filter math and defaults.** Sigma↔radius, color-matrix presets, convolution kernels, separability, normalization defaults, and bounds margins are derived once here so the five backends stop re-deriving them.
4. **Color-matrix presets are affine approximations.** The 18 presets use the standard GPU-friendly 4x5 matrix. Exact LUT-based color grading is a different primitive that belongs in effects (`lutMath.ts`).
5. **Pure, alias-safe, sentinel-returning.** Math functions are side-effect-free; out-param functions read inputs to locals before writing; expected failures return sentinels, throws for API misuse only.
6. **Wasm-mixable leaf.** Value-in / value-out descriptors and math — a candidate for single-crate Rust→wasm drop-in.

## Boundaries

**In scope:**

- Filter descriptor constructors: 15 `create*Filter` factories (14 concrete kinds + general).
- Per-kind type guards: `isBitmapFilter` + 14 `is*Filter`.
- Registry-based utility dispatch: `getBitmapFilterMargin`, `cloneBitmapFilter`, `normalizeBitmapFilter`, `isValidBitmapFilter` — open to custom kinds via registration.
- Color-matrix math: 18 preset builders, concat/multiply, apply-to-color.
- Convolution-kernel builders: gaussian, box-blur, sharpen, edge-detect, emboss, laplacian, outline + separability/normalization.
- Serialization: `toBitmapFilterData` / `fromBitmapFilterData` / `enumerateBitmapFilterKinds`.
- Validation: `isValidBitmapFilter`, `isValidBitmapFilterList`, `clampFilterQuality`, `clampFilterStrength`.
- Default constants: `DEFAULT_FILTER_*`.

**Non-goals:**

- Pixel rasterization — `filters-gl` / `filters-wgpu` / `filters-surface` / `filters-canvas` / `filters-css`.
- Blur sigma/radius math — `@flighthq/filters-math` (shared leaf; exists for dependency direction reasons).
- Post-processing effects — `@flighthq/effects` (layer above; may compose filters).
- LUT-based color grading — `@flighthq/effects` (`lutMath`).
- Vendor-blob import/export — future `filters-formats` neighbor, deferred under plurality guard.

## Decisions

- **[2026-07-02] Registry, not closed union, for utility dispatch.** `getBitmapFilterMargin`, `cloneBitmapFilter`, `normalizeBitmapFilter`, `isValidBitmapFilter` currently have closed `switch(kind)` that silently break for custom kinds. Migrate to a registry: built-in 14 kinds register their own handlers, custom kinds do the same. Unused kinds tree-shake out.

  **Why:** `BitmapFilter` is already an open contract in types. Users must be able to add new filter kinds. With 14 kinds and growing, the closed switches contradict the open type and have passed the fork-B threshold.

- **[2026-07-02] `BitmapFilterMargin` → `@flighthq/types`.** Move the margin type from `filters` to the header layer. It's consumed by renderers — cross-package descriptor types belong in types.

  **Why:** Types go in types.

- **[2026-07-02] `filters-math` is the correct decomposition.** It exists because backend packages need blur math but can't depend on `filters` (wrong dependency direction). Not over-decomposition — solves a real dependency problem.

  **Why:** `filters-gl`, `filters-canvas`, etc. all need sigma/radius conversions. They depend on `filters-math`, not on `filters`.

- **[2026-07-02] Effects and filters are genuinely separate domains.** Effects is a layer above. An effect may compose filters (e.g., bloom uses blur). The type hierarchies, application models, and dependencies are distinct.

  **Why:** Per-display-object bitmap filters and render-pipeline post-processing passes are different execution models that share vocabulary.

- **[2026-07-02] Color-matrix presets stay as affine approximations.** Exact LUT-based grading belongs in effects. No seam needed in filters.

  **Why:** The 4x5 matrix is GPU-friendly and composable. LUT grading is a 3D texture lookup — a different primitive in the post-processing pipeline.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture.

## Open directions

1. **Registry migration scope.** Which utility functions get registries? The clear set: `getBitmapFilterMargin`, `cloneBitmapFilter`, `normalizeBitmapFilter`, `isValidBitmapFilter`. Does serialization (`toBitmapFilterData`/`fromBitmapFilterData`) also need one? Do the backends' apply functions register through a shared dispatch?

2. **Bevel margin distance offset.** The margin calculation for bevel filters may omit the distance offset. Verify and fix.

3. **Backend defaulting de-duplication.** Each backend has its own "fallback to default parameters" logic. A shared defaulting function in `filters` could reduce ~150 lines of duplication. Cross-package coordination.

4. **Constructor throw policy.** `createColorMatrixFilter` throws on wrong-length matrix; `fromBitmapFilterData` and validators return sentinels. Settle whether `create*` filters are throw-on-misuse or sentinel, so the family is symmetric.

5. **Package Map update.** The codebase map's description understates the package (omits presets, kernels, serialization, validation, margin). Update once the identity is blessed.

6. **`enableBitmapFilterSignals`.** Live filter-stack mutation notification. Low priority; would add a signals dependency.
