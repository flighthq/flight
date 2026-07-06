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
//!   - `standard_pbr_gl_mesh_material_renderer` — full faithful port:
//!     program/depth/cull/camera/light uploads, the concrete-material scalar/
//!     color/alpha-cutoff uniform reads from `flighthq_types::StandardPbrMaterial`,
//!     the base-color/normal texture binds, and the indexed draw. (`unpack_color_to_linear`
//!     is ported locally — see the gap note below — until `flighthq-materials`
//!     promotes it.)
//!   - `draw_gl_scene` — COMPILING STUB; needs the unported `prepare_scene_render`
//!     / `SceneRenderList` / scene-graph `Mesh` / `SceneLights` contract.
//!
//! Registration is opt-in (no module-load side effects).

pub mod anisotropy_pbr_gl_mesh_material_renderer;
pub mod clearcoat_pbr_gl_mesh_material_renderer;
pub mod draw_gl_scene;
pub mod gl_mesh_material_registry;
pub mod gl_mesh_upload;
pub mod gl_pbr_prelude;
pub mod gl_pbr_program_cache;
pub mod gl_pbr_standard_bind;
pub mod gl_scene_runtime;
pub mod iridescence_pbr_gl_mesh_material_renderer;
pub mod register_standard_pbr_gl_material;
pub mod sheen_pbr_gl_mesh_material_renderer;
pub mod specular_glossiness_pbr_gl_mesh_material_renderer;
pub mod specular_pbr_gl_mesh_material_renderer;
pub mod standard_pbr_gl_mesh_material_renderer;
pub mod subsurface_pbr_gl_mesh_material_renderer;
pub mod transmission_volume_pbr_gl_mesh_material_renderer;

pub use anisotropy_pbr_gl_mesh_material_renderer::{
    AnisotropyPbrGlMeshMaterialRenderer, register_anisotropy_pbr_gl_material,
};
pub use clearcoat_pbr_gl_mesh_material_renderer::{
    ClearcoatPbrGlMeshMaterialRenderer, register_clearcoat_pbr_gl_material,
};
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
pub use gl_pbr_standard_bind::{
    GL_PBR_BASE_COLOR_TEXTURE_UNIT, GL_PBR_EMISSIVE_TEXTURE_UNIT, GL_PBR_EXTENSION_TEXTURE_UNIT,
    GL_PBR_METALLIC_ROUGHNESS_TEXTURE_UNIT, GL_PBR_NORMAL_TEXTURE_UNIT,
    GL_PBR_OCCLUSION_TEXTURE_UNIT, bind_gl_pbr_camera, bind_gl_pbr_lights, bind_gl_pbr_mesh_common,
    bind_gl_pbr_standard_block, bind_gl_pbr_standard_texture, build_gl_pbr_standard_define_key,
    is_gl_texture_ready, unpack_color_to_linear,
};
pub use gl_scene_runtime::{GlMeshUpload, GlSceneRuntime, create_gl_scene_runtime};
pub use iridescence_pbr_gl_mesh_material_renderer::{
    IridescencePbrGlMeshMaterialRenderer, register_iridescence_pbr_gl_material,
};
pub use register_standard_pbr_gl_material::register_standard_pbr_gl_material;
pub use sheen_pbr_gl_mesh_material_renderer::{
    SheenPbrGlMeshMaterialRenderer, register_sheen_pbr_gl_material,
};
pub use specular_glossiness_pbr_gl_mesh_material_renderer::{
    SpecularGlossinessPbrGlMeshMaterialRenderer, register_specular_glossiness_pbr_gl_material,
};
pub use specular_pbr_gl_mesh_material_renderer::{
    SpecularPbrGlMeshMaterialRenderer, register_specular_pbr_gl_material,
};
pub use standard_pbr_gl_mesh_material_renderer::{
    StandardPbrGlMeshMaterialRenderer, build_standard_pbr_define_key, draw_gl_pbr_mesh_subset,
};
pub use subsurface_pbr_gl_mesh_material_renderer::{
    SubsurfacePbrGlMeshMaterialRenderer, register_subsurface_pbr_gl_material,
};
pub use transmission_volume_pbr_gl_mesh_material_renderer::{
    TransmissionVolumePbrGlMeshMaterialRenderer, register_transmission_volume_pbr_gl_material,
};
// The 3D scene-render contract and PBR material types are now promoted to the
// `flighthq-types` header; scene-gl re-exports them so downstream code can reach
// them through the renderer crate (matching how the TS package re-exports the
// header types it draws from).
pub use flighthq_types::camera::Camera;
pub use flighthq_types::pbr_extension_material::{
    AnisotropyPbrMaterial, ClearcoatPbrMaterial, IridescencePbrMaterial, SheenPbrMaterial,
    SpecularGlossinessPbrMaterial, SpecularPbrMaterial, SubsurfacePbrMaterial,
    TransmissionVolumePbrMaterial,
};
pub use flighthq_types::pbr_material::{
    StandardPbrMaterial, StandardPbrMaterialProperties, standard_pbr_material_kind,
};
pub use flighthq_types::scene_render::{SceneLightBlock, SceneLights, SceneRenderProxy};
