# TS↔Rust Alignment: @flighthq/displayobject-wgpu

**Verdict:** Strong alignment — every TS export has a 1:1 Rust counterpart (functions as `pub fn`, renderer/writer descriptor consts as PascalCase structs) and all filenames track; the only gaps are extra Rust `pub fn` helpers TS keeps internal and one TS renderer const (`defaultWgpuRenderCacheRenderer`) with no Rust struct — none recorded in the divergence map, but this crate is a GPU leaf renderer that conformance.md (line 115) explicitly excludes from name-match gating in favor of visual parity, so the script cannot see any of this.

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| `defaultWgpuRenderCacheRenderer` (`wgpuCache.ts`) | — (`cache.rs`) | TS const renderer descriptor has **no Rust counterpart**. All other 17 `default*Renderer` / `*MaterialRenderer` / `*VelocityWriter` consts map cleanly to PascalCase structs (`DefaultWgpu*Renderer`, etc.); this one is the lone gap. Either port it (the cache renderer descriptor) or, if cache integration is deliberately deferred in the Rust backend, record it in the divergence map. |
| `getWgpuQuadBatchPreludeWGSL` + module-const `DEFAULT_MATERIAL_WGSL` / `COLOR_TRANSFORM_WGSL` (not exported) | `get_wgpu_default_material_wgsl`, `get_wgpu_color_transform_material_wgsl` (`default_material.rs`, `color_transform_material.rs`) | Rust exposes WGSL source via public getters where TS keeps the strings as private module consts. Reasonable Rust idiom (no top-level `const` export convention), but it is extra public surface not present upstream — note in the divergence map. |
| `packWgpuColorTransform` (internal `function`, `wgpuColorTransformMaterial.ts`) | `pack_wgpu_color_transform` (`pub fn`) | TS keeps this internal; Rust exports it. Promotion of an internal helper to public API — record or de-pub. |
| (inlined in TS draw paths) | `draw_wgpu_quad_batch`, `draw_wgpu_tilemap`, `draw_wgpu_shape_fill`, `draw_wgpu_bitmap_texture` (`pub fn`) | Finer Rust decomposition exposed publicly; TS exports only the higher-level `drawWgpu*` entry points. Drift toward a larger Rust public surface. Consider `pub(crate)` unless a caller outside the crate needs them. |
| (internal in TS) | `pack_wgpu_sprite_instance`, `submit_wgpu_sprite_instance`, `submit_wgpu_node_atlas_quad`, `get_wgpu_render_proxy_color_transform`, `build_wgpu_clip_contour_triangles`, `compose_wgpu_clip_rectangle` (`pub fn`) | Sprite-batch / clip / proxy helpers that have no exported TS equivalent. Same pattern: extra Rust public surface. Audit each for whether it needs to be `pub`. |

All filenames track 1:1 (`wgpuClipContours.ts ↔ clip_contours.rs`, `wgpuColorTransformMaterial.ts ↔ color_transform_material.rs`, `wgpuScale9Mapper.ts ↔ scale9_mapper.rs`, etc.) — 24 TS source files, 24 Rust `.rs` files plus `lib.rs`. No basename mismatch. `package.json` ↔ `Cargo.toml` dependency sets match (canvas dep is the only TS-side entry with no Cargo equivalent, expected: `displayobject-canvas` is a browser-substrate backend not ported to Rust).

## In sync

- **Package→crate name** is identity: `@flighthq/displayobject-wgpu` → `flighthq-displayobject-wgpu`. No undocumented name divergence.
- **All TS exported functions** map 1:1 with camelCase→snake_case and full type words preserved — `drawWgpuColorTransformBitmap → draw_wgpu_color_transform_bitmap`, `ensureWgpuRenderCacheTarget → ensure_wgpu_render_cache_target`, `packWgpuSpriteBatchMaterialInstance → pack_wgpu_sprite_batch_material_instance`, `getWgpuQuadBatchPreludeWGSL → get_wgpu_quad_batch_prelude_wgsl` (acronym lowercased, correct). No abbreviations, no renames-without-reason.
- **Renderer/writer descriptor consts → structs:** every TS `defaultWgpu*Renderer`, `defaultWgpu*VelocityWriter`, and the two `*WgpuMaterialRenderer` consts has the matching `DefaultWgpu*`/`*WgpuMaterialRenderer` struct (16 renderer structs + the velocity-writer structs). Correct entity→struct mapping.
- **Teardown / lifecycle verbs preserved:** `create_*`, `destroy_*`, `enable_*`, `register_*`, `release_*`, `ensure_*`, `refresh_*`, `reset_*`, `flush_*`, `push_*`/`pop_*` clip brackets all carry across exactly.
- **Out-param / sentinel conventions carry:** `getWgpuRenderCacheTarget`/`getWgpuVelocityWriter` returning `T | null` map to `Option<…>` in Rust (`get_wgpu_render_cache_target`, `get_wgpu_velocity_writer`); `remapWgpuScale9Commands(out, …)` keeps its `out` argument.
- **Conformance script:** does not list this crate at all — `displayobject-wgpu` is a GPU leaf renderer excluded from the name-match denominator (conformance.md line 115); its conformance is the visual parity matrix at the `wgpu` cell. The name-level findings above are not script-visible and rely on this manual pass.
