use flight_render_gl::GlRenderState;

use crate::anisotropy_pbr_gl_extension::register_gl_anisotropy_pbr_extension;
use crate::clearcoat_pbr_gl_extension::register_gl_clearcoat_pbr_extension;
use crate::iridescence_pbr_gl_extension::register_gl_iridescence_pbr_extension;
use crate::sheen_pbr_gl_extension::register_gl_sheen_pbr_extension;
use crate::specular_pbr_gl_extension::register_gl_specular_pbr_extension;
use crate::transmission_volume_pbr_gl_extension::register_gl_transmission_volume_pbr_extension;
use crate::wrapped_diffuse_pbr_gl_extension::register_gl_wrapped_diffuse_pbr_extension;
use crate::gl_shaded_built_in_modifiers::register_built_in_gl_modifier_snippets;

fn register_gl_scene3d_material_renderers(state: &GlRenderState) {
    crate::gl_blinn_phong_mesh_material_renderer::register_gl_blinn_phong_material(state);
    crate::gl_custom_shader_mesh_material_renderer::register_gl_custom_shader_material(state);
    crate::gl_depth_mesh_material_renderer::register_gl_depth_material(state);
    crate::gl_emissive_mesh_material_renderer::register_gl_emissive_material(state);
    crate::gl_extended_pbr_mesh_material_renderer::register_gl_extended_pbr_material(state);
    crate::gl_lambert_mesh_material_renderer::register_gl_lambert_material(state);
    crate::gl_matcap_mesh_material_renderer::register_gl_matcap_material(state);
    crate::gl_normal_mesh_material_renderer::register_gl_normal_material(state);
    crate::gl_phong_mesh_material_renderer::register_gl_phong_material(state);
    crate::gl_shaded_mesh_material_renderer::register_gl_shaded_material(state);
    crate::gl_specular_glossiness_pbr_mesh_material_renderer::register_gl_specular_glossiness_pbr_material(state);
    crate::gl_standard_pbr_mesh_material_renderer::register_gl_standard_pbr_material(state);
    crate::gl_toon_mesh_material_renderer::register_gl_toon_material(state);
    crate::gl_unlit_mesh_material_renderer::register_gl_unlit_material(state);
    crate::gl_vertex_color_mesh_material_renderer::register_gl_vertex_color_material(state);
    crate::gl_wireframe_mesh_material_renderer::register_gl_wireframe_material(state);
}

fn register_gl_scene3d_pbr_extensions(state: &GlRenderState) {
    register_gl_anisotropy_pbr_extension(state);
    register_gl_clearcoat_pbr_extension(state);
    register_gl_iridescence_pbr_extension(state);
    register_gl_sheen_pbr_extension(state);
    register_gl_specular_pbr_extension(state);
    register_gl_transmission_volume_pbr_extension(state);
    register_gl_wrapped_diffuse_pbr_extension(state);
}

pub fn register_gl_scene3d_pipeline(state: &GlRenderState) {
    register_gl_scene3d_material_renderers(state);
    register_built_in_gl_modifier_snippets(state);
    register_gl_scene3d_pbr_extensions(state);
}
