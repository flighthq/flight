//! `flighthq-scene-gl` — WebGL2 3D scene renderer over the `flighthq-render-gl`
//! backend core.
//!
//! Ports the TypeScript `@flighthq/scene-gl` package: the StandardPbr shader
//! prelude, the StandardPbr program cache, GPU mesh upload, the 3D mesh-material
//! registry + scene runtime, the full mesh-material renderer family (StandardPbr
//! plus the eight KHR PBR extensions, and the base Unlit / VertexColor / Lambert /
//! BlinnPhong / Phong / Toon / Matcap / Normal / Depth / Wireframe / Emissive
//! renderers) with their per-kind registration, the classic / unlit / toon /
//! matcap / debug / wireframe shader preludes and the shared lit/mesh program
//! machinery, the environment (cube / IBL bake / skybox) and shadow-map passes,
//! and the scene draw walk.
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
//!   - `draw_gl_scene` — full port of the walk over the now-ported
//!     `prepare_scene_render` / `SceneRenderList`: the opaque + blended two-pass
//!     partition, the back-to-front blended sort, and the alias-safe
//!     lift-and-reinsert contiguous-run binding. The pure helpers (the normal
//!     matrix, the blended comparator, subset material resolution) are
//!     assertion-tested; the live-GL bind/draw path is validated functionally.
//!     Two seams await header work (both isolated to a single function each, and
//!     both take the current scenes' `None`-material path unchanged): concrete
//!     per-material field upload needs a `Material` downcast to `MeshMaterial`,
//!     and per-material blend routing needs a readable `alpha_mode` — a stored
//!     `dyn Material` exposes neither today.
//!
//! Registration is opt-in (no module-load side effects).

pub mod anisotropy_pbr_gl_mesh_material_renderer;
pub mod blinn_phong_gl_mesh_material_renderer;
pub mod clearcoat_pbr_gl_mesh_material_renderer;
pub mod depth_gl_mesh_material_renderer;
pub mod draw_gl_scene;
pub mod emissive_gl_mesh_material_renderer;
pub mod gl_classic_prelude;
pub mod gl_debug_prelude;
pub mod gl_environment_cube;
pub mod gl_environment_ibl_bake;
pub mod gl_environment_skybox;
pub mod gl_lit_program;
pub mod gl_matcap_prelude;
pub mod gl_mesh_material_registry;
pub mod gl_mesh_program;
pub mod gl_mesh_upload;
pub mod gl_pbr_prelude;
pub mod gl_pbr_program_cache;
pub mod gl_pbr_standard_bind;
pub mod gl_scene_runtime;
pub mod gl_shadow_map;
pub mod gl_toon_prelude;
pub mod gl_unlit_prelude;
pub mod gl_wireframe_prelude;
pub mod gl_wireframe_upload;
pub mod iridescence_pbr_gl_mesh_material_renderer;
pub mod lambert_gl_mesh_material_renderer;
pub mod matcap_gl_mesh_material_renderer;
pub mod normal_gl_mesh_material_renderer;
pub mod phong_gl_mesh_material_renderer;
pub mod register_standard_pbr_gl_material;
pub mod sheen_pbr_gl_mesh_material_renderer;
pub mod specular_glossiness_pbr_gl_mesh_material_renderer;
pub mod specular_pbr_gl_mesh_material_renderer;
pub mod standard_pbr_gl_mesh_material_renderer;
pub mod subsurface_pbr_gl_mesh_material_renderer;
pub mod toon_gl_mesh_material_renderer;
pub mod transmission_volume_pbr_gl_mesh_material_renderer;
pub mod unlit_gl_mesh_material_renderer;
pub mod vertex_color_gl_mesh_material_renderer;
pub mod wireframe_gl_mesh_material_renderer;

pub use anisotropy_pbr_gl_mesh_material_renderer::{
    AnisotropyPbrGlMeshMaterialRenderer, register_anisotropy_pbr_gl_material,
};
pub use blinn_phong_gl_mesh_material_renderer::{
    BlinnPhongGlMeshMaterialRenderer, register_blinn_phong_gl_material,
};
pub use clearcoat_pbr_gl_mesh_material_renderer::{
    ClearcoatPbrGlMeshMaterialRenderer, register_clearcoat_pbr_gl_material,
};
pub use depth_gl_mesh_material_renderer::{
    DepthGlMeshMaterialRenderer, register_depth_gl_material,
};
pub use draw_gl_scene::draw_gl_scene;
pub use emissive_gl_mesh_material_renderer::{
    EmissiveGlMeshMaterialRenderer, register_emissive_gl_material,
};
pub use gl_classic_prelude::{
    GlClassicDefineKey, GlClassicLightingModel, GlClassicProgram, build_gl_classic_define_key,
    compile_gl_classic_program, ensure_gl_classic_program, get_gl_classic_fragment_source,
    get_gl_classic_fragment_source_for_key, get_gl_classic_vertex_source,
    get_gl_classic_vertex_source_for_key,
};
pub use gl_debug_prelude::{
    GlDebugDefineKey, GlDebugMode, GlDebugProgram, bind_gl_debug_normal_map, bind_gl_debug_range,
    build_gl_debug_define_key, compile_gl_debug_program, ensure_gl_debug_program,
    get_gl_debug_fragment_source_for_key, get_gl_debug_vertex_source_for_key,
};
pub use gl_environment_cube::{ensure_gl_environment_source_cube, get_gl_cube_face_target};
pub use gl_environment_ibl_bake::{bake_environment_ibl, destroy_gl_bake_programs};
pub use gl_environment_skybox::draw_gl_environment_skybox;
pub use gl_lit_program::{
    GL_MESH_LIGHT_BLOCK_GLSL, GlLitProgram, bind_gl_mesh_light_block, resolve_gl_lit_locations,
};
pub use gl_matcap_prelude::{
    GlMatcapDefineKey, GlMatcapProgram, bind_gl_matcap_surface, build_gl_matcap_define_key,
    compile_gl_matcap_program, ensure_gl_matcap_program, get_gl_matcap_fragment_source_for_key,
    get_gl_matcap_vertex_source_for_key,
};
pub use gl_mesh_material_registry::{
    GlMeshMaterialRenderer, MeshMaterial, get_gl_mesh_material_renderer,
    register_gl_mesh_material_renderer, resolve_gl_mesh_material_renderer,
    resolve_gl_mesh_material_renderer_key,
};
pub use gl_mesh_program::{
    GlMeshProgram, begin_gl_mesh_draw, compile_gl_program, destroy_gl_mesh_program,
    draw_gl_mesh_subset, ensure_gl_scene_program, set_gl_mesh_camera_position,
    set_gl_mesh_view_projection,
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
pub use gl_shadow_map::draw_gl_scene_shadow_map;
pub use gl_toon_prelude::{
    GlToonDefineKey, GlToonProgram, build_gl_toon_define_key, compile_gl_toon_program,
    ensure_gl_toon_program, get_gl_toon_fragment_source_for_key, get_gl_toon_vertex_source_for_key,
};
pub use gl_unlit_prelude::{
    GlUnlitDefineKey, GlUnlitProgram, bind_gl_unlit_surface, build_gl_unlit_define_key,
    compile_gl_unlit_program, ensure_gl_unlit_program, get_gl_unlit_fragment_source_for_key,
    get_gl_unlit_vertex_source_for_key,
};
pub use gl_wireframe_prelude::{
    GlWireframeProgram, compile_gl_wireframe_program, ensure_gl_wireframe_program,
    get_gl_wireframe_fragment_source, get_gl_wireframe_vertex_source,
};
pub use gl_wireframe_upload::{
    GlWireframeUpload, destroy_gl_wireframe_upload, ensure_gl_wireframe_upload,
};
pub use iridescence_pbr_gl_mesh_material_renderer::{
    IridescencePbrGlMeshMaterialRenderer, register_iridescence_pbr_gl_material,
};
pub use lambert_gl_mesh_material_renderer::{
    LambertGlMeshMaterialRenderer, register_lambert_gl_material,
};
pub use matcap_gl_mesh_material_renderer::{
    MatcapGlMeshMaterialRenderer, register_matcap_gl_material,
};
pub use normal_gl_mesh_material_renderer::{
    NormalGlMeshMaterialRenderer, register_normal_gl_material,
};
pub use phong_gl_mesh_material_renderer::{
    PhongGlMeshMaterialRenderer, register_phong_gl_material,
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
pub use toon_gl_mesh_material_renderer::{ToonGlMeshMaterialRenderer, register_toon_gl_material};
pub use transmission_volume_pbr_gl_mesh_material_renderer::{
    TransmissionVolumePbrGlMeshMaterialRenderer, register_transmission_volume_pbr_gl_material,
};
pub use unlit_gl_mesh_material_renderer::{
    UnlitGlMeshMaterialRenderer, register_unlit_gl_material,
};
pub use vertex_color_gl_mesh_material_renderer::{
    VertexColorGlMeshMaterialRenderer, register_vertex_color_gl_material,
};
pub use wireframe_gl_mesh_material_renderer::{
    WireframeGlMeshMaterialRenderer, register_wireframe_gl_material,
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
