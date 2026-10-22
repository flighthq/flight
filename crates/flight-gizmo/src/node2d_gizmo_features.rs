//! Node2D graph feature adapter (TS `node2dGizmoFeatures.ts`).

use std::sync::{Arc, RwLock};

use flight_geometry::{Rectangle, Vector2, copy_rectangle, matrix_transform_point_xy};
use flight_math::RAD_TO_DEG;
use flight_node::contract::{
    NodeRef, NodeRevisionState, get_node_world_bounds_rectangle, get_node_world_matrix,
};
use flight_scene2d::contract::as_node2d_ref;

use crate::types::GizmoNode2DFeatures;

/// Adapts Node2D world bounds, pivot origin and composed rotation for the gizmo controller (TS
/// `createNode2DGizmoFeatures`).
pub fn create_node2d_gizmo_features() -> GizmoNode2DFeatures {
    let revisions = Arc::new(RwLock::new(NodeRevisionState {
        world_transform_revision: 0,
    }));
    let bounds_revisions = revisions.clone();
    let origin_revisions = revisions.clone();
    return GizmoNode2DFeatures {
        get_world_bounds_rectangle: Arc::new(move |out: &mut Rectangle, node: &NodeRef| {
            let bounds =
                get_node_world_bounds_rectangle(node, &mut bounds_revisions.write().unwrap());
            copy_rectangle(out, &bounds);
            return true;
        }),
        get_world_origin: Arc::new(move |out: &mut Vector2, node: &NodeRef| {
            let matrix = get_node_world_matrix(node, &mut origin_revisions.write().unwrap());
            let node2d =
                as_node2d_ref(node).expect("gizmo Node2D feature used with non-Node2D node");
            let node2d = node2d.read().unwrap();
            matrix_transform_point_xy(
                out,
                &matrix,
                node2d.node2d_fields().pivot_x,
                node2d.node2d_fields().pivot_y,
            );
        }),
        get_world_rotation: Arc::new(move |node: &NodeRef| {
            let matrix = get_node_world_matrix(node, &mut revisions.write().unwrap());
            return matrix.b.atan2(matrix.a) * RAD_TO_DEG;
        }),
    };
}
