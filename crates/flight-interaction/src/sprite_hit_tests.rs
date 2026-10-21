use flight_node::NodeRef;

use crate::hit_tests::hit_test_graph_local_bounds;

pub fn default_quad_batch_hit_test_handler(source: &NodeRef, x: f32, y: f32) -> bool {
    return default_sprite_hit_test_handler(source, x, y);
}

pub fn default_sprite_hit_test_handler(source: &NodeRef, x: f32, y: f32) -> bool {
    return hit_test_graph_local_bounds(source, x, y);
}

pub fn default_tilemap_hit_test_handler(source: &NodeRef, x: f32, y: f32) -> bool {
    return default_sprite_hit_test_handler(source, x, y);
}
