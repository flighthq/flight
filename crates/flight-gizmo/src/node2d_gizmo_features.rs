//! Node2D graph feature adapter (TS `node2dGizmoFeatures.ts`).

use std::sync::Arc;

use flight_geometry::{Rectangle, Vector2, copy_rectangle, matrix_transform_point_xy};
use flight_math::RAD_TO_DEG;
use flight_node::contract::{NodeRef, get_node_world_bounds_rectangle, get_node_world_matrix};
use flight_scene2d::contract::as_node2d_ref;

use crate::types::GizmoNode2DFeatures;

/// Adapts Node2D world bounds, pivot origin and composed rotation for the gizmo controller (TS
/// `createNode2DGizmoFeatures`).
pub fn create_node2d_gizmo_features() -> GizmoNode2DFeatures {
    return GizmoNode2DFeatures {
        get_world_bounds_rectangle: Arc::new(move |out: &mut Rectangle, node: &NodeRef| {
            let bounds = get_node_world_bounds_rectangle(node);
            copy_rectangle(out, &bounds);
            return true;
        }),
        get_world_origin: Arc::new(move |out: &mut Vector2, node: &NodeRef| {
            let matrix = get_node_world_matrix(node);
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
            let matrix = get_node_world_matrix(node);
            return matrix.b.atan2(matrix.a) * RAD_TO_DEG;
        }),
    };
}
