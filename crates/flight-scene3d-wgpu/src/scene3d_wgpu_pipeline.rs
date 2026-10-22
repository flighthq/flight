use flight_render_wgpu::WgpuRenderState;

use crate::wgpu_depth_mesh_material_renderer::register_wgpu_depth_material;
use crate::wgpu_normal_mesh_material_renderer::register_wgpu_normal_material;
use crate::wgpu_vertex_color_mesh_material_renderer::register_wgpu_vertex_color_material;
use crate::wgpu_emissive_mesh_material_renderer::register_wgpu_emissive_material;
use crate::wgpu_wireframe_mesh_material_renderer::register_wgpu_wireframe_material;
use crate::wgpu_unlit_mesh_material_renderer::register_wgpu_unlit_material;
use crate::wgpu_lambert_mesh_material_renderer::register_wgpu_lambert_material;
use crate::wgpu_phong_mesh_material_renderer::register_wgpu_phong_material;
use crate::wgpu_blinn_phong_mesh_material_renderer::register_wgpu_blinn_phong_material;
use crate::wgpu_matcap_mesh_material_renderer::register_wgpu_matcap_material;
use crate::wgpu_toon_mesh_material_renderer::register_wgpu_toon_material;
use crate::wgpu_shaded_mesh_material_renderer::register_wgpu_shaded_material;
use crate::wgpu_standard_pbr_mesh_material_renderer::register_wgpu_standard_pbr_material;
use crate::wgpu_specular_glossiness_pbr_mesh_material_renderer::register_wgpu_specular_glossiness_pbr_material;
use crate::wgpu_custom_shader_mesh_material_renderer::register_wgpu_custom_shader_material;

pub fn build_wgpu_scene3d_pipeline(state: &WgpuRenderState) {
    register_wgpu_depth_material(state);
    register_wgpu_normal_material(state);
    register_wgpu_vertex_color_material(state);
    register_wgpu_emissive_material(state);
    register_wgpu_wireframe_material(state);
    register_wgpu_unlit_material(state);
    register_wgpu_lambert_material(state);
    register_wgpu_phong_material(state);
    register_wgpu_blinn_phong_material(state);
    register_wgpu_matcap_material(state);
    register_wgpu_toon_material(state);
    register_wgpu_shaded_material(state);
    register_wgpu_standard_pbr_material(state);
    register_wgpu_specular_glossiness_pbr_material(state);
    register_wgpu_custom_shader_material(state);
}
