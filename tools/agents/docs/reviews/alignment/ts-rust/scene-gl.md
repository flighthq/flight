# TS↔Rust Alignment: @flighthq/scene-gl

**Verdict:** Partially ported by design — `scene-gl` is in the visual-conformance allowlist (GPU shader output, not name-match gated), and the present 11-function StandardPbr slice maps cleanly; but two real naming/surface divergences (`getGlSceneRuntime`→`create_gl_scene_runtime`, and `pub` helpers that are private in TS) are undocumented drift that should be recorded.

## Name map findings

`@flighthq/scene-gl` exports 82 functions across ~36 source files. The Rust crate `flighthq-scene-gl` ports a deliberate StandardPbr-only slice (8 modules, 11 re-exported functions + a few types). Because `scene-gl` is listed in `scripts/rust-conformance.ts` (line 173) and `conformance.md` line 115 as a GPU backend whose conformance is **visual** (the `gl` parity cell), the 71 unported functions are reported as "coverage gaps" but are **not** name-match failures — that is the intended posture for this crate. The findings below are the judgments the script cannot make.

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `getGlSceneRuntime` / `glSceneRuntime.ts` | `create_gl_scene_runtime` / `gl_scene_runtime.rs` | **Naming divergence, undocumented.** TS lazily fetches/creates one runtime per `GlRenderState` (`get*`); Rust threads a caller-owned runtime and uses `create_*`. The crate's `lib.rs` doc-comment explains the rationale (the Rust `GlRenderStateRuntime` lacks the scene slots; a `WeakMap`-by-identity has no clean Rust analog), but the conformance map in `conformance.md` has no entry for it. This is a `get_`→`create_` verb change that should be a recorded divergence, not a doc-comment-only note. |
| `resolveGlVertexFormat` (module-private, `glMeshUpload.ts`) | `pub resolve_gl_vertex_format` / `gl_mesh_upload.rs` | **Extra public surface.** TS keeps this a file-private helper (no `export`); Rust exposes it `pub` and re-exports from `lib.rs`. Not in the upstream public API. Either drop `pub` or record as an intentional widening. |
| (no TS export — internal attribute mapping) | `pub gl_pbr_attribute_location` / `gl_mesh_upload.rs` | **Extra public surface.** No `glPbrAttributeLocation` export exists in TS scene-gl; the attribute-location logic is internal to `glMeshProgram`/`glMeshUpload`. Rust elevates it to a public function. Not upstream API. |
| (no TS export — bound-material seam) | `pub trait MeshMaterial` / `gl_mesh_material_registry.rs` | **Extra public type, Rust-only.** `MeshMaterial` is not a `@flighthq/scene-gl` export. It is the Rust expression of the bound-material seam (TS threads a concrete material). Acceptable as a port-mechanics type, but it is undocumented Rust-only surface. |
| `GlMeshUpload` (type, defined in `glMeshUpload.ts`) | `GlMeshUpload` (struct, defined in `gl_scene_runtime.rs`) | **File-tracking nit.** Same name, but the struct moved from the upload module to the runtime module. Basename no longer tracks its TS home (`gl_mesh_upload.rs` would mirror `glMeshUpload.ts`). Re-exported, so the public name is fine; only the source location drifts. |
| The 20 per-material `register*GlMaterial` + `*GlMeshMaterialRenderer` families (lambert/phong/blinnPhong/toon/matcap/unlit/wireframe/normal/depth/emissive/vertexColor + 9 PBR variants) | only `register_standard_pbr_gl_material` + `StandardPbrGlMeshMaterialRenderer` | **Unported (expected for this slice).** Documented in `lib.rs` as a partial port; consistent with the visual-conformance posture. Not flagged as a name failure, but the gap is large and worth surfacing if scene-gl is meant to reach AAA. |
| `drawGlScene` / `drawGlScene.ts` | `draw_gl_scene` / `draw_gl_scene.rs` (COMPILING STUB) | **Stubbed.** Name maps 1:1; the body is a stub pending `prepare_scene_render` / `SceneRenderList` / scene-graph `Mesh` / `SceneLights`. Disclosed in `lib.rs`. Behavioral conformance not yet met. |

## In sync

The ported slice maps cleanly — camelCase→snake_case with full type words preserved, no abbreviations:

- `@flighthq/scene-gl` → `flighthq-scene-gl` — identity package→crate name.
- `buildGlPbrDefineKey` → `build_gl_pbr_define_key`, `buildGlPbrDefineSource` → `build_gl_pbr_define_source`.
- `getGlPbrFragmentSource` / `...ForKey` and `getGlPbrVertexSource` / `...ForKey` → exact snake_case equivalents.
- `compileGlPbrProgram` → `compile_gl_pbr_program`; `ensureGlPbrProgram` → `ensure_gl_pbr_program`.
- `ensureGlMeshUpload` → `ensure_gl_mesh_upload`.
- `getGlMeshMaterialRenderer` / `registerGlMeshMaterialRenderer` / `resolveGlMeshMaterialRenderer` → exact `*_gl_mesh_material_renderer` equivalents (registry resolution semantics assertion-tested).
- `registerStandardPbrGlMaterial` → `register_standard_pbr_gl_material`; `StandardPbrGlMeshMaterialRenderer` preserved as the struct name.
- `GlPbrProgram`, `GlPbrDefineKey`, `GlSceneRuntime`, `GlMeshMaterialRenderer` (trait) — type names preserved.
- File basenames track for the ported modules: `glPbrPrelude.ts`↔`gl_pbr_prelude.rs`, `glPbrProgramCache.ts`↔`gl_pbr_program_cache.rs`, `glMeshUpload.ts`↔`gl_mesh_upload.rs`, `glMeshMaterialRegistry.ts`↔`gl_mesh_material_registry.rs`, `glSceneRuntime.ts`↔`gl_scene_runtime.rs`, `drawGlScene.ts`↔`draw_gl_scene.rs`, `registerStandardPbrGlMaterial.ts`↔`register_standard_pbr_gl_material.rs`, `standardPbrGlMeshMaterialRenderer.ts`↔`standard_pbr_gl_mesh_material_renderer.rs`.
- Re-export of header types (`Camera`, `StandardPbrMaterial*`, `SceneLightBlock`/`SceneLights`/`SceneRenderProxy`) from `flighthq-types` mirrors how the TS package re-exports the header types it draws from.
- Opt-in registration with no module-load side effects — matches the TS side-effect-free rule.

### Should be added to the divergence map

`conformance.md` covers the `world`→`scene` rename that drags in `scene-gl`, and the GPU-visual-conformance posture, but has **no scene-gl-specific entries**. Add:

1. `getGlSceneRuntime` → `create_gl_scene_runtime` (verb change; caller-owned runtime vs lazy-off-state; rationale already in `lib.rs`).
2. The `pub` widening of `resolve_gl_vertex_format` / `gl_pbr_attribute_location` (TS-private → Rust-public) — either record as intentional or drop `pub`.
3. The Rust-only `MeshMaterial` trait as a port-mechanics seam.
4. A note that `scene-gl` is a **partial** port (StandardPbr slice only; 20 other material families + the full `glClassic`/`glToon`/`glMatcap`/`glUnlit`/`glDebug`/`glWireframe` prelude set are unported), so the 71-function "coverage gap" is expected, not drift.
