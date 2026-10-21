// flight-lint: allow-file(conform-params) D5: published membership is world-owned rather than module-owned hidden state
use std::collections::HashSet;

use flight_spatial::{SpatialAabb3D, SpatialIndexingMode};

use crate::Physics3DWorld;

pub fn get_physics_3d_broadphase_body_indices(world: &mut Physics3DWorld) -> &mut HashSet<i32> {
    return &mut world.broadphase_body_indices;
}

pub fn publish_physics_3d_broadphase_body(
    world: &mut Physics3DWorld,
    body_index: i32,
    bounds: &SpatialAabb3D,
) {
    if world.broadphase_body_indices.contains(&body_index) {
        let updated = (world.index.update_spatial_object)(body_index, bounds);
        if !updated
            && (world.index.explain_spatial_indexing)(body_index).mode
                == SpatialIndexingMode::Absent
        {
            world.broadphase_body_indices.remove(&body_index);
        }
        return;
    }
    let inserted = (world.index.insert_spatial_object)(body_index, bounds);
    if inserted
        || (world.index.explain_spatial_indexing)(body_index).mode != SpatialIndexingMode::Absent
    {
        world.broadphase_body_indices.insert(body_index);
    }
}

pub fn withdraw_physics_3d_broadphase_body(world: &mut Physics3DWorld, body_index: i32) {
    if !world.broadphase_body_indices.remove(&body_index)
        && (world.index.explain_spatial_indexing)(body_index).mode == SpatialIndexingMode::Absent
    {
        return;
    }
    (world.index.remove_spatial_object)(body_index);
}
