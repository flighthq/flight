//! The built-in classic Lambert forward-lit mesh-material renderer (TS
//! `wgpuLambertMeshMaterialRenderer.ts`), the WGSL mirror of scene3d-gl's Lambert renderer: diffuse-only Lambertian shading, so
//! the classic prelude compiles out its specular branch (the specular color it binds is unused).

use flight_camera::Camera3D;
use flight_color::{allocate_linear_color, unpack_color_to_linear};
use flight_entity::get_entity_id;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{LambertMaterial, Material, LAMBERT_MATERIAL_KIND};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_wgpu::{
    WgpuMeshMaterialRenderer, WgpuRenderState, get_wgpu_render_state_runtime,
    register_wgpu_bitmap_texture_resolver, register_wgpu_image_texture_resolver,
    set_wgpu_render_pass_bind_group,
};
use flight_texture::Texture;

use crate::types::*;
use crate::wgpu_classic_prelude::{bind_wgpu_classic_surface, ensure_wgpu_classic_pipeline};
use crate::wgpu_mesh_material_registry::register_wgpu_mesh_material_renderer;
use crate::wgpu_mesh_pipeline::{
    begin_wgpu_mesh_draw, draw_wgpu_mesh_subset, is_wgpu_texture_ready, write_wgpu_frame_uniform,
};

// The shared binding key of the untextured default-material bind (TS `FALLBACK_MATERIAL`).
const FALLBACK_MATERIAL_KEY: u64 = u64::MAX;

/// The built-in Lambert renderer for `LAMBERT_MATERIAL_KIND` (TS `wgpuLambertMeshMaterialRenderer`).
pub static WGPU_LAMBERT_MESH_MATERIAL_RENDERER: WgpuMeshMaterialRenderer = WgpuMeshMaterialRenderer {
    bind: bind_wgpu_lambert_material,
    draw: draw_wgpu_lambert_material,
};

// Selects the classic `lambert` variant, writes the Frame uniform, binds the pipeline and Frame
// group, then binds the material's surface at group(2).
fn bind_wgpu_lambert_material(
    state: &mut WgpuRenderState,
    material: Option<&dyn Material>,
    lights: &Scene3DLightBlock,
    camera: &Camera3D,
) {
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }
    let lambert = material.and_then(|material| material.as_any().downcast_ref::<LambertMaterial>());
    let format = get_wgpu_render_state_runtime(state)
        .current_color_format
        .unwrap_or(state.format);
    let pipeline = ensure_wgpu_classic_pipeline(state, &define_key_for_material(lambert), format);
    write_wgpu_frame_uniform(state, camera, lights);

    let white = white_linear_color();
    let group = match lambert {
        None => bind_wgpu_classic_surface(
            state,
            &pipeline,
            FALLBACK_MATERIAL_KEY,
            &white,
            &white,
            32.0,
            0.5,
            None,
            None,
            None,
            None,
        ),
        Some(lambert) => {
            let mut diffuse = allocate_linear_color();
            unpack_color_to_linear(&mut diffuse, lambert.diffuse);
            let diffuse_map = read_texture_slot(&lambert.diffuse_map);
            bind_wgpu_classic_surface(
                state,
                &pipeline,
                get_entity_id(lambert),
                &diffuse,
                &white,
                32.0,
                lambert.alpha_cutoff,
                diffuse_map.as_deref(),
                None,
                None,
                None,
            )
        }
    };

    begin_wgpu_mesh_draw(state, &pipeline);
    set_wgpu_render_pass_bind_group(state, 2, &group, &[]);
}

// The feature define key for a Lambert material: the fixed `lambert` model, the alpha-mask and
// double-sided flags and whether a diffuse map is present; Lambert has no specular or normal map.
fn define_key_for_material(material: Option<&LambertMaterial>) -> WgpuClassicDefineKey {
    return WgpuClassicDefineKey {
        alpha_mask_enabled: material
            .is_some_and(|material| material.alpha_mode == flight_materials::MaterialAlphaMode::Mask),
        double_sided: material.is_some_and(|material| material.double_sided),
        has_color_adjustment: None,
        has_color_matrix: None,
        has_alpha_map: Some(false),
        has_diffuse_map: material.is_some_and(|material| is_texture_slot_ready(&material.diffuse_map)),
        has_normal_map: false,
        has_specular_map: false,
        lighting_model: WgpuClassicLightingModel::Lambert,
    };
}

fn draw_wgpu_lambert_material(
    state: &mut WgpuRenderState,
    proxy: &Scene3DRenderProxy,
    geometry: &MeshGeometry,
) {
    draw_wgpu_mesh_subset(state, proxy, geometry);
}

fn is_texture_slot_ready(slot: &Option<flight_entity::Ref<Texture>>) -> bool {
    return match slot {
        Some(texture) => is_wgpu_texture_ready(Some(&texture.read().unwrap())),
        None => false,
    };
}

fn read_texture_slot(
    slot: &Option<flight_entity::Ref<Texture>>,
) -> Option<std::sync::RwLockReadGuard<'_, Texture>> {
    return slot.as_ref().map(|texture| texture.read().unwrap());
}

/// Registers the built-in Lambert renderer for `LAMBERT_MATERIAL_KIND` on this state, with the bitmap and image
/// texture resolvers its maps resolve through (TS `registerWgpuLambertMaterial`).
pub fn register_wgpu_lambert_material(state: &mut WgpuRenderState) {
    register_wgpu_bitmap_texture_resolver(state);
    register_wgpu_image_texture_resolver(state);
    register_wgpu_mesh_material_renderer(
        state,
        LAMBERT_MATERIAL_KIND.to_string(),
        &WGPU_LAMBERT_MESH_MATERIAL_RENDERER,
    );
}

fn white_linear_color() -> flight_color::LinearColor {
    let mut white = allocate_linear_color();
    unpack_color_to_linear(&mut white, 0xffffffff);
    return white;
}
