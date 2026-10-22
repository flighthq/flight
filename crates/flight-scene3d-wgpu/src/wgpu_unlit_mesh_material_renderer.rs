// flight-lint: allow-file(contract-vocabulary) D16 open Material family: the renderer reads any material through `&dyn Material`
//! The built-in Unlit forward renderer (TS `wgpuUnlitMeshMaterialRenderer.ts`): lighting-independent flat
//! color through the shared unlit pipeline, with the optional base-color map.

use std::sync::LazyLock;

use flight_camera::Camera3D;
use flight_color::{LinearColor, allocate_linear_color, unpack_color_to_linear};
use flight_entity::Ref;
use flight_entity::get_entity_id;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{Material, MaterialAlphaMode, UNLIT_MATERIAL_KIND, UnlitMaterial};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_wgpu::{
    WgpuMeshMaterialRenderer, WgpuRenderState, get_wgpu_render_state_runtime,
    register_wgpu_bitmap_texture_resolver, register_wgpu_image_texture_resolver,
    register_wgpu_render_texture_resolver, set_wgpu_render_pass_bind_group,
};

use crate::types::*;
use crate::wgpu_mesh_material_registry::register_wgpu_mesh_material_renderer;
use crate::wgpu_mesh_pipeline::{
    begin_wgpu_mesh_draw, draw_wgpu_mesh_subset, is_wgpu_texture_ready, write_wgpu_frame_uniform,
};
use crate::wgpu_unlit_prelude::{bind_wgpu_unlit_surface, ensure_wgpu_unlit_pipeline};

// The identity the material-less fallback bind caches its binding under (TS: a module-level `{}`
// object). A real entity, so its key is a numeric entity id (D12/D15): unique to this renderer and
// never reused, so it cannot alias a material's binding or another renderer's fallback.
static FALLBACK_MATERIAL: LazyLock<UnlitMaterial> =
    LazyLock::new(flight_materials::contract::create_unlit_material);

/// The Unlit mesh-material renderer for `UNLIT_MATERIAL_KIND` (TS `wgpuUnlitMeshMaterialRenderer`).
pub static WGPU_UNLIT_MESH_MATERIAL_RENDERER: WgpuMeshMaterialRenderer = WgpuMeshMaterialRenderer {
    bind: bind_unlit_material,
    draw: draw_unlit_material,
};

fn bind_unlit_material(
    state: &mut WgpuRenderState,
    material: Option<&dyn Material>,
    lights: &Ref<Scene3DLightBlock>,
    camera: &Camera3D,
) {
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }
    let unlit = material.and_then(|material| material.as_any().downcast_ref::<UnlitMaterial>());
    let format = get_wgpu_render_state_runtime(state)
        .current_color_format
        .unwrap_or(state.format);
    let pipeline = ensure_wgpu_unlit_pipeline(state, &define_key_for_material(unlit), format);
    write_wgpu_frame_uniform(state, camera, lights);

    let group = match unlit {
        None => bind_wgpu_unlit_surface(
            state,
            &pipeline,
            flight_entity::get_entity_id(&*FALLBACK_MATERIAL),
            &white_linear_color(),
            1.0,
            0.5,
            None,
        ),
        Some(unlit) => {
            let mut color = allocate_linear_color();
            unpack_color_to_linear(&mut color, unlit.base_color);
            let map = unlit.base_color_map.as_ref().map(|map| map.read().unwrap());
            bind_wgpu_unlit_surface(
                state,
                &pipeline,
                get_entity_id(unlit),
                &color,
                1.0,
                unlit.alpha_cutoff,
                map.as_deref(),
            )
        }
    };

    begin_wgpu_mesh_draw(state, &pipeline);
    set_wgpu_render_pass_bind_group(state, 2, &group, &[]);
}

fn define_key_for_material(material: Option<&UnlitMaterial>) -> WgpuUnlitDefineKey {
    return WgpuUnlitDefineKey {
        alpha_mask_enabled: material
            .is_some_and(|material| material.alpha_mode == MaterialAlphaMode::Mask),
        double_sided: material.is_some_and(|material| material.double_sided),
        has_color_map: material.is_some_and(|material| {
            let map = material
                .base_color_map
                .as_ref()
                .map(|map| map.read().unwrap());
            return is_wgpu_texture_ready(map.as_deref());
        }),
    };
}

fn draw_unlit_material(
    state: &mut WgpuRenderState,
    proxy: &Scene3DRenderProxy,
    geometry: &MeshGeometry,
) {
    draw_wgpu_mesh_subset(state, proxy, geometry);
}

/// Registers the Unlit renderer and the bitmap, image and render-texture resolvers its map reads (TS
/// `registerWgpuUnlitMaterial`).
pub fn register_wgpu_unlit_material(state: &mut WgpuRenderState) {
    register_wgpu_bitmap_texture_resolver(state);
    register_wgpu_image_texture_resolver(state);
    register_wgpu_render_texture_resolver(state);
    register_wgpu_mesh_material_renderer(
        state,
        UNLIT_MATERIAL_KIND.to_string(),
        &WGPU_UNLIT_MESH_MATERIAL_RENDERER,
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
