// flight-lint: allow-file(contract-vocabulary) D16 open Material family: the renderer reads any material through `&dyn Material`
//! The built-in Matcap forward renderer (TS `wgpuMatcapMeshMaterialRenderer.ts`): lighting-independent
//! material-capture shading binding the linear tint; the matcap texture is not sampled on wgpu yet.

use flight_camera::Camera3D;
use flight_color::{LinearColor, allocate_linear_color, unpack_color_to_linear};
use flight_entity::get_entity_id;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{MATCAP_MATERIAL_KIND, MatcapMaterial, Material, MaterialAlphaMode};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_wgpu::{
    WgpuMeshMaterialRenderer, WgpuRenderState, get_wgpu_render_state_runtime,
    register_wgpu_bitmap_texture_resolver, register_wgpu_image_texture_resolver,
    set_wgpu_render_pass_bind_group,
};

use crate::types::*;
use crate::wgpu_matcap_prelude::{bind_wgpu_matcap_surface, ensure_wgpu_matcap_pipeline};
use crate::wgpu_mesh_material_registry::register_wgpu_mesh_material_renderer;
use crate::wgpu_mesh_pipeline::{
    begin_wgpu_mesh_draw, draw_wgpu_mesh_subset, write_wgpu_frame_uniform,
};

// The material key the material-less fallback bind caches under (TS: a module-level `{}` object).
const FALLBACK_MATERIAL_KEY: u64 = u64::MAX - 3;

/// The Matcap mesh-material renderer for `MATCAP_MATERIAL_KIND` (TS `wgpuMatcapMeshMaterialRenderer`).
pub static WGPU_MATCAP_MESH_MATERIAL_RENDERER: WgpuMeshMaterialRenderer =
    WgpuMeshMaterialRenderer {
        bind: bind_matcap_material,
        draw: draw_matcap_material,
    };

fn bind_matcap_material(
    state: &mut WgpuRenderState,
    material: Option<&dyn Material>,
    lights: &Scene3DLightBlock,
    camera: &Camera3D,
) {
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }
    let matcap = material.and_then(|material| material.as_any().downcast_ref::<MatcapMaterial>());
    let format = get_wgpu_render_state_runtime(state)
        .current_color_format
        .unwrap_or(state.format);
    let pipeline = ensure_wgpu_matcap_pipeline(state, &define_key_for_material(matcap), format);
    write_wgpu_frame_uniform(state, camera, lights);

    let group = match matcap {
        None => bind_wgpu_matcap_surface(
            state,
            &pipeline,
            FALLBACK_MATERIAL_KEY,
            &white_linear_color(),
            0.5,
        ),
        Some(matcap) => {
            let mut tint = allocate_linear_color();
            unpack_color_to_linear(&mut tint, matcap.tint);
            bind_wgpu_matcap_surface(
                state,
                &pipeline,
                get_entity_id(matcap),
                &tint,
                matcap.alpha_cutoff,
            )
        }
    };

    begin_wgpu_mesh_draw(state, &pipeline);
    set_wgpu_render_pass_bind_group(state, 2, &group, &[]);
}

// The matcap map flag stays false on wgpu (texture upload not wired into this family yet).
fn define_key_for_material(material: Option<&MatcapMaterial>) -> WgpuMatcapDefineKey {
    return WgpuMatcapDefineKey {
        alpha_mask_enabled: material
            .is_some_and(|material| material.alpha_mode == MaterialAlphaMode::Mask),
        double_sided: material.is_some_and(|material| material.double_sided),
        has_matcap: false,
    };
}

fn draw_matcap_material(
    state: &mut WgpuRenderState,
    proxy: &Scene3DRenderProxy,
    geometry: &MeshGeometry,
) {
    draw_wgpu_mesh_subset(state, proxy, geometry);
}

/// Registers the Matcap renderer and the bitmap and image resolvers (TS `registerWgpuMatcapMaterial`).
pub fn register_wgpu_matcap_material(state: &mut WgpuRenderState) {
    register_wgpu_bitmap_texture_resolver(state);
    register_wgpu_image_texture_resolver(state);
    register_wgpu_mesh_material_renderer(
        state,
        MATCAP_MATERIAL_KIND.to_string(),
        &WGPU_MATCAP_MESH_MATERIAL_RENDERER,
    );
}

fn white_linear_color() -> LinearColor {
    let mut color = allocate_linear_color();
    color.r = 1.0;
    color.g = 1.0;
    color.b = 1.0;
    color.a = 1.0;
    return color;
}
