// flight-lint: allow-file(contract-vocabulary) D16 open Material family: the renderer reads any material through `&dyn Material`
//! The built-in Depth forward renderer (TS `wgpuDepthMeshMaterialRenderer.ts`): the debug pipeline in
//! depth mode, writing eye-space depth over the material's [near, far] range as grayscale linear color.

use flight_camera::Camera3D;
use flight_entity::get_entity_id;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{DEPTH_MATERIAL_KIND, DepthMaterial, Material};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_wgpu::{
    WgpuMeshMaterialRenderer, WgpuRenderState, get_wgpu_render_state_runtime,
    set_wgpu_render_pass_bind_group,
};

use crate::types::*;
use crate::wgpu_debug_prelude::{bind_wgpu_debug_surface, ensure_wgpu_debug_pipeline};
use crate::wgpu_mesh_material_registry::register_wgpu_mesh_material_renderer;
use crate::wgpu_mesh_pipeline::{
    begin_wgpu_mesh_draw, draw_wgpu_mesh_subset, write_wgpu_frame_uniform,
};

// The material key the material-less fallback bind caches under (TS: a module-level `{}` object).
const FALLBACK_MATERIAL_KEY: u64 = u64::MAX - 4;

/// The Depth mesh-material renderer for `DEPTH_MATERIAL_KIND` (TS `wgpuDepthMeshMaterialRenderer`).
pub static WGPU_DEPTH_MESH_MATERIAL_RENDERER: WgpuMeshMaterialRenderer = WgpuMeshMaterialRenderer {
    bind: bind_depth_material,
    draw: draw_depth_material,
};

fn bind_depth_material(
    state: &mut WgpuRenderState,
    material: Option<&dyn Material>,
    lights: &Scene3DLightBlock,
    camera: &Camera3D,
) {
    if get_wgpu_render_state_runtime(state).render_pass.is_none() {
        return;
    }
    let depth = material.and_then(|material| material.as_any().downcast_ref::<DepthMaterial>());
    let format = get_wgpu_render_state_runtime(state)
        .current_color_format
        .unwrap_or(state.format);
    let pipeline = ensure_wgpu_debug_pipeline(
        state,
        &WgpuDebugDefineKey {
            has_normal_map: false,
            mode: WgpuDebugMode::Depth,
        },
        format,
        Some(depth.is_some_and(|depth| depth.double_sided)),
    );
    write_wgpu_frame_uniform(state, camera, lights);

    let group = match depth {
        None => bind_wgpu_debug_surface(state, &pipeline, FALLBACK_MATERIAL_KEY, 0.0, 1.0, 1.0),
        Some(depth) => bind_wgpu_debug_surface(
            state,
            &pipeline,
            get_entity_id(depth),
            depth.near,
            depth.far,
            1.0,
        ),
    };

    begin_wgpu_mesh_draw(state, &pipeline);
    set_wgpu_render_pass_bind_group(state, 2, &group, &[]);
}

fn draw_depth_material(
    state: &mut WgpuRenderState,
    proxy: &Scene3DRenderProxy,
    geometry: &MeshGeometry,
) {
    draw_wgpu_mesh_subset(state, proxy, geometry);
}

/// Registers the Depth renderer (TS `registerWgpuDepthMaterial`).
pub fn register_wgpu_depth_material(state: &mut WgpuRenderState) {
    register_wgpu_mesh_material_renderer(
        state,
        DEPTH_MATERIAL_KIND.to_string(),
        &WGPU_DEPTH_MESH_MATERIAL_RENDERER,
    );
}
