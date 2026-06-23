# TS↔Rust Alignment: @flighthq/filters-wgpu

**Verdict:** Strong alignment — every upstream `apply*/create*/draw*/get*/clear*` function ports 1:1 with correct snake_case and full type words; the only gaps are a missing `blit_shader.rs` file (functions folded into `tint_shader.rs`) and a few undocumented Rust-only helpers/types that should get divergence-map lines.

This crate is a `GPU_CRATES` member in `scripts/rust-conformance.ts`, so `npm run rust:conformance` excludes it from name-match coverage and validates it visually (parity matrix at the `wgpu` cell). All name-level findings below are therefore invisible to the script.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `wgpuBlitShader.ts` (file) | — (functions in `tint_shader.rs`) | No `blit_shader.rs`. The four blit exports (`applyWgpuBlitPass`, `applyWgpuBlitOffsetPass`, `getWgpuBlitShader`, `getWgpuBlitOffsetShader`) live in their own TS file but are folded into Rust `tint_shader.rs`. Functions all present and correctly named; only the file boundary diverges. File-tracking is nice-to-have, but a `blit_shader.rs` split would mirror TS. Minor. |
| `createWgpuGradientRampTexture` only (`wgpuGradientRamp.ts`) | `create_wgpu_gradient_ramp_texture` **+ `build_gradient_ramp_data`** (`gradient_ramp.rs`) | Extra Rust export `build_gradient_ramp_data` not present upstream. Appears in both `filters-gl` and `filters-wgpu` Rust crates (consistent internal CPU-side ramp builder), but is public and undocumented. Either make it `pub(crate)` or add a one-line divergence entry. |
| — (TS threads infra through render state) | `WgpuFilterState`, `create_wgpu_filter_state`, `destroy_wgpu_filter_state` (`filter_pass.rs`) | Rust-only API split. **Already recorded** in conformance.md (line 61: "a Rust-only API split; TS threads it through the render state… no WeakMap"). The `destroy_*` verb is correct (frees GPU resources). Documented — OK. |
| — | `draw_wgpu_dual_source_views_pass` (`filter_pass.rs`) | Extra Rust function, no TS counterpart (TS has `drawWgpuDualSourcePass` over targets only). A views-level variant; not in the map. Add a line or keep `pub(crate)` if internal. |
| — | `WgpuBlendMode`, `WgpuUniformSlot`, `FILTER_VERTEX_WGSL` (`filter_pass.rs`) | Rust-only public items with no TS export (TS uses `'premul' \| 'replace'` string-literal blend inline). Reasonable Rust idiom (enum over string union), but undocumented. Worth a single map line covering the `filter_pass` infra surface. |

## In sync

- All 16 `apply*FilterToWgpu` filter entry points map 1:1: bevel, box-blur, color-matrix, convolution, displacement-map, drop-shadow, gaussian-blur, gradient-bevel, gradient-glow, inner-glow, inner-shadow, median, outer-glow, pixelate, sharpen — `apply_*_filter_to_wgpu`. Full type words preserved (`apply_color_matrix_filter_to_wgpu`, `apply_displacement_map_filter_to_wgpu`).
- Tint/blit primitives all present and 1:1: `apply_wgpu_tint_pass`, `apply_wgpu_invert_tint_pass`, `apply_wgpu_inner_clip_pass`, `apply_wgpu_blit_pass`, `apply_wgpu_blit_offset_pass`, and matching `get_wgpu_*_shader` accessors.
- Pipeline/pass infra: `create_wgpu_filter_pipeline`, `create_wgpu_dual_source_pipeline`, `create_wgpu_triple_source_pipeline`, `draw_wgpu_filter_pass`, `draw_wgpu_dual_source_pass`, `draw_wgpu_triple_source_pass`, `clear_wgpu_filter_target` — all 1:1.
- `WgpuFilterPipeline` / `WgpuDualSourcePipeline` types map 1:1.
- Package→crate name is identity (`@flighthq/filters-wgpu` → `flighthq-filters-wgpu`); the `-wgpu` suffix is shared upstream/downstream per conformance.md:30 (no rename divergence).
- Out-param/sentinel/teardown conventions hold: filters write into caller-owned `WgpuRenderTarget`/scratch; `destroy_*` used for the GPU-resource-freeing teardown; no spurious `dispose_*`.
- Filename basenames track for every ported file (`wgpuBevelFilter.ts` ↔ `bevel_filter.rs`, `wgpuGradientRamp.ts` ↔ `gradient_ramp.rs`, `wgpuFilterPass.ts` ↔ `filter_pass.rs`, `wgpuTintShader.ts` ↔ `tint_shader.rs`, etc.) — the `wgpu` prefix drops cleanly since the crate name already carries it.

### Suggested divergence-map additions

Three small undocumented items to fold into one conformance.md entry (or make `pub(crate)`): `build_gradient_ramp_data`, `draw_wgpu_dual_source_views_pass`, and the `filter_pass` infra types (`WgpuBlendMode`, `WgpuUniformSlot`, `FILTER_VERTEX_WGSL`). The `WgpuFilterState` split is already documented and needs nothing.
