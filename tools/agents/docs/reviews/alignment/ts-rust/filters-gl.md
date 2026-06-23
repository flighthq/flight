# TS↔Rust Alignment: @flighthq/filters-gl

**Verdict:** All 24 TS exports port 1:1 by name, but the Rust crate adds an undocumented `filter_pass` layer that re-owns fullscreen-pass primitives TS keeps in `render-gl`, and folds the blit functions into `tint_shader.rs` with no `blit_shader.rs` — both unrecorded in the divergence map.

Note: `filters-gl` is in the `GPU_CRATES` exclusion set (`scripts/rust-conformance.ts:167`), so `npm run rust:conformance` validates it visually (parity matrix) and performs **no** name-match. Every finding below is invisible to the script and is exactly the manual-review value-add.

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| (none — lives in `@flighthq/render-gl`: `compileGlFullscreenProgram`, `drawGlFullscreenPass`, `clearGlRenderTarget`, type `GlFullscreenProgram`) | `compile_gl_fullscreen_program`, `draw_gl_fullscreen_pass`, `clear_gl_render_target`, `GlFullscreenProgram` — all defined in `filter_pass.rs` and re-exported from `flighthq-filters-gl` | **Layering divergence, unrecorded.** In TS these primitives are owned and exported by `render-gl`; `filters-gl` only imports them (`glBlitShader.ts:2`). Rust re-implements them inside `filters-gl/filter_pass.rs` and re-exports them as part of the crate's public surface, duplicating `flighthq-render-gl::draw_gl_fullscreen_pass`. The module doc-comment justifies this ("render-gl's public fullscreen pass is specific to the bitmap shader") but it is not in the conformance map — silent drift. Either move the generic pass into `flighthq-render-gl` (matching TS), or record this split. |
| (none) | `clear_gl_filter_program_cache` (`filter_pass.rs`, re-exported) | **Extra Rust-only export, unrecorded.** No TS counterpart. TS keys filter programs on a `WeakMap<GlRenderState, …>` that drops automatically; the native port needs an explicit cache-clear at state teardown. Plausible Rust-port necessity, but it is a public function with no TS export and no divergence-map entry. Record it (a `*->filters-gl` rationale entry). |
| `glTintShader.ts` (tint fns) + `glBlitShader.ts` (blit fns) — two files | `tint_shader.rs` holds **both** tint and blit functions; **no `blit_shader.rs`** | **File-name drift.** `applyGlBlitOffsetPass`/`applyGlBlitPass`/`getGlBlitOffsetShader`/`getGlBlitShader` live in TS `glBlitShader.ts` but in Rust `tint_shader.rs`. The Rust basename does not track its TS counterpart (`blit_shader.rs` expected). Function names themselves are correct; only the host file diverges. |
| `glTestHelper.ts` | (no `.rs` equivalent) | Test-only helper; not an export. No action — Rust tests structure differently. |

## In sync

- **All 24 public TS exports map 1:1** with correct camelCase→snake_case and the full backend/type word preserved: the 16 `apply*FilterToGl` filters, `createGlGradientRampTexture`, and the four blit + four tint pass/shader functions. No abbreviations, no renames-without-reason, no missing filter ports.
- **Package→crate name is identity** (`@flighthq/filters-gl` → `flighthq-filters-gl`); the `-gl` suffix is shared natively per conformance.md:30.
- **File basenames track by domain** for every filter: `glBevelFilter.ts` → `bevel_filter.rs`, `glBlurFilter.ts` → `blur_filter.rs`, etc. Dropping the `gl` prefix is the consistent in-crate Rust convention (TS is backend-prefix-first; Rust is snake_case domain), applied uniformly. Only the blit/tint pairing (above) breaks the per-file mapping.
- **Conventions carry across:** out-params → `&mut`/explicit dest targets, `Readonly<…>` → `&` borrows, `create*`/`create_*` allocation verb preserved, sentinel-vs-panic intent intact. No teardown-verb misuse (`dispose`/`destroy`/`acquire`/`release` not in this surface).
- **Re-export of `GlRenderState`/`GlRenderTarget` from `flighthq-render-gl`** is a Rust ergonomic convenience (one-import callers), not a name divergence.

## Divergence-map additions to make

1. `filters-gl` (or `filters-gl->render-gl`): the `filter_pass.rs` fullscreen-pass primitives (`compile_gl_fullscreen_program`, `draw_gl_fullscreen_pass`, `clear_gl_render_target`, `GlFullscreenProgram`) are owned by the crate in Rust but by `render-gl` in TS — with the "render-gl's pass is bitmap-specific" rationale, or a TODO to push them down into `render-gl`.
2. `filters-gl`: `clear_gl_filter_program_cache` is a Rust-only public export covering the missing `WeakMap` auto-drop (explicit teardown of the per-state program cache).

## Stale note

`filter_pass.rs`'s module doc still references the pre-reorg TS names `webglFullscreenPass.ts` / `render-webgl`. Post-reorg the live TS is `render-gl` (`compileGlFullscreenProgram`/`drawGlFullscreenPass`). Update the comment to the current `render-gl` names.
