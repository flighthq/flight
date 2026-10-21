use flight_node::NodeRef;

use crate::hit_tests::hit_test_graph_local_bounds;

pub fn default_html_view_hit_test_handler(_source: &NodeRef, _x: f32, _y: f32) -> bool {
    return false;
}

pub fn default_movie_clip_hit_test_handler(_source: &NodeRef, _x: f32, _y: f32) -> bool {
    return false;
}

pub fn default_node2d_hit_test_handler(_source: &NodeRef, _x: f32, _y: f32) -> bool {
    return false;
}

pub fn default_rich_text_hit_test_handler(source: &NodeRef, x: f32, y: f32) -> bool {
    return hit_test_graph_local_bounds(source, x, y);
}

pub fn default_shape_hit_test_handler(source: &NodeRef, x: f32, y: f32) -> bool {
    return hit_test_graph_local_bounds(source, x, y);
}

pub fn default_text_hit_test_handler(source: &NodeRef, x: f32, y: f32) -> bool {
    return hit_test_graph_local_bounds(source, x, y);
}
