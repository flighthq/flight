// flight-lint: conform-skip(makeFakeGl2, makeGlScene3DState) source-only fake WebGL2 test helpers are implemented in the native integration-test harness (tests/gl_test_helper.rs) rather than exported from production
//! GL 3D scene rendering (TS `@flighthq/scene3d-gl`): mesh-material renderers, shader program
//! families, environment maps, shadow maps and particle emitters for the glow backend. The GL path is
//! thread-bound (D17): every renderer receives the backend-typed `GlRenderState`.

mod anisotropy_pbr_gl_extension;
mod clearcoat_pbr_gl_extension;
mod enable_gl_pbr_extension_guards;
mod enable_gl_scene3d_color_space_guards;
mod enable_gl_scene3d_custom_shader_guards;
mod enable_gl_scene3d_deform_guards;
mod enable_gl_scene3d_forward_light_selection_guards;
mod explain_gl_mesh_geometry_uv_sets;
mod explain_gl_scene3d_coverage;
mod explain_gl_scene3d_forward_light_selection;
mod gl_blinn_phong_mesh_material_renderer;
mod gl_classic_prelude;
mod gl_custom_shader_mesh_material_renderer;
mod gl_debug_prelude;
mod gl_depth_mesh_material_renderer;
mod gl_emissive_mesh_material_renderer;
mod gl_environment_capture;
mod gl_environment_cube;
mod gl_environment_ibl_bake;
mod gl_environment_skybox;
mod gl_extended_pbr_mesh_material_renderer;
mod gl_lambert_mesh_material_renderer;
mod gl_lit_program;
mod gl_matcap_mesh_material_renderer;
mod gl_matcap_prelude;
mod gl_mesh_fragment_tail;
mod gl_mesh_material_registry;
mod gl_mesh_program;
mod gl_mesh_skinning;
mod gl_mesh_upload;
mod gl_normal_mesh_material_renderer;
mod gl_particle_emitter3d;
mod gl_pbr_extension_registry;
mod gl_pbr_prelude;
mod gl_pbr_program_cache;
mod gl_pbr_standard_block;
mod gl_pbr_transmission_scene_color;
mod gl_phong_mesh_material_renderer;
mod gl_scene3d_runtime;
mod gl_scene3d_time;
mod gl_shaded_built_in_modifiers;
mod gl_shaded_mesh_material_renderer;
mod gl_shaded_modifier_snippet;
mod gl_shaded_prelude;
mod gl_shadow_map;
mod gl_specular_glossiness_pbr_mesh_material_renderer;
mod gl_standard_pbr_mesh_material_renderer;
mod gl_toon_mesh_material_renderer;
mod gl_toon_prelude;
mod gl_unlit_mesh_material_renderer;
mod gl_unlit_prelude;
mod gl_vertex_color_mesh_material_renderer;
mod gl_viewport_aspect;
mod gl_wireframe_mesh_material_renderer;
mod gl_wireframe_prelude;
mod gl_wireframe_upload;
mod iridescence_pbr_gl_extension;
mod prepare_gl_scene3d_forward_lights;
mod present_gl_scene3d;
mod register_gl_standard_pbr_material;
mod render_gl_scene3d;
mod scene3d_gl_pipeline;
mod sheen_pbr_gl_extension;
mod specular_pbr_gl_extension;
mod transmission_volume_pbr_gl_extension;
mod wrapped_diffuse_pbr_gl_extension;
mod types;

pub mod contract;

pub use contract::*;
