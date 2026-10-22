// flight-lint: allow-file(contract-vocabulary) D16 open Material family: the renderer reads any material through `&dyn Material`
//! The built-in Toon (cel-shading) forward-lit renderer (TS `wgpuToonMeshMaterialRenderer.ts`): the
//! diffuse N·L quantized into stepped bands over the base color, shadow-mapped like the classic and
//! PBR directional term. The base-color map and ramp are not sampled on wgpu yet, so the define key
//! keeps their flags false and the scalar `steps` quantizer is used.

use std::sync::LazyLock;

use flight_entity::Ref;
use flight_camera::Camera3D;
use flight_color::{allocate_linear_color, unpack_color_to_linear};
use flight_entity::get_entity_id;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{Material, MaterialAlphaMode, TOON_MATERIAL_KIND, ToonMaterial};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_wgpu::{
    WgpuMeshMaterialRenderer, WgpuRenderState, get_wgpu_render_state_runtime,
    register_wgpu_bitmap_texture_resolver, register_wgpu_image_texture_resolver,
    set_wgpu_render_pass_bind_group,
};

use crate::types::*;
use crate::wgpu_mesh_material_registry::register_wgpu_mesh_material_renderer;
use crate::wgpu_mesh_pipeline::{
    begin_wgpu_mesh_draw, draw_wgpu_mesh_subset, write_wgpu_frame_uniform,
};
use crate::wgpu_toon_prelude::{bind_wgpu_toon_surface, ensure_wgpu_toon_pipeline};

// The identity the material-less fallback bind caches its binding under (TS: a module-level `{}`
// object). A real entity, so its key is a numeric entity id (D12/D15): unique to this renderer and
// never reused, so it cannot alias a material's binding or another renderer's fallback.
static FALLBACK_MATERIAL: LazyLock<ToonMaterial> = LazyLock::new(flight_materials::contract::create_toon_material);

/// The Toon mesh-material renderer for `TOON_MATERIAL_KIND` (TS `wgpuToonMeshMaterialRenderer`).
pub static WGPU_TOON_MESH_MATERIAL_RENDERER: WgpuMeshMaterialRenderer = WgpuMeshMaterialRenderer {
    bind: bind_toon_material,
    draw: draw_toon_material,
};

fn bind_toon_material(
    state: &mut WgpuRenderState,
    material: Option<&dyn Material>,
    lights: &Ref<Scene3DLightBlock>,
    camera: &Camera3D,
) {
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }
    let toon = material.and_then(|material| material.as_any().downcast_ref::<ToonMaterial>());
    let format = get_wgpu_render_state_runtime(state)
        .current_color_format
        .unwrap_or(state.format);
    let pipeline = ensure_wgpu_toon_pipeline(state, &define_key_for_material(toon), format);
    write_wgpu_frame_uniform(state, camera, lights);

    let group = match toon {
        None => bind_wgpu_toon_surface(
            state,
            &pipeline,
            flight_entity::get_entity_id(&*FALLBACK_MATERIAL),
            &[1.0, 1.0, 1.0, 1.0],
            3.0,
            0.5,
        ),
        Some(toon) => {
            let mut color = allocate_linear_color();
            unpack_color_to_linear(&mut color, toon.base_color);
            bind_wgpu_toon_surface(
                state,
                &pipeline,
                get_entity_id(toon),
                &[color.r, color.g, color.b, color.a],
                toon.steps as f32,
                toon.alpha_cutoff,
            )
        }
    };

    begin_wgpu_mesh_draw(state, &pipeline);
    set_wgpu_render_pass_bind_group(state, 2, &group, &[]);
}

// The alpha-mask and double-sided flags; the map flags stay false on wgpu.
fn define_key_for_material(material: Option<&ToonMaterial>) -> WgpuToonDefineKey {
    return WgpuToonDefineKey {
        alpha_mask_enabled: material
            .is_some_and(|material| material.alpha_mode == MaterialAlphaMode::Mask),
        double_sided: material.is_some_and(|material| material.double_sided),
        has_base_color_map: false,
        has_ramp: false,
    };
}

fn draw_toon_material(
    state: &mut WgpuRenderState,
    proxy: &Scene3DRenderProxy,
    geometry: &MeshGeometry,
) {
    draw_wgpu_mesh_subset(state, proxy, geometry);
}

/// Registers the Toon renderer and the bitmap and image resolvers (TS `registerWgpuToonMaterial`).
pub fn register_wgpu_toon_material(state: &mut WgpuRenderState) {
    register_wgpu_bitmap_texture_resolver(state);
    register_wgpu_image_texture_resolver(state);
    register_wgpu_mesh_material_renderer(
        state,
        TOON_MATERIAL_KIND.to_string(),
        &WGPU_TOON_MESH_MATERIAL_RENDERER,
    );
}
