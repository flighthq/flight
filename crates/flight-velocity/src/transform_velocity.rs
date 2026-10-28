//! flight-compiler: nullable-options

use flight_geometry::copy_matrix;
use flight_geometry::create_matrix;
use flight_node::contract::NodeRef;
use flight_node::contract::ensure_node_world_matrix;
use flight_node::contract::get_node_child_at;
use flight_node::contract::get_node_child_count;
use flight_node::contract::get_node_world_matrix;

use crate::VelocityField;
use crate::velocity_store::ensure_node_velocity_sample;

/// The default velocity contributor. Walks `root`'s subtree top-down, deriving each node's
/// screen-space velocity from the delta of its world transform since the previous frame, then
/// commits the current world transform as the new previous. This is the "any transform is
/// velocity" baseline: a tween, physics step, camera move, or manual edit all change world
/// transforms and so produce velocity here for free.
///
/// Nodes an explicit contributor already set this frame keep that velocity (their
/// `explicit_frame_id` matches), but still have their previous transform updated, so order
/// relative to explicit contributors does not matter. Run once per frame after
/// `begin_velocity_frame`. Velocity is in node units; a producer scales by the render pixel ratio.
pub fn contribute_transform_velocity(field: &mut VelocityField, root: &NodeRef) {
    visit_transform_velocity(field, root);
}

fn visit_transform_velocity(field: &mut VelocityField, node: &NodeRef) {
    ensure_node_world_matrix(node);
    let world = get_node_world_matrix(node);
    let frame_id = field.frame_id;
    let sample = ensure_node_velocity_sample(field, node);

    if sample.explicit_frame_id != frame_id {
        if let Some(previous) = sample.previous_world_transform.as_ref() {
            sample.velocity.x = world.tx - previous.tx;
            sample.velocity.y = world.ty - previous.ty;
        } else {
            sample.velocity.x = 0.0;
            sample.velocity.y = 0.0;
        }
        sample.last_frame_id = frame_id;
    }

    if sample.previous_world_transform.is_none() {
        sample.previous_world_transform = Some(create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0));
    }
    if let Some(previous) = sample.previous_world_transform.as_mut() {
        copy_matrix(previous, &world);
    }

    let count = get_node_child_count(node);
    for i in 0..count {
        if let Some(child) = get_node_child_at(node, i as i32) {
            visit_transform_velocity(field, &child);
        }
    }
}
