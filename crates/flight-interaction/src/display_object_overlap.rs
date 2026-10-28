use flight_geometry::{
    Rectangle, compute_rectangle_intersection, contains_rectangle_point_xy, encloses_rectangle,
    intersects_rectangle,
};
use flight_node::{NodeRef, get_node_world_bounds_rectangle};

pub fn contains_node2d(outer: &NodeRef, inner: &NodeRef) -> bool {
    let outer_bounds = get_node_world_bounds_rectangle(outer);
    let inner_bounds = get_node_world_bounds_rectangle(inner);
    return encloses_rectangle(&outer_bounds, &inner_bounds);
}

pub fn get_node2d_overlap_rectangle(out: &mut Rectangle, source: &NodeRef, other: &NodeRef) {
    let source_bounds = get_node_world_bounds_rectangle(source);
    let other_bounds = get_node_world_bounds_rectangle(other);
    compute_rectangle_intersection(out, &source_bounds, &other_bounds);
}

pub fn hit_test_node2ds_shape(source: &NodeRef, other: &NodeRef) -> bool {
    let a = get_node_world_bounds_rectangle(source);
    let b = get_node_world_bounds_rectangle(other);
    if !intersects_rectangle(&a, &b) {
        return false;
    }
    let a_center_x = a.x + a.width * 0.5;
    let a_center_y = a.y + a.height * 0.5;
    let b_center_x = b.x + b.width * 0.5;
    let b_center_y = b.y + b.height * 0.5;
    return contains_rectangle_point_xy(&a, b_center_x, b_center_y)
        || contains_rectangle_point_xy(&b, a_center_x, a_center_y);
}
