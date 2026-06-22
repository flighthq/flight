//! `flighthq-scene-gl` — WebGL2 3D scene renderer over the `flighthq-render-gl`
//! backend core.
//!
//! Ports the TypeScript `@flighthq/scene-gl` package: the StandardPbr shader
//! prelude, the StandardPbr program cache, GPU mesh upload, the 3D mesh-material
//! registry + scene runtime, the standard PBR mesh-material renderer, its
//! registration, and the scene draw walk.
//!
//! Port status (the dependent 3D pipeline is only partially ported to Rust):
//!   - `gl_pbr_prelude` — full faithful port, assertion-ported tests.
//!   - `gl_mesh_material_registry` + `gl_scene_runtime` — full port; registry
//!     resolution semantics (by-kind, default-kind fallback, no-fallback)
//!     assertion-tested. Threads a caller-owned `GlSceneRuntime` rather than
//!     fetching it off the state (the Rust `GlRenderStateRuntime` lacks the scene
//!     slots, and a `WeakMap`-by-identity has no clean Rust analog).
//!   - `gl_mesh_upload` / `gl_pbr_program_cache` — faithful glow ports; the pure
//!     format/location/cache-key logic is assertion-tested, the live-GL paths are
//!     validated functionally (no GL device in unit tests, matching
//!     `flighthq-render-gl`).
//!   - `standard_pbr_gl_mesh_material_renderer` — program/depth/cull/camera/light
//!     uploads + indexed draw ported; the concrete-material uniform/texture reads
//!     are stubbed (`StandardPbrMaterial` / `unpackColorToLinear` unported).
//!   - `draw_gl_scene` — COMPILING STUB; needs the unported `prepare_scene_render`
//!     / `SceneRenderList` / scene-graph `Mesh` / `SceneLights` contract.
//!
//! Registration is opt-in (no module-load side effects).

pub mod draw_gl_scene;
pub mod gl_mesh_material_registry;
pub mod gl_mesh_upload;
pub mod gl_pbr_prelude;
pub mod gl_pbr_program_cache;
pub mod gl_scene_runtime;
pub mod register_standard_pbr_gl_material;
pub mod scene_render_contract;
pub mod standard_pbr_gl_mesh_material_renderer;

pub use draw_gl_scene::draw_gl_scene;
pub use gl_mesh_material_registry::{
    GlMeshMaterialRenderer, MeshMaterial, get_gl_mesh_material_renderer,
    register_gl_mesh_material_renderer, resolve_gl_mesh_material_renderer,
};
pub use gl_mesh_upload::{
    ensure_gl_mesh_upload, gl_pbr_attribute_location, resolve_gl_vertex_format,
};
pub use gl_pbr_prelude::{
    GlPbrDefineKey, build_gl_pbr_define_key, build_gl_pbr_define_source,
    get_gl_pbr_fragment_source, get_gl_pbr_fragment_source_for_key, get_gl_pbr_vertex_source,
    get_gl_pbr_vertex_source_for_key,
};
pub use gl_pbr_program_cache::{GlPbrProgram, compile_gl_pbr_program, ensure_gl_pbr_program};
pub use gl_scene_runtime::{GlMeshUpload, GlSceneRuntime, create_gl_scene_runtime};
pub use register_standard_pbr_gl_material::register_standard_pbr_gl_material;
pub use scene_render_contract::{Camera, SceneLightBlock, SceneRenderProxy, SceneRenderSubset};
pub use standard_pbr_gl_mesh_material_renderer::{
    StandardPbrGlMeshMaterialRenderer, standard_pbr_material_kind,
};
