# TS↔Rust Alignment: @flighthq/scene-wgpu

**Verdict:** Partially ported by design — `scene-wgpu` is in the visual-conformance allowlist (GPU shader output, not name-match gated), and the present StandardPbr slice maps cleanly; but the same divergences as its `scene-gl` sibling (`getWgpuSceneRuntime`→`create_wgpu_scene_runtime`, plus `pub` helpers that are file-private in TS) are undocumented drift that should be recorded in the conformance map.

## Name map findings

`@flighthq/scene-wgpu` exports 78 functions across ~36 source files (20 material families + the classic/toon/matcap/unlit/debug/wireframe prelude+pipeline sets + the StandardPbr core). The Rust crate `flighthq-scene-wgpu` ports a deliberate StandardPbr-only slice (8 modules; the runtime, registry, mesh upload, PBR pipeline cache, PBR prelude, the StandardPbr renderer + its registration, and a stubbed scene walk). Because `scene-wgpu` is listed in `scripts/rust-conformance.ts` (line 174) and `conformance.md` line 115 as a GPU backend whose conformance is **visual** (the `wgpu` parity cell), the 75 unported functions are reported as "coverage gaps" but are **not** name-match failures — that is the intended posture for this crate. The findings below are the judgments the script cannot make.

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `getWgpuSceneRuntime` / `wgpuSceneRuntime.ts` | `create_wgpu_scene_runtime` / `wgpu_scene_runtime.rs` | **Naming divergence, undocumented.** TS lazily fetches/creates one runtime per `WgpuRenderState` (`get*`); Rust threads a caller-owned struct and uses `create_*`. `lib.rs` explains the rationale ("`WgpuRenderStateRuntime` carries no scene slots"), but `conformance.md` has no entry. A `get_`→`create_` verb change is a real divergence that should be recorded, not a doc-comment-only note. Same divergence already flagged for `scene-gl`. |
| `alignTo4` (module-private, `wgpuMeshUpload.ts` line 62, also duplicated in `wgpuWireframeUpload.ts`) | `pub align_to_4` / `wgpu_mesh_upload.rs` | **Extra public surface.** TS keeps `alignTo4` a file-private helper (no `export`); Rust exposes it `pub` and re-exports it from `lib.rs`. Not in the upstream public API. Either drop `pub` or record as an intentional widening. |
| (no TS export — cache key computed inline in `ensureWgpuPbrPipeline`) | `pub build_wgpu_pbr_pipeline_cache_key` / `wgpu_pbr_pipeline_cache.rs` | **Extra public surface.** TS has no exported `buildWgpuPbrPipelineCacheKey`; the cache key is built inline. Rust elevates it to a public function. Not upstream API. |
| `WgpuMeshUpload` / `WgpuMaterialBinding` (types from `wgpuMeshUpload.ts` / `standardPbrWgpuMeshMaterialRenderer.ts`) | `WgpuMeshUpload`, `WgpuMaterialBinding` (structs, both defined in `wgpu_scene_runtime.rs`) | **File-tracking nit.** Same names, but both structs are consolidated into the runtime module. Basenames no longer track their TS homes (`wgpu_mesh_upload.rs` would mirror `wgpuMeshUpload.ts`). Re-exported, so public names are fine; only the source location drifts. |
| `standardPbrWgpuMeshMaterialRenderer` (const object) / `standardPbrWgpuMeshMaterialRenderer.ts` | `standard_pbr_wgpu_mesh_material_renderer` (factory fn) + `StandardPbrWgpuMeshMaterialRenderer` (struct) + `draw_standard_pbr_wgpu_mesh` / `standard_pbr_wgpu_mesh_material_renderer.rs` | **Const-object → struct+factory translation.** TS exports a renderer descriptor as a `const` object; Rust splits it into a named struct, a factory fn (snake-case of the const name), and an extracted `draw_standard_pbr_wgpu_mesh` fn. Reasonable mechanics, names track; noted for completeness. The TS `ensureWgpuPbrMaterialBindGroup` / `uploadWgpuPbrMaterialUniform` / `writeWgpuPbrStandardBlock` / `getWgpuPbrMaterialScratch` from this file are folded into the renderer impl rather than re-exported as standalone fns. |
| The 20 per-material `register*WgpuMaterial` + `*WgpuMeshMaterialRenderer` families (lambert/phong/blinnPhong/toon/matcap/unlit/wireframe/normal/depth/emissive/vertexColor + 9 PBR variants: standard/specular/specularGlossiness/clearcoat/sheen/anisotropy/iridescence/subsurface/transmissionVolume) plus the full classic/toon/matcap/unlit/debug/wireframe prelude+pipeline+bind sets | only `register_standard_pbr_wgpu_material` + `StandardPbrWgpuMeshMaterialRenderer` | **Unported (expected for this slice).** Documented in `lib.rs` as a partial port; consistent with the visual-conformance posture. Not a name failure, but the gap is large (19 of 20 material families, all non-PBR preludes) and worth surfacing if scene-wgpu is meant to reach AAA. |
| `drawWgpuScene` / `drawWgpuScene.ts` | `draw_wgpu_scene` / `draw_wgpu_scene.rs` (COMPILING STUB) | **Stubbed.** Name maps 1:1; the body is a documented stub pending `prepare_scene_render` and the `Mesh` / `create_scene` scene graph (`flighthq-scene` exposes only `world_node`). Disclosed in `lib.rs`. Behavioral conformance not yet met. |

## In sync

The ported slice maps cleanly — camelCase→snake_case with full type words preserved, no abbreviations:

- `@flighthq/scene-wgpu` → `flighthq-scene-wgpu` — identity package→crate name; dependency sets match between `package.json` and `Cargo.toml` (camera, geometry, lighting, materials, mesh, node, render, render-wgpu, scene, types).
- `buildWgpuPbrDefineKey` → `build_wgpu_pbr_define_key`; `buildWgpuPbrDefineSource` → `build_wgpu_pbr_define_source`.
- `getWgpuPbrModuleBody` → `get_wgpu_pbr_module_body`; `getWgpuPbrModuleSourceForKey` → `get_wgpu_pbr_module_source_for_key`.
- `compileWgpuPbrPipeline` → `compile_wgpu_pbr_pipeline`; `ensureWgpuPbrPipeline` → `ensure_wgpu_pbr_pipeline`.
- `ensureWgpuMeshUpload` → `ensure_wgpu_mesh_upload`.
- `getWgpuMeshMaterialRenderer` / `registerWgpuMeshMaterialRenderer` / `resolveWgpuMeshMaterialRenderer` → exact `*_wgpu_mesh_material_renderer` equivalents.
- `buildWgpuPbrStandardDefineKey` → `build_wgpu_pbr_standard_define_key`.
- `registerStandardPbrWgpuMaterial` → `register_standard_pbr_wgpu_material`; `StandardPbrWgpuMeshMaterialRenderer` preserved as the struct name.
- `WgpuPbrDefineKey`, `WgpuPbrPipeline`, `WgpuSceneRuntime`, `WgpuMeshMaterialRenderer`, `WgpuMaterialBinding`, `WgpuMeshUpload` — type names preserved.
- File basenames track for the ported modules: `wgpuPbrPrelude.ts`↔`wgpu_pbr_prelude.rs`, `wgpuPbrPipelineCache.ts`↔`wgpu_pbr_pipeline_cache.rs`, `wgpuMeshUpload.ts`↔`wgpu_mesh_upload.rs`, `wgpuMeshMaterialRegistry.ts`↔`wgpu_mesh_material_registry.rs`, `wgpuSceneRuntime.ts`↔`wgpu_scene_runtime.rs`, `drawWgpuScene.ts`↔`draw_wgpu_scene.rs`, `registerStandardPbrWgpuMaterial.ts`↔`register_standard_pbr_wgpu_material.rs`, `standardPbrWgpuMeshMaterialRenderer.ts`↔`standard_pbr_wgpu_mesh_material_renderer.rs`.
- Opt-in registration with no module-load side effects — matches the TS side-effect-free rule.
- CPU-pure logic (define keys, cache key, MaterialBlock packing, sRGB→linear decode, alignment, the registry) is assertion-tested; the device-coupled bind/draw/upload/compile paths are validated functionally at the `wgpu` parity cell — the documented posture for GPU crates.

### Should be added to the divergence map

`conformance.md` covers the `world`→`scene` rename that drags in `scene-wgpu`, and the GPU-visual-conformance posture, but has **no scene-wgpu-specific entries**. Add:

1. `getWgpuSceneRuntime` → `create_wgpu_scene_runtime` (verb change; caller-owned runtime vs lazy-off-state; rationale already in `lib.rs`). Pairs with the identical `scene-gl` entry.
2. The `pub` widening of `align_to_4` (TS file-private `alignTo4`) and `build_wgpu_pbr_pipeline_cache_key` (TS inline) — either record as intentional or drop `pub`.
3. A note that `scene-wgpu` is a **partial** port (StandardPbr slice only; 19 other material families + the full classic/toon/matcap/unlit/debug/wireframe prelude/pipeline/bind sets are unported), so the 75-function "coverage gap" is expected, not drift. Symmetric with the `scene-gl` note.
