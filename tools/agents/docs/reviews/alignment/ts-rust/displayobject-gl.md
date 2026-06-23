# TS↔Rust Alignment: @flighthq/displayobject-gl

**Verdict:** Crate name and the bulk of `draw_gl_*` / `register_gl_*` / `enable_gl_*` exports map 1:1, but the crate is a leaner port — several TS exports have no counterpart, two functions are renamed (`renderGlSprite`→`submit_gl_sprite`, `buildGlScale9Mapper`→`compute_gl_scale9_quads`), and a Rust-only `shape_fill` family + clip helpers exist — none of which is recorded in the divergence map. Because the script lists `displayobject-gl` as a visual-only (GPU) crate excluded from name-match coverage, none of this drift is caught automatically.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `renderGlSprite` (`glSprite.ts`) | `submit_gl_sprite` (`sprite.rs`) | Verb divergence `render`→`submit`. The TS sibling `renderGlDisplayObject` is preserved as `render_gl_display_object`; only the sprite entry point was renamed. Either restore `render_gl_sprite` or record the rename. |
| `buildGlScale9Mapper` → `Scale9Mapper` (`glScale9Mapper.ts`) | `compute_gl_scale9_quads` (`scale9_mapper.rs`) | Verb **and** object both diverge (`build…Mapper` vs `compute…quads`). The full type word `Scale9Mapper` is dropped. Significant undocumented drift in the same file basename. |
| `renderGlVelocity`, `createGlVelocityTarget`, `drawGlVelocityQuad`, `getGlVelocityWriter`, `registerGlVelocityWriter`, `defaultGl{DisplayObject,ParticleEmitter,QuadBatch}VelocityWriter` (`glVelocity.ts`) | only `draw_gl_velocity` (`velocity.rs`) | Velocity writer registry + target/quad API not ported. The Rust `velocity.rs` collapses the whole TS velocity surface to one draw fn. Missing ports. |
| `registerGlColorTransformMaterial` (`glColorTransformMaterial.ts`), `registerGlUniformColorTransformMaterial` (`glUniformColorTransformMaterial.ts`) | absent | Rust keeps only `draw_gl_color_transform_material` / `draw_gl_uniform_color_transform_material`; the paired `register_gl_*_material` entry points are missing. (`register_gl_default_material` and `register_gl_color_transform_shader` are present.) |
| `enableGlTextInput`, `registerGlTextInputOverlay`, `drawGlTextInputOverlay` (`glTextInput.ts`) | only `draw_gl_text_input` (`text_input.rs`) | Text-input overlay registration/enable API not ported. |
| `drawGlRichTextWithOverlay`, `createGlRichTextData`, `destroyGlRichTextData` (`glRichText.ts`) | only `draw_gl_rich_text` (`rich_text.rs`) | Overlay variant and the create/destroy data lifecycle pair are missing. |
| `drawGlScale9ShapeMask`, `createGlScale9ShapeData`, `destroyGlScale9ShapeData`, `remapGlScale9Commands` (`glScale9Shape.ts`) | only `draw_gl_scale9_shape` (`scale9_shape.rs`) | Mask draw + data lifecycle + command remap not ported. |
| `drawGlShapeMeshes` (`glShapeMesh.ts`, plural batch draw) | `draw_gl_shape_mesh` (singular, `shape_mesh.rs`) | The plural batch entry point is absent; only the singular per-mesh draw exists. |
| `createGlVideoData`, `destroyGlVideoData` (`glVideo.ts`) | only `draw_gl_video` (`video.rs`) | Video renderer-data lifecycle pair not ported. |
| re-exported `defaultGl*` shape commands + `registerGlShapeCommands` (`index.ts`, aliased from `displayobject-canvas`) | absent | TS defers shape commands to canvas via aliased re-exports; no Rust equivalent (canvas backend is excluded in Rust). Expected, but should be a recorded N/A. |
| — | `draw_gl_shape_fill`, `fold_gl_shape_fill_region_color`, `pack_gl_shape_fill_color`, `destroy_gl_shape_fill_mesh_cache_entry` (`shape_fill.rs`) | **Extra Rust-only file + functions**, no TS `glShapeFill.ts`. Likely an internal split of TS `glShape`/`glShapeMesh`; should be `pub(crate)` or recorded as a Rust-only structural divergence. |
| — | `compute_gl_scissor_rect`, `intersect_gl_scissor_rect`, `GlWindingRule` (`clip.rs`) | Rust-only clip helpers with no TS counterpart. Reasonable internal helpers; mark `pub(crate)` or record. |
| `submitGlSpriteNode` family | `submit_gl_sprite_node`, `pack_gl_sprite_instance`, `submit_gl_sprite_instance`, `submit_gl_node_atlas_quad` (`sprite_batch.rs`/`sprite_renderer.rs`) | Rust has finer-grained `submit_*`/`pack_*` sprite-batch helpers than TS exposes; verify these are intended public surface vs internal. |
| `glClipContours.ts` + `glClipRectangle.ts` (two files) | merged into `clip.rs` | File merge: the two TS clip files collapse into one Rust module. Functions themselves track 1:1 (`push/pop_gl_clip_{contours,rectangle}`). Basename merge is a nice-to-have miss. |
| all `draw_gl_*(…, render_proxy_id: u64)` | — | Signature divergence: TS passes a `RenderProxy2D` object; Rust passes a `u64` arena id. This is the locked slotmap-arena port decision (rust/index.md) — expected, not a defect, but worth one map note that proxy params become arena ids across this crate. |

## In sync

- Package→crate name is identity: `@flighthq/displayobject-gl` → `flighthq-displayobject-gl`. `Cargo.toml` dependency set mirrors `package.json` (sans the `render-gl`-internal split) and the `description` string is identical.
- camelCase→snake_case with full type words preserved for the matched set: `draw_gl_bitmap`, `draw_gl_shape`, `draw_gl_tilemap`, `draw_gl_quad_batch`, `draw_gl_particle_emitter`, `draw_gl_rich_text`, `draw_gl_text_label`, `draw_gl_video`, `draw_gl_display_object`, `render_gl_display_object`, `register_gl_display_object_renderer`, `register_gl_default_material`, `register_gl_color_transform_shader`, `enable_gl_clip_support`, `enable_gl_render_cache`, `push/pop_gl_clip_contours`, `push/pop_gl_clip_rectangle`, `get_gl_render_proxy_color_transform`, `pack_gl_color_transform`.
- Cache family aligns cleanly: `create_gl_cache_state`, `enable_gl_render_cache`, `ensure_gl_render_cache_target`, `get_gl_render_cache_target`, `refresh_gl_render_cache`, `release_gl_render_cache` (note `release_gl_render_cache(…, cache_id: u64)` keeps the `release_*` pool-bracket verb).
- Quad-batch helpers track 1:1: `bind_gl_quad_batch_base_attributes`, `ensure_gl_quad_batch_shader`, `flush_gl_sprite_batch`, `pack_gl_sprite_batch_material_instance`, `prepare_gl_sprite_batch_write`, `set_gl_quad_batch_world_and_texture`, `use_gl_quad_batch_program`.
- File basenames track for the common cases: `glBitmap.ts`↔`bitmap.rs`, `glShape.ts`↔`shape.rs`, `glCache.ts`↔`cache.rs`, `glTilemap.ts`↔`tilemap.rs`, `glSpriteBatch.ts`↔`sprite_batch.rs`, `glSpriteRenderer.ts`↔`sprite_renderer.rs`, etc. (`gl`-prefix dropped, snake_case applied — consistent with the backend-prefix-first TS convention not carrying into Rust module names).
- Teardown verbs preserved: `destroy_gl_shape_mesh`, `destroy_gl_shape_fill_mesh_cache_entry` use `destroy_*` for GPU-resource frees; `release_gl_render_cache` uses the pool-bracket `release_*`.

## Suggested divergence-map additions

`displayobject-gl` is in the GPU visual-only exclusion list (`conformance.md` line ~115), so the script never checks its names. The following should be recorded explicitly so the drift is auditable rather than silent:

1. `renderGlSprite` → `submit_gl_sprite` rename (or revert to `render_gl_sprite` for symmetry with `render_gl_display_object`).
2. `buildGlScale9Mapper`/`Scale9Mapper` → `compute_gl_scale9_quads` rename + dropped type word.
3. Rust-only `shape_fill` function family and `clip` scissor/winding helpers (or downgrade to `pub(crate)`).
4. The arena-id signature shift (`RenderProxy2D` → `u64 render_proxy_id`) for this crate's draw functions.
5. The set of unported TS lifecycle/overlay/velocity-writer/material-register functions — confirm each is "deferred" vs "intentionally N/A in Rust" and record which.
