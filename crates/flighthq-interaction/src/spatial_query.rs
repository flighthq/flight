//! Spatial area queries over the scene graph.
//!
//! Walk the display object arena and collect nodes whose world bounds intersect
//! a rectangle or a circle. Disabled nodes are skipped entirely (no child
//! traversal).

use flighthq_displayobject::DisplayObjectArena;
use flighthq_geometry::intersects_rectangle;
use flighthq_node::NodeId;
use flighthq_types::geometry::RectangleLike;

use crate::hit_tests::compute_world_bounds;

/// Walks the scene graph rooted at `source` and appends nodes whose world
/// bounds intersect `rect` to `out`.
///
/// Disabled nodes are skipped entirely (no child traversal).
pub fn hit_test_area_query(
    arena: &DisplayObjectArena,
    source: NodeId,
    rect: &RectangleLike,
    out: &mut Vec<NodeId>,
) {
    if !arena[source].spatial.enabled {
        return;
    }

    let world_bounds = compute_world_bounds(arena, source);
    if intersects_rectangle(&world_bounds, rect) {
        out.push(source);
    }

    let count = arena[source].spatial.hierarchy.children.len();
    for i in 0..count {
        let child = arena[source].spatial.hierarchy.children[i];
        hit_test_area_query(arena, child, rect, out);
    }
}

/// Walks the scene graph rooted at `source` and appends nodes whose world
/// bounds intersect a circle defined by center `(cx, cy)` and `radius` to
/// `out`.
///
/// The circle-vs-AABB test finds the nearest point on the AABB to the circle
/// center and checks whether it falls within the radius.
///
/// Disabled nodes are skipped entirely (no child traversal).
pub fn hit_test_area_query_circle(
    arena: &DisplayObjectArena,
    source: NodeId,
    cx: f32,
    cy: f32,
    radius: f32,
    out: &mut Vec<NodeId>,
) {
    if !arena[source].spatial.enabled {
        return;
    }

    let b = compute_world_bounds(arena, source);
    let near_x = cx.clamp(b.x, b.x + b.width);
    let near_y = cy.clamp(b.y, b.y + b.height);
    let dx = cx - near_x;
    let dy = cy - near_y;
    if dx * dx + dy * dy <= radius * radius {
        out.push(source);
    }

    let count = arena[source].spatial.hierarchy.children.len();
    for i in 0..count {
        let child = arena[source].spatial.hierarchy.children[i];
        hit_test_area_query_circle(arena, child, cx, cy, radius, out);
    }
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

    // hit_test_area_query

    #[test]
    fn hit_test_area_query_collects_intersecting_nodes() {
        let mut arena = new_arena();
        let root = create_display_container(&mut arena);
        let a = create_display_object(&mut arena);
        let b = create_display_object(&mut arena);
        add_display_object_child(&mut arena, root, a);
        add_display_object_child(&mut arena, root, b);
        set_local_bounds(&mut arena, a, 0.0, 0.0, 50.0, 50.0);
        set_local_bounds(&mut arena, b, 100.0, 100.0, 50.0, 50.0);

        let rect = RectangleLike {
            x: 0.0,
            y: 0.0,
            width: 60.0,
            height: 60.0,
        };
        let mut out = Vec::new();
        hit_test_area_query(&arena, root, &rect, &mut out);
        assert!(out.contains(&a));
        assert!(!out.contains(&b));
    }

    #[test]
    fn hit_test_area_query_skips_disabled_nodes() {
        let mut arena = new_arena();
        let root = create_display_container(&mut arena);
        let child = create_display_object(&mut arena);
        add_display_object_child(&mut arena, root, child);
        set_local_bounds(&mut arena, child, 0.0, 0.0, 50.0, 50.0);
        arena[child].spatial.enabled = false;

        let rect = RectangleLike {
            x: 0.0,
            y: 0.0,
            width: 100.0,
            height: 100.0,
        };
        let mut out = Vec::new();
        hit_test_area_query(&arena, root, &rect, &mut out);
        assert!(!out.contains(&child));
    }

    #[test]
    fn hit_test_area_query_includes_root_when_intersecting() {
        let mut arena = new_arena();
        let root = create_display_object(&mut arena);
        set_local_bounds(&mut arena, root, 0.0, 0.0, 50.0, 50.0);

        let rect = RectangleLike {
            x: 10.0,
            y: 10.0,
            width: 10.0,
            height: 10.0,
        };
        let mut out = Vec::new();
        hit_test_area_query(&arena, root, &rect, &mut out);
        assert!(out.contains(&root));
    }

    #[test]
    fn hit_test_area_query_traverses_children() {
        let mut arena = new_arena();
        let root = create_display_container(&mut arena);
        let parent = create_display_container(&mut arena);
        let child = create_display_object(&mut arena);
        add_display_object_child(&mut arena, root, parent);
        add_display_object_child(&mut arena, parent, child);
        set_local_bounds(&mut arena, child, 0.0, 0.0, 50.0, 50.0);

        let rect = RectangleLike {
            x: 0.0,
            y: 0.0,
            width: 100.0,
            height: 100.0,
        };
        let mut out = Vec::new();
        hit_test_area_query(&arena, root, &rect, &mut out);
        assert!(out.contains(&child));
    }

    // hit_test_area_query_circle

    #[test]
    fn hit_test_area_query_circle_collects_intersecting_nodes() {
        let mut arena = new_arena();
        let root = create_display_container(&mut arena);
        let a = create_display_object(&mut arena);
        let b = create_display_object(&mut arena);
        add_display_object_child(&mut arena, root, a);
        add_display_object_child(&mut arena, root, b);
        set_local_bounds(&mut arena, a, 0.0, 0.0, 50.0, 50.0);
        set_local_bounds(&mut arena, b, 200.0, 200.0, 50.0, 50.0);

        let mut out = Vec::new();
        hit_test_area_query_circle(&arena, root, 25.0, 25.0, 30.0, &mut out);
        assert!(out.contains(&a));
        assert!(!out.contains(&b));
    }

    #[test]
    fn hit_test_area_query_circle_skips_disabled_nodes() {
        let mut arena = new_arena();
        let root = create_display_container(&mut arena);
        let child = create_display_object(&mut arena);
        add_display_object_child(&mut arena, root, child);
        set_local_bounds(&mut arena, child, 0.0, 0.0, 50.0, 50.0);
        arena[child].spatial.enabled = false;

        let mut out = Vec::new();
        hit_test_area_query_circle(&arena, root, 25.0, 25.0, 100.0, &mut out);
        assert!(!out.contains(&child));
    }

    #[test]
    fn hit_test_area_query_circle_center_inside_bounds() {
        let mut arena = new_arena();
        let node = create_display_object(&mut arena);
        set_local_bounds(&mut arena, node, 10.0, 10.0, 30.0, 30.0);

        let mut out = Vec::new();
        hit_test_area_query_circle(&arena, node, 25.0, 25.0, 1.0, &mut out);
        assert!(out.contains(&node));
    }

    #[test]
    fn hit_test_area_query_circle_misses_when_too_far() {
        let mut arena = new_arena();
        let node = create_display_object(&mut arena);
        set_local_bounds(&mut arena, node, 0.0, 0.0, 10.0, 10.0);

        let mut out = Vec::new();
        hit_test_area_query_circle(&arena, node, 100.0, 100.0, 5.0, &mut out);
        assert!(out.is_empty());
    }
}
