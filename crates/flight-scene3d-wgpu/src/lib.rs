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

pub use contract::*;
