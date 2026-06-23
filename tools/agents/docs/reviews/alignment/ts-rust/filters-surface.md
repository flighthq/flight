# TS↔Rust Alignment: @flighthq/filters-surface

**Verdict:** Fully aligned — all 14 TS exports map 1:1 to the Rust crate (`applyFooFilterToSurface` → `apply_foo_filter_to_surface`), the `surface-filters → filters-surface` rename and re-layering are explicitly recorded in the divergence map, and the only Rust-only symbols are private mapping helpers; no drift.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `applyBevelFilterToSurface` / `surfaceBevelFilter.ts` | `apply_bevel_filter_to_surface` / `apply.rs` | None |
| `applyBlurFilterToSurface` / `surfaceBlurFilter.ts` | `apply_blur_filter_to_surface` / `apply.rs` | None |
| `applyColorMatrixFilterToSurface` / `surfaceColorMatrixFilter.ts` | `apply_color_matrix_filter_to_surface` / `apply.rs` | None |
| `applyConvolutionFilterToSurface` / `surfaceConvolutionFilter.ts` | `apply_convolution_filter_to_surface` / `apply.rs` | None |
| `applyDisplacementMapFilterToSurface` / `surfaceDisplacementMapFilter.ts` | `apply_displacement_map_filter_to_surface` / `apply.rs` | None |
| `applyDropShadowFilterToSurface` / `surfaceDropShadowFilter.ts` | `apply_drop_shadow_filter_to_surface` / `apply.rs` | None |
| `applyGradientBevelFilterToSurface` / `surfaceGradientBevelFilter.ts` | `apply_gradient_bevel_filter_to_surface` / `apply.rs` | None |
| `applyGradientGlowFilterToSurface` / `surfaceGradientGlowFilter.ts` | `apply_gradient_glow_filter_to_surface` / `apply.rs` | None |
| `applyInnerGlowFilterToSurface` / `surfaceInnerGlowFilter.ts` | `apply_inner_glow_filter_to_surface` / `apply.rs` | None |
| `applyInnerShadowFilterToSurface` / `surfaceInnerShadowFilter.ts` | `apply_inner_shadow_filter_to_surface` / `apply.rs` | None |
| `applyMedianFilterToSurface` / `surfaceMedianFilter.ts` | `apply_median_filter_to_surface` / `apply.rs` | None |
| `applyOuterGlowFilterToSurface` / `surfaceOuterGlowFilter.ts` | `apply_outer_glow_filter_to_surface` / `apply.rs` | None |
| `applyPixelateFilterToSurface` / `surfacePixelateFilter.ts` | `apply_pixelate_filter_to_surface` / `apply.rs` | None |
| `applySharpenFilterToSurface` / `surfaceSharpenFilter.ts` | `apply_sharpen_filter_to_surface` / `apply.rs` | None |
| — | `bevel_type_to_surface`, `displacement_mode_to_surface`, `pack_rgb_alpha`, `ratios_to_u8` (private, `apply.rs`) | Acceptable — non-`pub` descriptor→surface-op mapping helpers, no public surface, not expected upstream |

### File layout note (nice-to-have, not a defect)

TS uses one file per filter (14 `surfaceFooFilter.ts` files); Rust collapses all 14 into a single `apply.rs` behind `lib.rs` (`pub use apply::*`). This is a benign per-file vs. per-module structuring difference: the public symbol names track exactly, and the Rust file is a thin bridge module. No per-file basename tracking is achievable here, but nothing is hidden or renamed. Worth leaving as-is; flagging only for completeness.

## In sync

- **Package→crate name:** `@flighthq/filters-surface → flighthq-filters-surface` is identity. The earlier Rust name `surface-filters` and the package re-layering (pixel ops relocated into `flighthq-surface`; `apply_*_filter_to_surface` bridges moved here; `filters → filters-surface` reverse edge dropped) are explicitly documented in `tools/agents/docs/rust/conformance.md` (rename table line 42 and the corrected-2026-06-23 narrative). Not silent drift.
- **Signatures / conventions:** out-param convention carries (`out: Uint8ClampedArray` → `out: &mut [u8]`, `blurBuffer` → `blur_buffer`), `Readonly<SurfaceRegion>` → `&SurfaceRegion`, filter descriptors passed by reference. Functions return `void`/`()` (mask-writing bridges), so no sentinel/teardown verbs apply.
- **Type words preserved in full:** `ColorMatrix`, `DisplacementMap`, `GradientBevel`, `GradientGlow`, `InnerGlow`, `InnerShadow`, `OuterGlow` all spelled out unabbreviated on both sides.
- **Descriptor type aliasing:** Rust imports `PixelateFilterDescriptor as PixelateFilter` and `SharpenFilterDescriptor as SharpenFilter` to match the TS `PixelateFilter`/`SharpenFilter` parameter types — consistent with the upstream signatures.
- **Manifest deps match:** both depend on `filters` + `surface` + `types` only (TS `package.json` vs Rust `Cargo.toml`), confirming the corrected thin-bridge layering.

### Divergence map

No new entry needed — the rename and re-layering are already recorded with rationale. The existing entry is current (dated 2026-06-23), not stale.

### Tooling note

`npm run rust:conformance` could not be observed for this crate: the run aborted with an OOM (`status: 137`) inside its `npx tsx ./scripts/api.ts --json` subprocess — an environment/memory failure, not a filters-surface signal. Findings above are from a direct TS-export ↔ Rust-source comparison.
