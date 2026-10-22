// flight-lint: allow-file(contract-vocabulary) D16 open Material family: the renderer reads any material through `&dyn Material`
//! The built-in Normal forward renderer (TS `wgpuNormalMeshMaterialRenderer.ts`): the debug pipeline in
//! normal mode, encoding the world-space normal as `n * 0.5 + 0.5`. The tangent-space normal map is not
//! sampled on wgpu yet, so the map variant is never selected.

use std::sync::LazyLock;

use flight_camera::Camera3D;
use flight_entity::Ref;
use flight_entity::get_entity_id;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{Material, NORMAL_MATERIAL_KIND, NormalMaterial};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_wgpu::{
    WgpuMeshMaterialRenderer, WgpuRenderState, get_wgpu_render_state_runtime,
    register_wgpu_bitmap_texture_resolver, register_wgpu_image_texture_resolver,
    set_wgpu_render_pass_bind_group,
};

use crate::types::*;
use crate::wgpu_debug_prelude::{bind_wgpu_debug_surface, ensure_wgpu_debug_pipeline};
use crate::wgpu_mesh_material_registry::register_wgpu_mesh_material_renderer;
use crate::wgpu_mesh_pipeline::{
    begin_wgpu_mesh_draw, draw_wgpu_mesh_subset, write_wgpu_frame_uniform,
};

// The identity the material-less fallback bind caches its binding under (TS: a module-level `{}`
// object). A real entity, so its key is a numeric entity id (D12/D15): unique to this renderer and
// never reused, so it cannot alias a material's binding or another renderer's fallback.
static FALLBACK_MATERIAL: LazyLock<NormalMaterial> =
    LazyLock::new(flight_materials::contract::create_normal_material);

/// The Normal mesh-material renderer for `NORMAL_MATERIAL_KIND` (TS `wgpuNormalMeshMaterialRenderer`).
pub static WGPU_NORMAL_MESH_MATERIAL_RENDERER: WgpuMeshMaterialRenderer =
    WgpuMeshMaterialRenderer {
        bind: bind_normal_material,
        draw: draw_normal_material,
    };

fn bind_normal_material(
    state: &mut WgpuRenderState,
    material: Option<&dyn Material>,
    lights: &Ref<Scene3DLightBlock>,
    camera: &Camera3D,
) {
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }
    let normal = material.and_then(|material| material.as_any().downcast_ref::<NormalMaterial>());
    let format = get_wgpu_render_state_runtime(state)
        .current_color_format
        .unwrap_or(state.format);
    let pipeline = ensure_wgpu_debug_pipeline(
        state,
        &WgpuDebugDefineKey {
            has_normal_map: false,
            mode: WgpuDebugMode::Normal,
        },
        format,
        Some(normal.is_some_and(|normal| normal.double_sided)),
    );
    write_wgpu_frame_uniform(state, camera, lights);

    let group = match normal {
        None => bind_wgpu_debug_surface(
            state,
            &pipeline,
            flight_entity::get_entity_id(&*FALLBACK_MATERIAL),
            0.0,
            1.0,
            1.0,
        ),
        Some(normal) => bind_wgpu_debug_surface(
            state,
            &pipeline,
            get_entity_id(normal),
            0.0,
            1.0,
            normal.normal_scale,
        ),
    };

    begin_wgpu_mesh_draw(state, &pipeline);
    set_wgpu_render_pass_bind_group(state, 2, &group, &[]);
}

fn draw_normal_material(
    state: &mut WgpuRenderState,
    proxy: &Scene3DRenderProxy,
    geometry: &MeshGeometry,
) {
    draw_wgpu_mesh_subset(state, proxy, geometry);
}

/// Registers the Normal renderer and the bitmap and image resolvers (TS `registerWgpuNormalMaterial`).
pub fn register_wgpu_normal_material(state: &mut WgpuRenderState) {
    register_wgpu_bitmap_texture_resolver(state);
    register_wgpu_image_texture_resolver(state);
    register_wgpu_mesh_material_renderer(
        state,
        NORMAL_MATERIAL_KIND.to_string(),
        &WGPU_NORMAL_MESH_MATERIAL_RENDERER,
    );
}
