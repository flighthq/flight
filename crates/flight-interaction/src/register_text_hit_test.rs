use std::sync::Arc;

use flight_geometry::{create_vector2, inverse_matrix_transform_point_xy};
use flight_node::contract::NodeRevisionState;
use flight_node::{NodeRef, get_node_world_matrix};
use flight_text::{RICH_TEXT_KIND, TEXT_LABEL_KIND, get_text_layout};
use flight_textlayout::compute_rich_text_char_index_at_point;

use crate::hit_tests::{HitTestContext, hit_test_graph_local_bounds, register_hit_test_precise};

// flight-lint: allow(conform-params) D5: caller-owned hit test context
pub fn register_text_hit_test(ctx: &mut HitTestContext) {
    register_hit_test_precise(
        ctx,
        TEXT_LABEL_KIND.to_string(),
        Arc::new(resolve_text_char_index),
    );
    register_hit_test_precise(
        ctx,
        RICH_TEXT_KIND.to_string(),
        Arc::new(resolve_text_char_index),
    );
}

fn resolve_text_char_index(source: &NodeRef, x: f32, y: f32) -> i32 {
    if !hit_test_graph_local_bounds(source, x, y) {
        return -1;
    }
    let layout = match get_text_layout(source) {
        Some(l) => l,
        None => return 0,
    };
    let mut revisions = NodeRevisionState::default();
    let matrix = get_node_world_matrix(source, &mut revisions);
    let mut local_point = create_vector2(0.0, 0.0);
    inverse_matrix_transform_point_xy(&mut local_point, &matrix, x, y);
    let layout_guard = layout.read().unwrap();
    return compute_rich_text_char_index_at_point(&layout_guard, local_point.x, local_point.y)
        as i32;
}
