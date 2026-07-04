//! Display object overlap detection: containment, intersection, and shape tests.
//!
//! These functions operate on world-space bounds computed from the display
//! object arena, matching the TS `displayObjectOverlap` module.

use flighthq_displayobject::DisplayObjectArena;
use flighthq_geometry::{
    compute_rectangle_intersection, contains_rectangle_point_xy, encloses_rectangle,
    intersects_rectangle,
};
use flighthq_node::NodeId;
use flighthq_types::geometry::RectangleLike;

use crate::hit_tests::compute_world_bounds;

/// Returns `true` if `outer`'s world bounds fully enclose `inner`'s world
/// bounds.
pub fn contains_display_object(arena: &DisplayObjectArena, outer: NodeId, inner: NodeId) -> bool {
    let outer_bounds = compute_world_bounds(arena, outer);
    let inner_bounds = compute_world_bounds(arena, inner);
    encloses_rectangle(&outer_bounds, &inner_bounds)
}

/// Computes the intersection rectangle of two display objects' world bounds
/// and writes it to `out`.
pub fn get_display_object_overlap_rectangle(
    arena: &DisplayObjectArena,
    source: NodeId,
    other: NodeId,
    out: &mut RectangleLike,
) {
    let source_bounds = compute_world_bounds(arena, source);
    let other_bounds = compute_world_bounds(arena, other);
    compute_rectangle_intersection(out, &source_bounds, &other_bounds);
}

/// Returns `true` if the world bounds of `source` and `other` intersect AND
/// at least one center point is inside the other's bounds.
pub fn hit_test_display_objects_shape(
    arena: &DisplayObjectArena,
    source: NodeId,
    other: NodeId,
) -> bool {
    let a = compute_world_bounds(arena, source);
    let b = compute_world_bounds(arena, other);
    if !intersects_rectangle(&a, &b) {
        return false;
    }
    let a_center_x = a.x + a.width * 0.5;
    let a_center_y = a.y + a.height * 0.5;
    let b_center_x = b.x + b.width * 0.5;
    let b_center_y = b.y + b.height * 0.5;
    contains_rectangle_point_xy(&a, b_center_x, b_center_y)
        || contains_rectangle_point_xy(&b, a_center_x, a_center_y)
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_displayobject::{
        add_display_object_child, create_display_container, create_display_object,
    };

    fn new_arena() -> DisplayObjectArena {
        slotmap::SlotMap::with_key()
    }

    fn set_local_bounds(
        arena: &mut DisplayObjectArena,
        id: NodeId,
        x: f32,
        y: f32,
        w: f32,
        h: f32,
    ) {
        let b = &mut arena[id].spatial.bounds.local;
        b.x = x;
        b.y = y;
        b.width = w;
        b.height = h;
    }

    // contains_display_object

    #[test]
    fn contains_display_object_true_when_fully_enclosed() {
        let mut arena = new_arena();
        let outer = create_display_object(&mut arena);
        let inner = create_display_object(&mut arena);
        let po = create_display_container(&mut arena);
        let pi = create_display_container(&mut arena);
        add_display_object_child(&mut arena, po, outer);
        add_display_object_child(&mut arena, pi, inner);
        set_local_bounds(&mut arena, outer, 0.0, 0.0, 100.0, 100.0);
        set_local_bounds(&mut arena, inner, 10.0, 10.0, 20.0, 20.0);
        assert!(contains_display_object(&arena, outer, inner));
    }

    #[test]
    fn contains_display_object_false_when_partially_outside() {
        let mut arena = new_arena();
        let outer = create_display_object(&mut arena);
        let inner = create_display_object(&mut arena);
        let po = create_display_container(&mut arena);
        let pi = create_display_container(&mut arena);
        add_display_object_child(&mut arena, po, outer);
        add_display_object_child(&mut arena, pi, inner);
        set_local_bounds(&mut arena, outer, 0.0, 0.0, 100.0, 100.0);
        set_local_bounds(&mut arena, inner, 90.0, 90.0, 50.0, 50.0);
        assert!(!contains_display_object(&arena, outer, inner));
    }

    #[test]
    fn contains_display_object_false_when_disjoint() {
        let mut arena = new_arena();
        let outer = create_display_object(&mut arena);
        let inner = create_display_object(&mut arena);
        let po = create_display_container(&mut arena);
        let pi = create_display_container(&mut arena);
        add_display_object_child(&mut arena, po, outer);
        add_display_object_child(&mut arena, pi, inner);
        set_local_bounds(&mut arena, outer, 0.0, 0.0, 10.0, 10.0);
        set_local_bounds(&mut arena, inner, 50.0, 50.0, 10.0, 10.0);
        assert!(!contains_display_object(&arena, outer, inner));
    }

    // get_display_object_overlap_rectangle

    #[test]
    fn get_display_object_overlap_rectangle_computes_intersection() {
        let mut arena = new_arena();
        let a = create_display_object(&mut arena);
        let b = create_display_object(&mut arena);
        let pa = create_display_container(&mut arena);
        let pb = create_display_container(&mut arena);
        add_display_object_child(&mut arena, pa, a);
        add_display_object_child(&mut arena, pb, b);
        set_local_bounds(&mut arena, a, 0.0, 0.0, 100.0, 100.0);
        set_local_bounds(&mut arena, b, 0.0, 0.0, 100.0, 100.0);
        arena[b].spatial.transform.x = 50.0;
        arena[b].spatial.transform.y = 50.0;
        let mut out = RectangleLike::default();
        get_display_object_overlap_rectangle(&arena, a, b, &mut out);
        assert_eq!(out.x, 50.0);
        assert_eq!(out.y, 50.0);
        assert_eq!(out.width, 50.0);
        assert_eq!(out.height, 50.0);
    }

    #[test]
    fn get_display_object_overlap_rectangle_zero_when_disjoint() {
        let mut arena = new_arena();
        let a = create_display_object(&mut arena);
        let b = create_display_object(&mut arena);
        let pa = create_display_container(&mut arena);
        let pb = create_display_container(&mut arena);
        add_display_object_child(&mut arena, pa, a);
        add_display_object_child(&mut arena, pb, b);
        set_local_bounds(&mut arena, a, 0.0, 0.0, 10.0, 10.0);
        set_local_bounds(&mut arena, b, 0.0, 0.0, 10.0, 10.0);
        arena[b].spatial.transform.x = 50.0;
        arena[b].spatial.transform.y = 50.0;
        let mut out = RectangleLike::default();
        get_display_object_overlap_rectangle(&arena, a, b, &mut out);
        assert!(out.width <= 0.0 || out.height <= 0.0);
    }

    // hit_test_display_objects_shape

    #[test]
    fn hit_test_display_objects_shape_true_when_centers_overlap() {
        let mut arena = new_arena();
        let a = create_display_object(&mut arena);
        let b = create_display_object(&mut arena);
        let pa = create_display_container(&mut arena);
        let pb = create_display_container(&mut arena);
        add_display_object_child(&mut arena, pa, a);
        add_display_object_child(&mut arena, pb, b);
        set_local_bounds(&mut arena, a, 0.0, 0.0, 100.0, 100.0);
        set_local_bounds(&mut arena, b, 0.0, 0.0, 100.0, 100.0);
        arena[b].spatial.transform.x = 30.0;
        arena[b].spatial.transform.y = 30.0;
        assert!(hit_test_display_objects_shape(&arena, a, b));
    }

    #[test]
    fn hit_test_display_objects_shape_false_when_disjoint() {
        let mut arena = new_arena();
        let a = create_display_object(&mut arena);
        let b = create_display_object(&mut arena);
        let pa = create_display_container(&mut arena);
        let pb = create_display_container(&mut arena);
        add_display_object_child(&mut arena, pa, a);
        add_display_object_child(&mut arena, pb, b);
        set_local_bounds(&mut arena, a, 0.0, 0.0, 10.0, 10.0);
        set_local_bounds(&mut arena, b, 0.0, 0.0, 10.0, 10.0);
        arena[b].spatial.transform.x = 50.0;
        arena[b].spatial.transform.y = 50.0;
        assert!(!hit_test_display_objects_shape(&arena, a, b));
    }

    #[test]
    fn hit_test_display_objects_shape_false_when_overlap_but_no_center_inside() {
        let mut arena = new_arena();
        let a = create_display_object(&mut arena);
        let b = create_display_object(&mut arena);
        let pa = create_display_container(&mut arena);
        let pb = create_display_container(&mut arena);
        add_display_object_child(&mut arena, pa, a);
        add_display_object_child(&mut arena, pb, b);
        // Two tall thin rectangles that overlap only at corners: neither center
        // is inside the other.
        set_local_bounds(&mut arena, a, 0.0, 0.0, 10.0, 200.0);
        set_local_bounds(&mut arena, b, 0.0, 0.0, 200.0, 10.0);
        assert!(!hit_test_display_objects_shape(&arena, a, b));
    }
}
