// flight-lint: allow-file(contract-vocabulary) D17 prepared forward-light lists share packed blocks by Rc identity within thread-bound render-gl state

use std::rc::Rc;

use flight_geometry::{
    BoundingSphere, create_aabb, create_bounding_sphere, set_bounding_sphere_from_aabb,
};
use flight_lighting::{
    Scene3DLightBlock, Scene3DLightsLike, create_scene_3d_lights, select_scene_3d_forward_lights,
};
use flight_node::NodeRef;
use flight_node::contract::{NodeRevisionState, get_node_world_matrix4};
use flight_render::{Scene3DRenderList, pack_scene_3d_light_block};
use flight_render_gl::GlRenderState;
use flight_scene3d::get_node3d_world_bounds;

use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{
    GlScene3DForwardLightList, PreparedForwardLightBlock, PreparedGlScene3DForwardLights,
};

fn find_prepared_block(prepared: &PreparedGlScene3DForwardLights, indices: &[i32]) -> Option<usize> {
    for block_index in 0..prepared.block_count {
        if prepared.blocks[block_index].indices == indices {
            return Some(block_index);
        }
    }
    return None;
}

// Prepares one punctual-light block for each visible mesh after prepare_scene_3d_render. The selection
// is opt-in and explicit: scenes within each family's forward budget need not run it. Point and spot
// lights are independently ranked by estimated contribution at each mesh's world bounding sphere;
// directional, ambient and hemisphere terms remain scene-global.
//
// Identical stable light-index tuples reuse the same packed block, so spatially coherent meshes keep
// material bind runs. The packed blocks and selection scratch are state-owned and reused across frames:
// a block whose packed content is unchanged keeps its identity. The returned list shares those blocks
// and must not be retained past the draw.
pub fn prepare_gl_scene3d_forward_lights(
    state: &mut GlRenderState,
    scene_render_list: &Scene3DRenderList,
    lights: &Scene3DLightsLike,
) -> GlScene3DForwardLightList {
    let mut prepared = get_gl_scene3d_runtime(state)
        .prepared_forward_lights
        .take()
        .unwrap_or_default();
    prepared.block_count = 0;
    prepared.list.mesh_light_blocks.clear();
    prepared.list.mesh_count = scene_render_list.mesh_count;
    let mut world_sphere = create_bounding_sphere(0.0, 0.0, 0.0, 0.0);
    let mut selected_lights = create_scene_3d_lights();

    for mesh_index in 0..scene_render_list.mesh_count {
        let mesh = &scene_render_list.visible_meshes[mesh_index];
        set_mesh_world_bounding_sphere(&mut world_sphere, mesh, &mut state.runtime.node_revisions);
        select_scene_3d_forward_lights(&mut prepared.selection, lights, &world_sphere, None);

        let block_index = match find_prepared_block(&prepared, &prepared.selection.indices) {
            Some(index) => index,
            None => {
                let index = prepared.block_count;
                prepared.block_count += 1;
                if prepared.blocks.len() <= index {
                    prepared.blocks.push(PreparedForwardLightBlock {
                        indices: Vec::new(),
                        lights: Rc::new(Scene3DLightBlock::default()),
                    });
                }
                let block = &mut prepared.blocks[index];
                block.indices.clone_from(&prepared.selection.indices);
                selected_lights.ambient = lights.ambient.clone();
                selected_lights.directional = lights.directional.clone();
                selected_lights.hemisphere = lights.hemisphere.clone();
                selected_lights.point = prepared.selection.point.clone();
                selected_lights.spot = prepared.selection.spot.clone();
                // Repack in place semantically: the packer advances `version` only on a content change,
                // and an unchanged block keeps its identity so binds stay elided across frames.
                let mut packed = (*block.lights).clone();
                pack_scene_3d_light_block(&mut packed, &selected_lights);
                if packed.version != block.lights.version {
                    block.lights = Rc::new(packed);
                }
                index
            }
        };
        let block = prepared.blocks[block_index].lights.clone();
        prepared.list.mesh_light_blocks.push(block);
    }

    let out = prepared.list.clone();
    get_gl_scene3d_runtime(state).prepared_forward_lights = Some(prepared);
    return out;
}

fn set_mesh_world_bounding_sphere(
    out: &mut BoundingSphere,
    mesh: &NodeRef,
    revisions: &mut NodeRevisionState,
) {
    let mut world_bounds = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    get_node3d_world_bounds(&mut world_bounds, mesh, revisions);
    set_bounding_sphere_from_aabb(out, &world_bounds);
    if out.radius < 0.0 {
        let world = get_node_world_matrix4(mesh, revisions).m;
        out.center.x = world[12];
        out.center.y = world[13];
        out.center.z = world[14];
        out.radius = 0.0;
    }
}
