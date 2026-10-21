use std::sync::Arc;

use flight_geometry::{create_vector2, inverse_matrix_transform_point_xy};
use flight_node::{get_node_world_matrix, NodeRef};
use flight_node::contract::NodeRevisionState;
use flight_tilemap::contract::TILEMAP_KIND;
use flight_tilemap::{Tilemap, get_tilemap_column_at_x, get_tilemap_row_at_y, get_tilemap_tile};

use crate::hit_tests::{register_hit_test_precise, HitTestContext};

// flight-lint: allow(conform-params) D5: caller-owned hit test context
pub fn register_tilemap_hit_test(ctx: &mut HitTestContext) {
    register_hit_test_precise(ctx, TILEMAP_KIND.to_string(), Arc::new(resolve_tilemap_cell_index));
}

fn resolve_tilemap_cell_index(
    source: &NodeRef,
    x: f32,
    y: f32,
) -> i32 {
    let node = source.read().unwrap();
    let Some(_tilemap) = node.as_any().downcast_ref::<Tilemap>() else {
        return -1;
    };
    let mut revisions = NodeRevisionState::default();
    drop(node);
    let matrix = get_node_world_matrix(source, &mut revisions);
    let mut local_point = create_vector2(0.0, 0.0);
    inverse_matrix_transform_point_xy(&mut local_point, &matrix, x, y);
    let node = source.read().unwrap();
    let Some(tilemap) = node.as_any().downcast_ref::<Tilemap>() else {
        return -1;
    };
    let column = get_tilemap_column_at_x(tilemap, local_point.x);
    let row = get_tilemap_row_at_y(tilemap, local_point.y);
    if column < 0 || row < 0 {
        return -1;
    }
    if get_tilemap_tile(tilemap, column, row) < 0 {
        return -1;
    }
    return row * tilemap.data.columns + column;
}
