// flight-lint: conform-skip(makeWgpuScene3DState, makeWgpuSkinningAdapter) source test scaffolding (wgpuScene3DTestHelper.ts) is ported as the crate's Rust test doubles in tests/support.rs over a real noop device, never as public API
//! The WebGPU 3D scene renderer (TS `@flighthq/scene3d-wgpu`) over the native wgpu render backend
//! (D17): mesh-material renderers and their WGSL families, the shared mesh pipeline, environment
//! maps and image-based lighting, directional shadows, GPU skinning and 3D particles.

mod enable_wgpu_scene3d_custom_shader_guards;
mod enable_wgpu_scene3d_forward_light_selection_guards;
mod explain_wgpu_scene3d_coverage;
mod explain_wgpu_scene3d_forward_light_selection;
mod prepare_wgpu_scene3d_forward_lights;
mod register_wgpu_standard_pbr_material;
mod render_wgpu_scene3d;
mod scene3d_wgpu_pipeline;
mod types;
mod wgpu_blinn_phong_mesh_material_renderer;
mod wgpu_classic_prelude;
mod wgpu_custom_material_abi;
mod wgpu_custom_shader_mesh_material_renderer;
mod wgpu_debug_prelude;
mod wgpu_depth_mesh_material_renderer;
mod wgpu_emissive_mesh_material_renderer;
mod wgpu_environment_cube;
mod wgpu_environment_ibl_bake;
mod wgpu_environment_skybox;
mod wgpu_lambert_mesh_material_renderer;
mod wgpu_matcap_mesh_material_renderer;
mod wgpu_matcap_prelude;
mod wgpu_material_layout_entries;
mod wgpu_mesh_fragment_tail;
mod wgpu_mesh_material_registry;
mod wgpu_mesh_pipeline;
mod wgpu_mesh_upload;
mod wgpu_normal_mesh_material_renderer;
mod wgpu_particle_emitter3d;
mod wgpu_pbr_pipeline_cache;
mod wgpu_pbr_prelude;
mod wgpu_phong_mesh_material_renderer;
mod wgpu_scene3d_runtime;
mod wgpu_scene3d_time;
mod wgpu_shaded_mesh_material_renderer;
mod wgpu_shaded_modifier_snippet;
mod wgpu_shaded_prelude;
mod wgpu_shadow_map;
mod wgpu_skin_palette;
mod wgpu_specular_glossiness_pbr_mesh_material_renderer;
mod wgpu_standard_pbr_mesh_material_renderer;
mod wgpu_toon_mesh_material_renderer;
mod wgpu_toon_prelude;
mod wgpu_unlit_mesh_material_renderer;
mod wgpu_unlit_prelude;
mod wgpu_vertex_color_mesh_material_renderer;
mod wgpu_wireframe_mesh_material_renderer;
mod wgpu_wireframe_prelude;
mod wgpu_wireframe_upload;

pub mod contract;

// Public lane: the functions, renderers, snippets and presets exported by pinned TS `index.ts`, plus
// the locally owned types their signatures use. The shared mesh pipeline, family preludes, uploads,
// environment internals and per-state runtime stay contract-only.
pub use contract::are_wgpu_scene3d_custom_shader_guards_enabled;
pub use contract::are_wgpu_scene3d_forward_light_selection_guards_enabled;
pub use contract::bake_wgpu_environment_ibl;
pub use contract::enable_wgpu_scene3d_custom_shader_guards;
pub use contract::enable_wgpu_scene3d_forward_light_selection_guards;
pub use contract::explain_wgpu_scene3d_coverage;
pub use contract::explain_wgpu_scene3d_forward_light_selection;
pub use contract::get_wgpu_custom_material_shader_source;
pub use contract::get_wgpu_mesh_material_renderer;
pub use contract::get_wgpu_scene3d_time;
pub use contract::has_wgpu_scene3d_coverage;
pub use contract::prepare_wgpu_scene3d_forward_lights;
pub use contract::register_built_in_wgpu_modifier_snippets;
pub use contract::register_wgpu_blinn_phong_material;
pub use contract::register_wgpu_custom_material_shader;
pub use contract::register_wgpu_custom_shader_material;
pub use contract::register_wgpu_depth_material;
pub use contract::register_wgpu_emissive_material;
pub use contract::register_wgpu_gpu_skinning;
pub use contract::register_wgpu_lambert_material;
pub use contract::register_wgpu_matcap_material;
pub use contract::register_wgpu_mesh_material_renderer;
pub use contract::register_wgpu_modifier_snippet;
pub use contract::register_wgpu_normal_material;
pub use contract::register_wgpu_particle_emitter3d_pass;
pub use contract::register_wgpu_phong_material;
pub use contract::register_wgpu_shaded_material;
pub use contract::register_wgpu_specular_glossiness_pbr_material;
pub use contract::register_wgpu_standard_pbr_material;
pub use contract::register_wgpu_toon_material;
pub use contract::register_wgpu_unlit_material;
pub use contract::register_wgpu_vertex_color_material;
pub use contract::register_wgpu_wireframe_material;
pub use contract::render_wgpu_environment_skybox;
pub use contract::render_wgpu_scene3d;
pub use contract::render_wgpu_scene3d_shadow_map;
pub use contract::resolve_wgpu_mesh_material_renderer;
pub use contract::resolve_wgpu_modifier_snippet;
pub use contract::set_wgpu_scene3d_time;

pub use contract::ANIMATED_NORMAL_WGPU_MODIFIER_SNIPPET;
pub use contract::DISSOLVE_WGPU_MODIFIER_SNIPPET;
pub use contract::EMISSIVE_WGPU_MODIFIER_SNIPPET;
pub use contract::ENV_REFLECT_WGPU_MODIFIER_SNIPPET;
pub use contract::FOG_WGPU_MODIFIER_SNIPPET;
pub use contract::RIM_WGPU_MODIFIER_SNIPPET;
pub use contract::TOON_WGPU_MODIFIER_SNIPPET;
pub use contract::VERTEX_DISPLACE_WGPU_MODIFIER_SNIPPET;
pub use contract::WGPU_BLINN_PHONG_MESH_MATERIAL_RENDERER;
pub use contract::WGPU_CUSTOM_SHADER_MESH_MATERIAL_RENDERER;
pub use contract::WGPU_DEPTH_MESH_MATERIAL_RENDERER;
pub use contract::WGPU_EMISSIVE_MESH_MATERIAL_RENDERER;
pub use contract::WGPU_LAMBERT_MESH_MATERIAL_RENDERER;
pub use contract::WGPU_MATCAP_MESH_MATERIAL_RENDERER;
pub use contract::WGPU_NORMAL_MESH_MATERIAL_RENDERER;
pub use contract::WGPU_PHONG_MESH_MATERIAL_RENDERER;
pub use contract::WGPU_SCENE3D_RENDER_PRESET;
pub use contract::WGPU_SHADED_MESH_MATERIAL_RENDERER;
pub use contract::WGPU_SKINNING_ADAPTER;
pub use contract::WGPU_SPECULAR_GLOSSINESS_PBR_MESH_MATERIAL_RENDERER;
pub use contract::WGPU_STANDARD_PBR_MESH_MATERIAL_RENDERER;
pub use contract::WGPU_TOON_MESH_MATERIAL_RENDERER;
pub use contract::WGPU_UNLIT_MESH_MATERIAL_RENDERER;
pub use contract::WGPU_VERTEX_COLOR_MESH_MATERIAL_RENDERER;
pub use contract::WGPU_WIREFRAME_MESH_MATERIAL_RENDERER;

pub use contract::WgpuScene3DForwardLightList;
