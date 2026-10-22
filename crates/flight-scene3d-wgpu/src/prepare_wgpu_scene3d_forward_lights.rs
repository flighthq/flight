//! Per-visible-mesh forward light selection (TS `prepareWgpuScene3DForwardLights.ts`), the WebGPU
//! twin of `prepare_gl_scene3d_forward_lights`.

use std::sync::{Arc, RwLock};

use flight_geometry::{create_aabb, create_bounding_sphere, set_bounding_sphere_from_aabb};
use flight_lighting::{
    SCENE_LIGHT_BLOCK_FLOATS, Scene3DLightBlock, Scene3DLightsLike, select_scene_3d_forward_lights,
};
use flight_node::contract::get_node_world_matrix4;
use flight_render::{RenderState, Scene3DRenderList, pack_scene_3d_light_block};
use flight_render_wgpu::WgpuRenderState;
use flight_scene3d::get_node3d_world_bounds;

use crate::types::*;
use crate::wgpu_scene3d_runtime::get_wgpu_scene3d_runtime;

fn create_light_block() -> Scene3DLightBlock {
    return Scene3DLightBlock {
        ambient_count: 0,
        data: vec![0.0; SCENE_LIGHT_BLOCK_FLOATS].into_boxed_slice(),
        directional_count: 0,
        hemisphere_count: 0,
        point_count: 0,
        spot_count: 0,
        version: 0,
    };
}

fn ensure_prepared_block(
    prepared: &mut WgpuScene3DForwardLightPrepared,
    index: usize,
) -> &mut WgpuScene3DForwardLightPreparedBlock {
    if prepared.blocks.len() <= index {
        prepared.blocks.push(WgpuScene3DForwardLightPreparedBlock {
            indices: Vec::new(),
            lights: Arc::new(RwLock::new(create_light_block())),
        });
    }
    return &mut prepared.blocks[index];
}

fn find_prepared_block(
    prepared: &WgpuScene3DForwardLightPrepared,
    indices: &[i32],
) -> Option<usize> {
    for block_index in 0..prepared.block_count {
        if prepared.blocks[block_index].indices == indices {
            return Some(block_index);
        }
    }
    return None;
}

/// Ranks point and spot lights at each visible mesh's world bounding sphere, packs the strongest
/// four of each family, and deduplicates identical selected index tuples so coherent meshes share a
/// block and keep their material bind runs (TS `prepareWgpuScene3DForwardLights`). The blocks are
/// state-owned scratch reused across calls. `out` (D24: required, first) is cleared then filled and
/// shares those blocks.
// flight-lint: allow(conform-params) D24 (principal): the computed list fills a required first caller-owned out, cleared then filled
pub fn prepare_wgpu_scene3d_forward_lights(
    out: &mut WgpuScene3DForwardLightList,
    state: &mut WgpuRenderState,
    scene_render_list: &Scene3DRenderList,
    lights: &Scene3DLightsLike,
) {
    let mut prepared = get_wgpu_scene3d_runtime(state)
        .forward_lights
        .take()
        .unwrap_or_default();
    prepared.block_count = 0;
    out.mesh_light_blocks.clear();
    out.mesh_count = scene_render_list.mesh_count;
    let mut bounds = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    let mut sphere = create_bounding_sphere(0.0, 0.0, 0.0, 0.0);

    for mesh in scene_render_list
        .visible_meshes
        .iter()
        .take(scene_render_list.mesh_count)
    {
        let revisions = &mut state.render_runtime_mut().node_revisions;
        get_node3d_world_bounds(&mut bounds, mesh, revisions);
        set_bounding_sphere_from_aabb(&mut sphere, &bounds);
        if sphere.radius < 0.0 {
            let world = get_node_world_matrix4(mesh, revisions);
            sphere.center.x = world.m[12];
            sphere.center.y = world.m[13];
            sphere.center.z = world.m[14];
            sphere.radius = 0.0;
        }
        select_scene_3d_forward_lights(&mut prepared.selection, lights, &sphere, None);
        let block_index = match find_prepared_block(&prepared, &prepared.selection.indices) {
            Some(index) => index,
            None => {
                let index = prepared.block_count;
                prepared.block_count += 1;
                let indices = prepared.selection.indices.clone();
                let mut selected = lights.clone();
                selected.point = prepared.selection.point.clone();
                selected.spot = prepared.selection.spot.clone();
                let block = ensure_prepared_block(&mut prepared, index);
                block.indices = indices;
                pack_scene_3d_light_block(&mut block.lights.write().unwrap(), &selected);
                index
            }
        };
        let block = prepared.blocks[block_index].lights.clone();
        out.mesh_light_blocks.push(block);
    }
    get_wgpu_scene3d_runtime(state).forward_lights = Some(prepared);
}
