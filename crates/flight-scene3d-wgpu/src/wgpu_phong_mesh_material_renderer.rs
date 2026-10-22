//! The built-in classic Phong forward-lit mesh-material renderer (TS
//! `wgpuPhongMeshMaterialRenderer.ts`), the WGSL mirror of scene3d-gl's Phong renderer: Lambert diffuse plus a reflection-vector
//! specular lobe; the material binds its linear diffuse and specular colors and shininess.

use std::sync::LazyLock;

use flight_entity::Ref;
use flight_camera::Camera3D;
use flight_color::{allocate_linear_color, unpack_color_to_linear};
use flight_entity::get_entity_id;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{PhongMaterial, Material, PHONG_MATERIAL_KIND};
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

// The identity the material-less fallback bind caches its binding under (TS: a module-level `{}`
// object). A real entity, so its key is a numeric entity id (D12/D15): unique to this renderer and
// never reused, so it cannot alias a material's binding or another renderer's fallback.
static FALLBACK_MATERIAL: LazyLock<PhongMaterial> = LazyLock::new(flight_materials::contract::create_phong_material);

/// The built-in Phong renderer for `PHONG_MATERIAL_KIND` (TS `wgpuPhongMeshMaterialRenderer`).
pub static WGPU_PHONG_MESH_MATERIAL_RENDERER: WgpuMeshMaterialRenderer = WgpuMeshMaterialRenderer {
    bind: bind_wgpu_phong_material,
    draw: draw_wgpu_phong_material,
};

// Selects the classic `phong` variant, writes the Frame uniform, binds the pipeline and Frame
// group, then binds the material's surface at group(2).
fn bind_wgpu_phong_material(
    state: &mut WgpuRenderState,
    material: Option<&dyn Material>,
    lights: &Ref<Scene3DLightBlock>,
    camera: &Camera3D,
) {
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }
    let phong = material.and_then(|material| material.as_any().downcast_ref::<PhongMaterial>());
    let format = get_wgpu_render_state_runtime(state)
        .current_color_format
        .unwrap_or(state.format);
    let pipeline = ensure_wgpu_classic_pipeline(state, &define_key_for_material(phong), format);
    write_wgpu_frame_uniform(state, camera, lights);

    let white = white_linear_color();
    let group = match phong {
        None => bind_wgpu_classic_surface(
            state,
            &pipeline,
            flight_entity::get_entity_id(&*FALLBACK_MATERIAL),
            &white,
            &white,
            32.0,
            0.5,
            None,
            None,
            None,
            None,
        ),
        Some(phong) => {
            let mut diffuse = allocate_linear_color();
            unpack_color_to_linear(&mut diffuse, phong.diffuse);
            let mut specular = allocate_linear_color();
            unpack_color_to_linear(&mut specular, phong.specular);
            let diffuse_map = read_texture_slot(&phong.diffuse_map);
            let specular_map = read_texture_slot(&phong.specular_map);
            let normal_map = read_texture_slot(&phong.normal_map);
            bind_wgpu_classic_surface(
                state,
                &pipeline,
                get_entity_id(phong),
                &diffuse,
                &specular,
                phong.shininess,
                phong.alpha_cutoff,
                diffuse_map.as_deref(),
                specular_map.as_deref(),
                normal_map.as_deref(),
                None,
            )
        }
    };

    begin_wgpu_mesh_draw(state, &pipeline);
    set_wgpu_render_pass_bind_group(state, 2, &group, &[]);
}

// The feature define key for a Phong material: the fixed `phong` model, the alpha-mask and
// double-sided flags and which optional maps are present.
fn define_key_for_material(material: Option<&PhongMaterial>) -> WgpuClassicDefineKey {
    return WgpuClassicDefineKey {
        alpha_mask_enabled: material
            .is_some_and(|material| material.alpha_mode == flight_materials::MaterialAlphaMode::Mask),
        double_sided: material.is_some_and(|material| material.double_sided),
        has_color_adjustment: None,
        has_color_matrix: None,
        has_alpha_map: Some(false),
        has_diffuse_map: material.is_some_and(|material| is_texture_slot_ready(&material.diffuse_map)),
        has_normal_map: material.is_some_and(|material| is_texture_slot_ready(&material.normal_map)),
        has_specular_map: material.is_some_and(|material| is_texture_slot_ready(&material.specular_map)),
        lighting_model: WgpuClassicLightingModel::Phong,
    };
}

fn draw_wgpu_phong_material(
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

/// Registers the built-in Phong renderer for `PHONG_MATERIAL_KIND` on this state, with the bitmap and image
/// texture resolvers its maps resolve through (TS `registerWgpuPhongMaterial`).
pub fn register_wgpu_phong_material(state: &mut WgpuRenderState) {
    register_wgpu_bitmap_texture_resolver(state);
    register_wgpu_image_texture_resolver(state);
    register_wgpu_mesh_material_renderer(
        state,
        PHONG_MATERIAL_KIND.to_string(),
        &WGPU_PHONG_MESH_MATERIAL_RENDERER,
    );
}

fn white_linear_color() -> flight_color::LinearColor {
    let mut white = allocate_linear_color();
    unpack_color_to_linear(&mut white, 0xffffffff);
    return white;
}
