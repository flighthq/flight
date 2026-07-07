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
//! The Header phase promoted the 3D render-contract + PBR material header types,
//! so the GPU- and material-coupled paths are now ported against them, mirroring
//! the sibling `flighthq-scene-gl`:
//!
//! - the per-state scene runtime ([`create_wgpu_scene_runtime`] — a caller-owned
//!   struct, since `WgpuRenderStateRuntime` carries no scene slots),
//! - the 3D mesh-material registry (get / register / resolve over the runtime,
//!   keyed by `flighthq_types::material::Material::kind`),
//! - lazy GPU mesh upload ([`ensure_wgpu_mesh_upload`]),
//! - StandardPbr pipeline compilation + caching ([`compile_wgpu_pbr_pipeline`] /
//!   [`ensure_wgpu_pbr_pipeline`]),
//! - the StandardPbr renderer `bind`/`draw` (reads `StandardPbrMaterial`, packs
//!   the MaterialBlock with sRGB→linear, writes the Frame uniform + draw ring
//!   slot, issues the indexed draw), and its registration,
//! - the scene draw walk ([`draw_wgpu_scene`]) over the now-ported
//!   `prepare_scene_render` / `SceneRenderList`: the opaque + blended two-pass
//!   partition, the back-to-front blended sort, and the alias-safe
//!   lift-and-reinsert contiguous-run binding (of both the renderer box and the
//!   non-`Clone` mesh upload).
//!
//! The GPU bind/draw/upload/compile paths need a live `wgpu::Device`, so they are
//! validated functionally (the parity matrix at the `wgpu` cell), not by unit name
//! match — the same posture as `flighthq-render-wgpu`. The pure CPU logic (define
//! keys, pipeline-cache key, MaterialBlock packing, color decode, alignment, the
//! registry over the runtime, and the walk's normal matrix / blended comparator /
//! subset-material resolution) is assertion-tested.
//!
//! Two seams in the walk await header work (both isolated to a single function
//! each, and both take the current scenes' `None`-material path unchanged):
//! per-material blend routing needs a readable `alpha_mode` on a stored
//! `dyn Material` (`is_blended_material` reports `false` until then), and the
//! renderer's concrete per-material field upload needs a `Material` downcast seam.
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
    StandardPbrWgpuMeshMaterialRenderer, WHITE_PIXEL, build_wgpu_pbr_standard_define_key,
    draw_standard_pbr_wgpu_mesh, standard_pbr_wgpu_mesh_material_renderer,
};
pub use wgpu_mesh_material_registry::{
    WgpuMeshMaterialRenderer, get_wgpu_mesh_material_renderer,
    register_wgpu_mesh_material_renderer, resolve_wgpu_mesh_material_renderer,
    resolve_wgpu_mesh_material_renderer_key,
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
pub use wgpu_scene_runtime::{
    WgpuMaterialBinding, WgpuMeshUpload, WgpuSceneRuntime, create_wgpu_scene_runtime,
};
