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

pub mod anisotropy_pbr_wgpu_mesh_material_renderer;
pub mod blinn_phong_wgpu_mesh_material_renderer;
pub mod clearcoat_pbr_wgpu_mesh_material_renderer;
pub mod depth_wgpu_mesh_material_renderer;
pub mod draw_wgpu_scene;
pub mod emissive_wgpu_mesh_material_renderer;
pub mod iridescence_pbr_wgpu_mesh_material_renderer;
pub mod lambert_wgpu_mesh_material_renderer;
pub mod matcap_wgpu_mesh_material_renderer;
pub mod normal_wgpu_mesh_material_renderer;
pub mod phong_wgpu_mesh_material_renderer;
pub mod register_standard_pbr_wgpu_material;
pub mod sheen_pbr_wgpu_mesh_material_renderer;
pub mod specular_glossiness_pbr_wgpu_mesh_material_renderer;
pub mod specular_pbr_wgpu_mesh_material_renderer;
pub mod standard_pbr_wgpu_mesh_material_renderer;
pub mod subsurface_pbr_wgpu_mesh_material_renderer;
pub mod toon_wgpu_mesh_material_renderer;
pub mod transmission_volume_pbr_wgpu_mesh_material_renderer;
pub mod unlit_wgpu_mesh_material_renderer;
pub mod vertex_color_wgpu_mesh_material_renderer;
pub mod wgpu_classic_prelude;
pub mod wgpu_debug_prelude;
pub mod wgpu_matcap_prelude;
pub mod wgpu_mesh_material_registry;
pub mod wgpu_mesh_pipeline;
pub mod wgpu_mesh_upload;
pub mod wgpu_pbr_pipeline_cache;
pub mod wgpu_pbr_prelude;
pub mod wgpu_scene_runtime;
pub mod wgpu_toon_prelude;
pub mod wgpu_unlit_prelude;
pub mod wgpu_wireframe_prelude;
pub mod wireframe_wgpu_mesh_material_renderer;

pub use anisotropy_pbr_wgpu_mesh_material_renderer::{
    AnisotropyPbrWgpuMeshMaterialRenderer, anisotropy_pbr_wgpu_mesh_material_renderer,
    register_anisotropy_pbr_wgpu_material,
};
pub use blinn_phong_wgpu_mesh_material_renderer::{
    BlinnPhongWgpuMeshMaterialRenderer, blinn_phong_wgpu_mesh_material_renderer,
    register_blinn_phong_wgpu_material,
};
pub use clearcoat_pbr_wgpu_mesh_material_renderer::{
    ClearcoatPbrWgpuMeshMaterialRenderer, clearcoat_pbr_wgpu_mesh_material_renderer,
    register_clearcoat_pbr_wgpu_material,
};
pub use depth_wgpu_mesh_material_renderer::{
    DepthWgpuMeshMaterialRenderer, depth_wgpu_mesh_material_renderer, register_depth_wgpu_material,
};
pub use draw_wgpu_scene::draw_wgpu_scene;
pub use emissive_wgpu_mesh_material_renderer::{
    EmissiveWgpuMeshMaterialRenderer, emissive_wgpu_mesh_material_renderer,
    register_emissive_wgpu_material,
};
pub use iridescence_pbr_wgpu_mesh_material_renderer::{
    IridescencePbrWgpuMeshMaterialRenderer, iridescence_pbr_wgpu_mesh_material_renderer,
    register_iridescence_pbr_wgpu_material,
};
pub use lambert_wgpu_mesh_material_renderer::{
    LambertWgpuMeshMaterialRenderer, lambert_wgpu_mesh_material_renderer,
    register_lambert_wgpu_material,
};
pub use matcap_wgpu_mesh_material_renderer::{
    MatcapWgpuMeshMaterialRenderer, matcap_wgpu_mesh_material_renderer,
    register_matcap_wgpu_material,
};
pub use normal_wgpu_mesh_material_renderer::{
    NormalWgpuMeshMaterialRenderer, normal_wgpu_mesh_material_renderer,
    register_normal_wgpu_material,
};
pub use phong_wgpu_mesh_material_renderer::{
    PhongWgpuMeshMaterialRenderer, phong_wgpu_mesh_material_renderer, register_phong_wgpu_material,
};
pub use register_standard_pbr_wgpu_material::register_standard_pbr_wgpu_material;
pub use sheen_pbr_wgpu_mesh_material_renderer::{
    SheenPbrWgpuMeshMaterialRenderer, register_sheen_pbr_wgpu_material,
    sheen_pbr_wgpu_mesh_material_renderer,
};
pub use specular_glossiness_pbr_wgpu_mesh_material_renderer::{
    SpecularGlossinessPbrWgpuMeshMaterialRenderer, register_specular_glossiness_pbr_wgpu_material,
    specular_glossiness_pbr_wgpu_mesh_material_renderer,
};
pub use specular_pbr_wgpu_mesh_material_renderer::{
    SpecularPbrWgpuMeshMaterialRenderer, register_specular_pbr_wgpu_material,
    specular_pbr_wgpu_mesh_material_renderer,
};
pub use standard_pbr_wgpu_mesh_material_renderer::{
    DRAW_UNIFORM_BYTES, FRAME_UNIFORM_BYTES, MATERIAL_UNIFORM_BYTES, MATERIAL_UNIFORM_FLOATS,
    StandardPbrWgpuMeshMaterialRenderer, WHITE_PIXEL, bind_wgpu_pbr_mesh_material,
    build_wgpu_pbr_standard_define_key, draw_standard_pbr_wgpu_mesh,
    standard_pbr_wgpu_mesh_material_renderer, unpack_color_to_linear,
    write_wgpu_pbr_standard_block,
};
pub use subsurface_pbr_wgpu_mesh_material_renderer::{
    SubsurfacePbrWgpuMeshMaterialRenderer, register_subsurface_pbr_wgpu_material,
    subsurface_pbr_wgpu_mesh_material_renderer,
};
pub use toon_wgpu_mesh_material_renderer::{
    ToonWgpuMeshMaterialRenderer, register_toon_wgpu_material, toon_wgpu_mesh_material_renderer,
};
pub use transmission_volume_pbr_wgpu_mesh_material_renderer::{
    TransmissionVolumePbrWgpuMeshMaterialRenderer, register_transmission_volume_pbr_wgpu_material,
    transmission_volume_pbr_wgpu_mesh_material_renderer,
};
pub use unlit_wgpu_mesh_material_renderer::{
    UnlitWgpuMeshMaterialRenderer, register_unlit_wgpu_material, unlit_wgpu_mesh_material_renderer,
};
pub use vertex_color_wgpu_mesh_material_renderer::{
    VertexColorWgpuMeshMaterialRenderer, register_vertex_color_wgpu_material,
    vertex_color_wgpu_mesh_material_renderer,
};
pub use wgpu_classic_prelude::{
    WgpuClassicDefineKey, WgpuClassicLightingModel, WgpuClassicPipeline, bind_wgpu_classic_surface,
    build_wgpu_classic_define_key, compile_wgpu_classic_pipeline, ensure_wgpu_classic_pipeline,
    get_wgpu_classic_module_source_for_key,
};
pub use wgpu_debug_prelude::{
    WgpuDebugDefineKey, WgpuDebugMode, WgpuDebugPipeline, bind_wgpu_debug_surface,
    build_wgpu_debug_define_key, compile_wgpu_debug_pipeline, ensure_wgpu_debug_pipeline,
    get_wgpu_debug_module_source_for_key,
};
pub use wgpu_matcap_prelude::{
    WgpuMatcapDefineKey, WgpuMatcapPipeline, bind_wgpu_matcap_surface,
    build_wgpu_matcap_define_key, compile_wgpu_matcap_pipeline, ensure_wgpu_matcap_pipeline,
    get_wgpu_matcap_module_source_for_key,
};
pub use wgpu_mesh_material_registry::{
    WgpuMeshMaterialRenderer, get_wgpu_mesh_material_renderer,
    register_wgpu_mesh_material_renderer, resolve_wgpu_mesh_material_renderer,
    resolve_wgpu_mesh_material_renderer_key,
};
pub use wgpu_mesh_pipeline::{
    CreateWgpuMeshPipelineOptions, WGPU_MESH_PRELUDE_WGSL, WgpuMeshPipeline, WgpuSceneLayouts,
    begin_wgpu_mesh_draw, create_wgpu_mesh_pipeline, draw_wgpu_mesh_material_subset,
    ensure_wgpu_frame_bind_group, ensure_wgpu_placeholder_texture_view, ensure_wgpu_scene_layouts,
    ensure_wgpu_scene_pipeline, is_wgpu_texture_ready, unpack_color_to_linear_f32,
    write_wgpu_draw_uniform, write_wgpu_frame_uniform,
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
pub use wgpu_toon_prelude::{
    WgpuToonDefineKey, WgpuToonPipeline, bind_wgpu_toon_surface, build_wgpu_toon_define_key,
    compile_wgpu_toon_pipeline, ensure_wgpu_toon_pipeline, get_wgpu_toon_module_source_for_key,
};
pub use wgpu_unlit_prelude::{
    WgpuUnlitDefineKey, bind_wgpu_unlit_surface, build_wgpu_unlit_define_key,
    compile_wgpu_unlit_pipeline, ensure_wgpu_unlit_pipeline, get_wgpu_unlit_module_source_for_key,
};
pub use wgpu_wireframe_prelude::{
    WgpuWireframePipeline, bind_wgpu_wireframe_color, compile_wgpu_wireframe_pipeline,
    ensure_wgpu_wireframe_pipeline, get_wgpu_wireframe_module_source,
};
pub use wireframe_wgpu_mesh_material_renderer::{
    WireframeWgpuMeshMaterialRenderer, register_wireframe_wgpu_material,
    wireframe_wgpu_mesh_material_renderer,
};
