# TS↔Rust Alignment: @flighthq/effects

**Verdict:** Fully aligned on names — all 45 exported functions map 1:1 (camelCase→snake_case, full type words preserved) and the crate name is identity; the only gap is the nice-to-have file-name tracking (TS is one-effect-per-file; Rust groups into 7 category modules), which is undocumented but cosmetic.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `computeBloomBlurRadius` / `bloomEffect.ts` | `compute_bloom_blur_radius` / `tone_effects.rs` | None (name maps 1:1). File basename does not track: TS `bloomEffect.ts` → Rust `tone_effects.rs`. |
| `createBloomEffect` … `createWhiteBalanceEffect` (44 `create*` fns, one per `*Effect.ts` file) | `create_*_effect` (44 fns across 7 grouped `*_effects.rs` modules) | None on symbols (all map 1:1). File mismatch: 44 TS per-effect files (e.g. `vignetteEffect.ts`, `fxaaEffect.ts`) collapse into `antialiasing_effects.rs`, `atmospheric_effects.rs`, `color_grade_effects.rs`, `lens_effects.rs`, `motion_effects.rs`, `stylization_effects.rs`, `tone_effects.rs`. No TS file shares any of these category basenames. |
| `ToneMapOperator` (type in `@flighthq/types/ToneMapEffect.ts`) | `ToneMapOperator` (re-exported from `types.rs`) | None — type mirrored correctly; not an effects-package symbol but surfaces in the crate root. |

No missing ports, no extra Rust functions, no abbreviations, no renamed-without-reason symbols. Function count matches exactly (45 = 45).

## In sync

- **Crate name:** `@flighthq/effects` → `flighthq-effects` is identity (not in any rename row of the divergence map, correctly).
- **Function names:** every export maps 1:1 with full unabbreviated type words preserved (`createBokehDepthOfFieldEffect` → `create_bokeh_depth_of_field_effect`, `createScreenSpaceFogEffect` → `create_screen_space_fog_effect`, `createLookupTableGradeEffect` → `create_lookup_table_grade_effect`). Acronym effects (`createFxaaEffect`/`createSmaaEffect`/`createTaaEffect`/`createSsaoEffect`/`createSsrEffect`/`createCrtEffect`) all map correctly.
- **Conventions:** descriptors are plain-data structs; `create*` allocate-and-return (no out-params needed); `computeBloomBlurRadius`/`compute_bloom_blur_radius` is pure recipe math returning a `number`/`f64` with no sentinel/teardown semantics. No `dispose*`/`destroy*`/`acquire*`/`release*` in this package, so nothing to carry. Color-as-packed-RGBA and "intent + per-backend recipe" doc comments are mirrored in `lib.rs`.
- **Type seam:** effect descriptor structs and the `RenderEffect` enum live in the crate's `types.rs`, mirroring the TS `@flighthq/types` header layer. `ToneMapOperator` enum present on both sides.

## Notes for the divergence map

The base `flighthq-effects` crate is **not** in the divergence map and does not need an entry — it is in full name/structural conformance. The existing `effects-gl` / `effects-wgpu` bloom-Gaussian entries (conformance.md:61) concern the _backend_ crates, not this value crate; they look current (the `effects-wgpu` half is still marked pending), so no staleness there.

One item worth considering for the map (or a general note): the **per-file → grouped-module** layout difference. The TS↔Rust file-name tracking is documented only as a "nice-to-have," and Cargo's crate-local style makes category grouping reasonable, but a 44→7 collapse means _no_ Rust file basename tracks its TS counterpart for this entire crate. This is silent (the structural gate is name-based, not file-based) and not recorded anywhere. If file-basename tracking is meant to hold, this crate is a deliberate exception worth a one-line note; if grouped modules are an accepted Rust idiom, the "nice-to-have" rule could say so explicitly to pre-empt future reviews flagging it.
