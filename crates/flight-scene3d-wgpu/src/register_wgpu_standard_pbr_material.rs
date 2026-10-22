use flight_render_wgpu::{
    register_wgpu_bitmap_texture_resolver, register_wgpu_image_texture_resolver, WgpuRenderState,
};

pub fn register_wgpu_standard_pbr_material(state: &mut WgpuRenderState) {
    register_wgpu_bitmap_texture_resolver(state);
    register_wgpu_image_texture_resolver(state);
    // TODO: register_wgpu_mesh_material_renderer(state, STANDARD_PBR_MATERIAL_KIND, ...)
    // once wgpu_standard_pbr_mesh_material_renderer is ported
}
