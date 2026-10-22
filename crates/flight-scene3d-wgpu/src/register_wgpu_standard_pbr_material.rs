//! Opt-in registration of the built-in StandardPbr renderer (TS
//! `registerWgpuStandardPbrMaterial.ts`).

use flight_materials::STANDARD_PBR_MATERIAL_KIND;
use flight_render_wgpu::{
    WgpuRenderState, register_wgpu_bitmap_texture_resolver, register_wgpu_image_texture_resolver,
};

use crate::wgpu_mesh_material_registry::register_wgpu_mesh_material_renderer;
use crate::wgpu_standard_pbr_mesh_material_renderer::WGPU_STANDARD_PBR_MESH_MATERIAL_RENDERER;

/// Registers the built-in StandardPbr forward-lit renderer for the StandardPbr kind, with the bitmap
/// and image texture resolvers its maps resolve through (TS `registerWgpuStandardPbrMaterial`).
pub fn register_wgpu_standard_pbr_material(state: &mut WgpuRenderState) {
    register_wgpu_bitmap_texture_resolver(state);
    register_wgpu_image_texture_resolver(state);
    register_wgpu_mesh_material_renderer(
        state,
        STANDARD_PBR_MATERIAL_KIND.to_string(),
        &WGPU_STANDARD_PBR_MESH_MATERIAL_RENDERER,
    );
}
