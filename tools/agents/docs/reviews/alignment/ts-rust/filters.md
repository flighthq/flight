# TS↔Rust Alignment: @flighthq/filters

**Verdict:** Construction helpers and blur math conform 1:1, but the crate carries a `css.rs` module whose four functions belong to `@flighthq/filters-css` — a package the conformance map lists as **Excluded (no substrate in the box)** — which is undocumented drift and the chief issue to resolve.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `computeBlurFilterCss` (`@flighthq/filters-css`) | `compute_blur_filter_css` / `css.rs` | **Misplaced + undocumented.** This is a `filters-css` export; the conformance map (conformance.md:96, :154) lists `filters-css` as Excluded — "there is no CSS engine in the box." It should not appear in `flighthq-filters` at all, or the exclusion is stale. Not in any divergence entry. |
| `computeDropShadowFilterCss` (`@flighthq/filters-css`) | `compute_drop_shadow_filter_css` / `css.rs` | Same as above — belongs to excluded `filters-css`. |
| `computeOuterGlowFilterCss` (`@flighthq/filters-css`) | `compute_outer_glow_filter_css` / `css.rs` | Same as above — belongs to excluded `filters-css`. |
| `getShadowFilterOffset` (`@flighthq/filters-css`) | `get_shadow_filter_offset` / `css.rs` | Belongs to excluded `filters-css`; **also a signature divergence**: TS takes `(filter: DropShadow\|InnerShadow\|BevelFilter)` and returns `{ dx, dy }`; Rust takes `(filter_angle: f32, filter_distance: f32)` and returns `(f32, f32)`. Tuple-vs-object is the normal idiom map, but the param shape (decomposed primitives vs filter object) is a real divergence and is unrecorded. |
| `PixelateFilter` (type, `@flighthq/types`) | re-exported as `PixelateFilterDescriptor as PixelateFilter` | Public name conforms via alias, but the underlying `flighthq-types` name is `PixelateFilterDescriptor` — an undocumented type-name divergence (the alias hides it at the `filters` seam). |
| `SharpenFilter` (type, `@flighthq/types`) | re-exported as `SharpenFilterDescriptor as SharpenFilter` | Same as `PixelateFilter`: underlying type renamed `*Descriptor`, aliased back. Undocumented. |

Lower-severity notes (not blocking, idiomatic):

- `create*Filter(options?: Omit<T, 'kind'>)` → `create_*_filter(options: T)`: TS takes an optional partial-options object and fills defaults; Rust takes a required full struct (caller uses `..Default::default()`). This is the standard TS-options-object → Rust-struct mapping and matches the pattern used elsewhere in the port; no action, but it means the Rust helpers are pass-through identity functions (`fn create_blur_filter(o) -> o`).

## In sync

- All 15 construction helpers map 1:1 with correct camelCase→snake*case and full type words preserved: `createBevelFilter`/`createBlurFilter`/`createColorMatrixFilter`/`createConvolutionFilter`/`createDisplacementMapFilter`/`createDropShadowFilter`/`createGradientBevelFilter`/`createGradientGlowFilter`/`createInnerGlowFilter`/`createInnerShadowFilter`/`createMedianFilter`/`createOuterGlowFilter`/`createPixelateFilter`/`createSharpenFilter` → matching `create*\*\_filter`.
- Blur math maps 1:1: `computeBoxBlurPassRadius` → `compute_box_blur_pass_radius`, `computeBoxBlurRadius` → `compute_box_blur_radius` (`math.rs`). File basename `blurMath.ts` ↔ `math.rs` is a reasonable track (slight basename loss: `blurMath` → `math`, acceptable since the module is filter-blur-only).
- Sentinel convention carries: CSS helpers return `string | null` ↔ `Option<String>` correctly; the `None`-on-unrepresentable-params behavior matches.
- Package→crate name is identity (`@flighthq/filters` → `flighthq-filters`); the `filters-surface`/`filters-gl`/`filters-wgpu` siblings exist as separate crates as expected. `filters → filters-surface` reverse dependency is correctly absent (per the corrected 2026-06-23 re-layering); `flighthq-filters` depends only on `flighthq-types` (+ `flighthq-geometry`), matching `filters` = descriptors + blur math only.
- All filter descriptor types re-exported from `flighthq-types` (the header layer), matching the TS pattern of re-exporting types from `@flighthq/types`.

## Recommended divergence-map additions

1. **Decide the home of the CSS functions.** Either (a) move `css.rs` out of `flighthq-filters` into a `flighthq-filters-css` crate and remove `filters-css` from the Excluded list (it clearly _does_ have a substrate — pure string serialization needs no CSS engine), or (b) if the team wants them in the in-the-box `filters` crate as a convenience, record an explicit divergence entry: "`flighthq-filters` includes CSS-string serialization that TS keeps in `@flighthq/filters-css`, because the serializers are pure data→string with no browser dependency." Right now the code contradicts conformance.md:154 with no rationale.
2. **Record the `getShadowFilterOffset` signature divergence** (filter-object → `(angle, distance)` primitives), with rationale, wherever it lands.
3. **Record (or revert) the `PixelateFilterDescriptor`/`SharpenFilterDescriptor` type renames** in `flighthq-types`; the aliasing hides them but the underlying names diverge from the authoritative `PixelateFilter`/`SharpenFilter`.
