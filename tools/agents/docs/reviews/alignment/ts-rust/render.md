# TS↔Rust Alignment: @flighthq/render

**Verdict:** Strong alignment — all 42 of the core 2D/proxy/cache/state functions port 1:1 with correct snake_case and full type words; the only real gap is the unported 3D scene-render pair (`packSceneLightBlock`, `prepareSceneRender`), which is a genuine native-core gap that should be recorded in the divergence map rather than left as silent drift.

`flighthq-render` is identity-named against `@flighthq/render` (no rename), which matches the conformance map. Coverage: TS exports 44 functions; 42 have Rust ports; 2 are missing. The Rust "extra" functions are all legitimate arena/idiom shape, not drift.

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| `packSceneLightBlock` (`sceneRender.ts`) | — | **Missing port.** CPU-side packing of `SceneLightBlock` from `SceneLights`. Native-core logic (no GPU shaders), so unit-portable. Not in `flighthq-render`, `flighthq-scene-gl`, or `flighthq-scene-wgpu`. Genuine gap; not recorded in the divergence map. |
| `prepareSceneRender` (`sceneRender.ts`) | — | **Missing port.** Builds a `SceneRenderList` from scene/camera/lights — the 3D analogue of `prepareDisplayObjectRender`. CPU-side native-core logic. Not ported anywhere; not recorded in the divergence map. |
| `sceneRender.ts` (file) | — | No Rust counterpart file (e.g. `scene_render.rs`). Follows from the two missing functions above. |
| (TS object references) | `get_render_state`, `get_render_state_mut`, `get_render_state_runtime_mut` (`render_state.rs`) | **Not drift.** Rust uses a `RenderStateStore` + `RenderStateId` slotmap/arena instead of TS object references; these are the required store accessors. Expected Rust-port arena idiom (per rust/index.md "scene graph: slotmap arena"). Worth a one-line note in the map so they are not re-flagged. |
| (constructors) | `RenderState::new`, `RenderCacheAdapter::new` (`new`) | **Not drift.** Inherent `impl` constructors, the Rust idiom paired with TS `createRenderState` / `createRenderCacheAdapter` (which also exist as free fns). Not standalone exports. |
| `renderAppearance.ts` | `appearance.rs` | File basename drops the `render` prefix. Nice-to-have only. |
| `renderColor.ts` | `color.rs` | File basename drops the `render` prefix. Nice-to-have only. |
| `renderMaterial.ts` | `material.rs` | File basename drops the `render` prefix. Nice-to-have only. |
| `renderTextFormat.ts` | `text_format.rs` | File basename drops the `render` prefix. Nice-to-have only. |
| `renderTransform2d.ts` | `transform2d.rs` | File basename drops the `render` prefix. Nice-to-have only. |

File-name prefix handling is internally inconsistent: `renderCache/renderProxy/renderProxyAdapter/renderState/renderTarget` keep the prefix (`render_cache.rs` etc.), while `renderAppearance/renderColor/renderMaterial/renderTextFormat/renderTransform2d` drop it. Function names inside are unaffected and remain 1:1; this is cosmetic only.

## In sync

All 42 ported functions match 1:1 with correct camelCase→snake*case and the full type word preserved. Verb conventions carry across cleanly: `create*\_`, `dispose\__`(no`destroy*\*`needed here — render state holds GC-managed proxies, not GPU resources, so the TS dispose/destroy split is honored),`is*_` predicates (`is*render_cache`, `is_render_proxy_visible`, `is_render_proxy_dirty`), `get*_`accessors,`register*\*`/`set*_`/`update\_\_`/`compute\_\*`. Out-params map to `&mut` (`compute_display_object_render_target_transform`, `compute_render_cache_transform`). Sentinel-returning lookups port to `Option` (`get_render_proxy_2d`, `get_render_proxy_adapter`, `get_render_proxy_cache`).

Confirmed 1:1: `apply_render_proxy_adapter`, `begin_render_proxy_update`, `compute_display_object_render_target_transform`, `compute_render_cache_transform`, `compute_render_target_size`, `compute_text_format_font_string`, `copy_all_renderers_from_render_state`, `copy_renderers_from_render_state`, `create_render_cache`, `create_render_cache_adapter`, `create_render_proxy`, `create_render_proxy_2d`, `create_render_state`, `create_render_state_runtime`, `dispose_display_object_render`, `dispose_render_proxy`, `enable_render_cache_adapter_signals`, `get_or_create_render_proxy_2d`, `get_render_proxy_2d`, `get_render_proxy_adapter`, `get_render_proxy_cache`, `get_render_state_runtime`, `install_render_adapt_hook`, `is_render_cache`, `is_render_cache_adapter`, `is_render_proxy_dirty`, `is_render_proxy_visible`, `noop_renderer_data`, `prepare_display_object_render`, `register_render_cache_renderer`, `register_renderer`, `set_render_proxy_adapter`, `set_render_state_background_color`, `update_display_object_render_transform`, `update_node_clip`, `update_render_proxy_2d`, `update_render_proxy_2d_transform`, `update_render_proxy_appearance`, `update_render_proxy_material`, `update_render_proxy_renderer`, `use_render_cache`, `walk_node`.

## Divergence map suggestions

- **Add an entry** for the unported 3D scene-render pair (`packSceneLightBlock`, `prepareSceneRender` from `sceneRender.ts`) with a rationale and intended Rust home — either `flighthq-render` (mirroring the TS placement) or a `scene`-side crate. They are CPU-side native-core, so they belong in the unit-parity denominator, not the GPU-visual exclusion. The conformance script already counts these as the render "gap 2"; the map should explain them.
- **Add a one-line note** that the Rust `RenderStateStore`/`RenderStateId` arena accessors (`get_render_state`, `get_render_state_mut`, `get_render_state_runtime_mut`) are the expected expression of TS object references under the slotmap-arena decision, so the extra functions are not mistaken for drift in future audits.
