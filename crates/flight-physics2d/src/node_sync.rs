//! Copying a body's pose onto a 2D display node (TS `nodeSync.ts`).

use flight_math::RAD_TO_DEG;
use flight_node::{NodeRef, invalidate_node_local_transform};
use flight_scene2d::Node2DRef;

use crate::types::*;

/// Writes the body's position and its angle in degrees onto the node's flat transform fields, then
/// invalidates the node's local transform (TS `syncPhysics2DBodyToNode2D`).
pub fn sync_physics2d_body_to_node2d(body: &RigidBody2D, node: &Node2DRef) {
    {
        let mut guard = node.write().unwrap();
        let fields = guard.node2d_fields_mut();
        fields.x = body.x;
        fields.y = body.y;
        fields.rotation = body.angle * RAD_TO_DEG;
    }
    let as_node: NodeRef = node.clone();
    invalidate_node_local_transform(&as_node);
}
