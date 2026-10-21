use std::sync::Arc;

use flight_geometry::{create_vector2, inverse_matrix_transform_point_xy};
use flight_node::{get_node_world_matrix, NodeRef};
use flight_node::contract::NodeRevisionState;
use flight_path::contains_path_point;
use flight_shape::contract::{MORPH_SHAPE_KIND, SCALE9_SHAPE_KIND, SHAPE_KIND};
use flight_shape::{MorphShape, Scale9Shape, Shape, get_shape_fill_regions};

use crate::hit_tests::{register_hit_test_precise, HitTestContext};

// flight-lint: allow(f64) D1: path containment API uses f64 coordinates
fn hit_test_shape_fill(
    source: &NodeRef,
    x: f32,
    y: f32,
) -> i32 {
    let node = source.read().unwrap();
    let commands = if let Some(shape) = node.as_any().downcast_ref::<Shape>() {
        shape.data.commands.clone()
    } else if let Some(morph) = node.as_any().downcast_ref::<MorphShape>() {
        morph.data.commands.clone()
    } else if let Some(s9) = node.as_any().downcast_ref::<Scale9Shape>() {
        s9.data.commands.clone()
    } else {
        return -1;
    };
    drop(node);

    let regions = match get_shape_fill_regions(&commands) {
        Some(r) => r,
        None => return -1,
    };

    let mut revisions = NodeRevisionState::default();
    let matrix = get_node_world_matrix(source, &mut revisions);
    let mut local_point = create_vector2(0.0, 0.0);
    inverse_matrix_transform_point_xy(&mut local_point, &matrix, x, y);

    for region in &regions {
        let path_guard = region.path.read().unwrap();
        if contains_path_point(&path_guard, local_point.x as f64, local_point.y as f64, None) {
            return 0;
        }
    }
    return -1;
}

// flight-lint: allow(conform-params) D5: caller-owned hit test context
pub fn register_shape_hit_test(ctx: &mut HitTestContext) {
    register_hit_test_precise(ctx, SHAPE_KIND.to_string(), Arc::new(hit_test_shape_fill));
    register_hit_test_precise(ctx, MORPH_SHAPE_KIND.to_string(), Arc::new(hit_test_shape_fill));
    register_hit_test_precise(ctx, SCALE9_SHAPE_KIND.to_string(), Arc::new(hit_test_shape_fill));
}
