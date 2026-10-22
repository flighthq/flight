//! The ShadedMaterial renderer (TS `wgpuShadedMeshMaterialRenderer.ts`): selects one composed
//! `shaded:` pipeline from the material's ordered modifier feature set, writes the shared frame and
//! light block, then binds the base surface and modifier data as one group(2). Its draw half reuses
//! the canonical mesh upload and draw path.

use flight_camera::Camera3D;
use flight_color::{allocate_linear_color, unpack_color_to_linear};
use flight_entity::Ref;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{Material, MaterialAlphaMode};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_wgpu::{
    WgpuMeshMaterialRenderer, WgpuRenderState, get_wgpu_render_state_runtime,
    register_wgpu_bitmap_texture_resolver, register_wgpu_image_texture_resolver,
    set_wgpu_render_pass_bind_group,
};
use flight_shading::{SHADED_MATERIAL_KIND, ShadedMaterial};
use flight_texture::Texture;

use crate::types::*;
use crate::wgpu_mesh_material_registry::register_wgpu_mesh_material_renderer;
use crate::wgpu_mesh_pipeline::{
    begin_wgpu_mesh_draw, draw_wgpu_mesh_subset, is_wgpu_texture_ready, write_wgpu_frame_uniform,
};
use crate::wgpu_shaded_prelude::{bind_wgpu_shaded_surface, ensure_wgpu_shaded_pipeline};

/// The built-in ShadedMaterial renderer (TS `wgpuShadedMeshMaterialRenderer`).
pub static WGPU_SHADED_MESH_MATERIAL_RENDERER: WgpuMeshMaterialRenderer = WgpuMeshMaterialRenderer {
    bind: bind_wgpu_shaded_material,
    draw: draw_wgpu_shaded_material,
};

fn bind_wgpu_shaded_material(
    state: &mut WgpuRenderState,
    material: Option<&dyn Material>,
    lights: &Scene3DLightBlock,
    camera: &Camera3D,
) {
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }
    let Some(shaded) = material.and_then(|material| material.as_any().downcast_ref::<ShadedMaterial>())
    else {
        return;
    };
    let format = get_wgpu_render_state_runtime(state)
        .current_color_format
        .unwrap_or(state.format);
    let pipeline = ensure_wgpu_shaded_pipeline(state, shaded, format);
    write_wgpu_frame_uniform(state, camera, lights);
    let mut diffuse = allocate_linear_color();
    unpack_color_to_linear(&mut diffuse, shaded.diffuse);
    let mut specular = allocate_linear_color();
    unpack_color_to_linear(&mut specular, shaded.specular);
    let group = bind_wgpu_shaded_surface(state, &pipeline, shaded, &diffuse, &specular);
    begin_wgpu_mesh_draw(state, &pipeline);
    set_wgpu_render_pass_bind_group(state, 2, &group, &[]);
}

fn draw_wgpu_shaded_material(
    state: &mut WgpuRenderState,
    proxy: &Scene3DRenderProxy,
    geometry: &MeshGeometry,
) {
    draw_wgpu_mesh_subset(state, proxy, geometry);
}

/// The base surface flags a shaded material compiles under: mask, sidedness and which base maps are
/// backed (TS `getWgpuShadedBaseFlags`).
pub fn get_wgpu_shaded_base_flags(material: &ShadedMaterial) -> WgpuShadedBaseFlags {
    return WgpuShadedBaseFlags {
        alpha_mask_enabled: material.alpha_mode == MaterialAlphaMode::Mask,
        double_sided: material.double_sided,
        has_diffuse_map: is_texture_slot_ready(&material.diffuse_map),
        has_normal_map: is_texture_slot_ready(&material.normal_map),
        has_specular_map: is_texture_slot_ready(&material.specular_map),
    };
}

fn is_texture_slot_ready(slot: &Option<Ref<Texture>>) -> bool {
    return match slot {
        Some(texture) => is_wgpu_texture_ready(Some(&texture.read().unwrap())),
        None => false,
    };
}

/// Registers the ShadedMaterial renderer on one state with the bitmap and image texture resolvers
/// (TS `registerWgpuShadedMaterial`). Modifier compilers are a separate open registry: call
/// `register_built_in_wgpu_modifier_snippets` (and vendor registrations) before drawing.
pub fn register_wgpu_shaded_material(state: &mut WgpuRenderState) {
    register_wgpu_bitmap_texture_resolver(state);
    register_wgpu_image_texture_resolver(state);
    register_wgpu_mesh_material_renderer(
        state,
        SHADED_MATERIAL_KIND.to_string(),
        &WGPU_SHADED_MESH_MATERIAL_RENDERER,
    );
}
