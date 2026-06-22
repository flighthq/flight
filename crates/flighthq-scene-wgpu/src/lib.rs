//! `flighthq-scene-wgpu` — WebGPU 3D scene renderer over the
//! `flighthq-render-wgpu` backend core.
//!
//! Ports the TypeScript `@flighthq/scene-wgpu` package: the standard PBR mesh
//! material renderer, the mesh-material registry, GPU mesh upload, the PBR
//! pipeline cache, the WGSL PBR prelude, the scene-wgpu per-state runtime, and the
//! scene draw walk.
//!
//! ## Port status
//!
//! The fully self-contained CPU logic is ported faithfully with its assertions:
//! [`wgpu_pbr_prelude`] (the WGSL uber-shader source assembly + define keys), the
//! pipeline-cache key builder ([`build_wgpu_pbr_pipeline_cache_key`]), the uniform
//! layout constants, and the 4-byte buffer alignment helper.
//!
//! The GPU- and graph-coupled paths are **compiling `// TODO(align)` stubs**: the
//! per-state runtime, the 3D mesh-material registry, mesh upload, pipeline
//! compilation, the StandardPbr renderer body, registration, and the draw walk.
//! They are blocked on cross-package 3D header types the upstream Rust port has not
//! landed yet — `WgpuMeshMaterialRenderer`, `StandardPbrMaterial` /
//! `StandardPbrMaterialKind`, `SceneLightBlock` / `SceneLights`, `SceneRenderProxy`,
//! the scene render list + `prepare_scene_render`, the `Mesh` / `createScene` /
//! `createMesh` scene graph, and the scene-wgpu runtime slots on
//! `WgpuRenderStateRuntime` — none of which a parallel agent may add here without
//! conflicting on `flighthq-types`. Each stub documents its blocker.
//!
//! Registration is opt-in (no module-load side effects).

pub mod draw_wgpu_scene;
pub mod register_standard_pbr_wgpu_material;
pub mod standard_pbr_wgpu_mesh_material_renderer;
pub mod wgpu_mesh_material_registry;
pub mod wgpu_mesh_upload;
pub mod wgpu_pbr_pipeline_cache;
pub mod wgpu_pbr_prelude;
pub mod wgpu_scene_runtime;

pub use draw_wgpu_scene::draw_wgpu_scene;
pub use register_standard_pbr_wgpu_material::register_standard_pbr_wgpu_material;
pub use standard_pbr_wgpu_mesh_material_renderer::{
    DRAW_UNIFORM_BYTES, FRAME_UNIFORM_BYTES, MATERIAL_UNIFORM_BYTES,
    StandardPbrWgpuMeshMaterialRenderer, WHITE_PIXEL, draw_standard_pbr_wgpu_mesh,
    standard_pbr_wgpu_mesh_material_renderer,
};
pub use wgpu_mesh_material_registry::{
    WgpuMeshMaterialRenderer, get_wgpu_mesh_material_renderer,
    register_wgpu_mesh_material_renderer, resolve_wgpu_mesh_material_renderer,
};
pub use wgpu_mesh_upload::{align_to_4, ensure_wgpu_mesh_upload};
pub use wgpu_pbr_pipeline_cache::{
    DEPTH_STENCIL_FORMAT, WgpuPbrPipeline, build_wgpu_pbr_pipeline_cache_key,
    compile_wgpu_pbr_pipeline, ensure_wgpu_pbr_pipeline,
};
pub use wgpu_pbr_prelude::{
    WgpuPbrDefineKey, build_wgpu_pbr_define_key, build_wgpu_pbr_define_source,
    get_wgpu_pbr_module_body, get_wgpu_pbr_module_source_for_key,
};
pub use wgpu_scene_runtime::{WgpuMeshUpload, WgpuSceneRuntime, get_wgpu_scene_runtime};
