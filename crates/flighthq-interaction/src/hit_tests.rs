//! Core hit-test primitives: registry, graph traversal, and bounds tests.
//!
//! Hit testing operates over a [`DisplayObjectArena`]: every function takes the
//! arena and a [`NodeId`]. The TS port keyed hit behavior on the node's runtime
//! and walked node objects directly; here the same behavior is expressed against
//! the slot-map arena.
//!
//! World transforms are computed locally by walking each node's
//! `spatial.transform` chain rather than reaching into `flighthq-node`'s
//! arena-typed transform functions, since those operate on a differently-typed
//! arena. This keeps the crate self-contained against `DisplayObjectArena`.

use std::collections::HashMap;
use std::sync::RwLock;

use flighthq_displayobject::{DisplayObjectArena, get_display_object_kind};
use flighthq_geometry::{
    contains_rectangle_point_xy, intersects_rectangle, inverse_matrix_transform_point_xy,
    matrix_transform_bounds, merge_rectangle, multiply_matrix,
};
use flighthq_node::NodeId;
use flighthq_types::geometry::{MatrixLike, RectangleLike, Vector2Like};
use flighthq_types::kind::KindId;

/// A registered hit-test function for a node kind.
///
/// Receives the arena, the node id, the world-space `(x, y)`, and `shape_flag`.
/// When `shape_flag` is `true` callers request exact shape testing (e.g.
/// pixel-level alpha) instead of bounding-box testing; interpretation is
/// kind-specific.
pub type HitTestFn = fn(&DisplayObjectArena, NodeId, f32, f32, bool) -> bool;

/// Walks the scene graph depth-first in reverse child order (front-to-back)
/// and returns the id of the first node that registers a hit at world-space
/// `(x, y)`, or `None` if nothing was hit.
///
/// Disabled nodes are skipped entirely (no child traversal).
pub fn find_graph_hit_target(
    arena: &DisplayObjectArena,
    source: NodeId,
    x: f32,
    y: f32,
    shape_flag: bool,
) -> Option<NodeId> {
    if !arena[source].spatial.enabled {
        return None;
    }

    let children = &arena[source].spatial.hierarchy.children;
    for i in (0..children.len()).rev() {
        let child = arena[source].spatial.hierarchy.children[i];
        if let Some(hit) = find_graph_hit_target(arena, child, x, y, shape_flag) {
            return Some(hit);
        }
    }

    if let Some(hit_test_self) = get_hit_test_point(get_display_object_kind(arena, source))
        && hit_test_self(arena, source, x, y, shape_flag)
    {
        return Some(source);
    }

    None
}

/// Returns `true` if the world bounding boxes of `source` and `other`
/// intersect.
///
/// Returns `false` when either node has no parent (not attached to a graph).
pub fn hit_test_display_objects(arena: &DisplayObjectArena, source: NodeId, other: NodeId) -> bool {
    if arena[source].spatial.hierarchy.parent.is_none()
        || arena[other].spatial.hierarchy.parent.is_none()
    {
        return false;
    }

    let source_bounds = compute_world_bounds(arena, source);
    let other_bounds = compute_world_bounds(arena, other);
    intersects_rectangle(&source_bounds, &other_bounds)
}

/// Returns `true` if `(x, y)` falls within the local bounds rectangle of
/// `source`, after inverting through the node's world transform.
pub fn hit_test_graph_local_bounds(
    arena: &DisplayObjectArena,
    source: NodeId,
    x: f32,
    y: f32,
) -> bool {
    let world = compute_world_matrix(arena, source);
    let mut point = Vector2Like::default();
    inverse_matrix_transform_point_xy(&mut point, &world, x, y);
    let local = &arena[source].spatial.bounds.local;
    let local_like = RectangleLike {
        x: local.x,
        y: local.y,
        width: local.width,
        height: local.height,
    };
    contains_rectangle_point_xy(&local_like, point.x, point.y)
}

/// Returns `true` if `source` or any of its descendants register a hit at
/// world-space `(x, y)`.
///
/// Hit behavior must be registered via [`register_hit_test_point`].
/// Unregistered kinds are skipped for self-hit but children are still tested.
pub fn hit_test_graph_point(
    arena: &DisplayObjectArena,
    source: NodeId,
    x: f32,
    y: f32,
    shape_flag: bool,
) -> bool {
    if !arena[source].spatial.enabled {
        return false;
    }

    if let Some(hit_test_self) = get_hit_test_point(get_display_object_kind(arena, source))
        && hit_test_self(arena, source, x, y, shape_flag)
    {
        return true;
    }

    let count = arena[source].spatial.hierarchy.children.len();
    for i in 0..count {
        let child = arena[source].spatial.hierarchy.children[i];
        if hit_test_graph_point(arena, child, x, y, shape_flag) {
            return true;
        }
    }

    false
}

/// Registers a hit-test function for nodes of the given kind.
///
/// Call once at startup to opt a node kind into interaction hit-testing.
pub fn register_hit_test_point(kind: KindId, fn_: HitTestFn) {
    hit_test_point_registry().write().unwrap().insert(kind, fn_);
}

/// Returns the registered hit-test function for `kind`, or `None`.
pub(crate) fn get_hit_test_point(kind: KindId) -> Option<HitTestFn> {
    hit_test_point_registry()
        .read()
        .unwrap()
        .get(&kind)
        .copied()
}

/// Computes the world-space bounds of `source`, including the world bounds of
/// every descendant, by transforming each node's local bounds through its world
/// transform and merging.
fn compute_world_bounds(arena: &DisplayObjectArena, source: NodeId) -> RectangleLike {
    let mut out = RectangleLike::default();
    let mut has_bounds = false;
    accumulate_world_bounds(arena, source, &mut out, &mut has_bounds);
    out
}

fn accumulate_world_bounds(
    arena: &DisplayObjectArena,
    source: NodeId,
    out: &mut RectangleLike,
    has_bounds: &mut bool,
) {
    let local = &arena[source].spatial.bounds.local;
    if local.width != 0.0 || local.height != 0.0 {
        let world = compute_world_matrix(arena, source);
        let mut node_bounds = RectangleLike::default();
        matrix_transform_bounds(
            &mut node_bounds,
            &world,
            local.x,
            local.y,
            local.x + local.width,
            local.y + local.height,
        );
        if *has_bounds {
            let prev = *out;
            merge_rectangle(out, &prev, &node_bounds);
        } else {
            *out = node_bounds;
            *has_bounds = true;
        }
    }

    let count = arena[source].spatial.hierarchy.children.len();
    for i in 0..count {
        let child = arena[source].spatial.hierarchy.children[i];
        accumulate_world_bounds(arena, child, out, has_bounds);
    }
}

/// Computes the world transform matrix of `source` by chaining local transforms
/// from the root down. Mirrors `flighthq-node`'s local-transform construction.
pub(crate) fn compute_world_matrix(arena: &DisplayObjectArena, source: NodeId) -> MatrixLike {
    let local = compute_local_matrix(arena, source);
    match arena[source].spatial.hierarchy.parent {
        Some(parent) => {
            let parent_world = compute_world_matrix(arena, parent);
            let mut out = MatrixLike::default();
            multiply_matrix(&mut out, &parent_world, &local);
            out
        }
        None => local,
    }
}

/// Builds the local transform matrix for `source` from its transform fields.
///
/// Matches `recompute_local_transform` in `flighthq-node`: rotation is in
/// degrees, pivot maps `(pivot_x, pivot_y)` in local space to `(x, y)` in
/// parent space.
fn compute_local_matrix(arena: &DisplayObjectArena, source: NodeId) -> MatrixLike {
    let t = &arena[source].spatial.transform;
    let (cos, sin) = if t.rotation != 0.0 {
        let mut angle = t.rotation % 360.0;
        if angle > 180.0 {
            angle -= 360.0;
        } else if angle < -180.0 {
            angle += 360.0;
        }
        let rad = angle * DEG_TO_RAD;
        (rad.cos(), rad.sin())
    } else {
        (1.0, 0.0)
    };

    let a = cos * t.scale_x;
    let b = sin * t.scale_x;
    let c = -sin * t.scale_y;
    let d = cos * t.scale_y;
    MatrixLike {
        a,
        b,
        c,
        d,
        tx: t.x - (a * t.pivot_x + c * t.pivot_y),
        ty: t.y - (b * t.pivot_x + d * t.pivot_y),
    }
}

const DEG_TO_RAD: f32 = std::f32::consts::PI / 180.0;

fn hit_test_point_registry() -> &'static RwLock<HashMap<KindId, HitTestFn>> {
    use std::sync::OnceLock;
    static REGISTRY: OnceLock<RwLock<HashMap<KindId, HitTestFn>>> = OnceLock::new();
    REGISTRY.get_or_init(|| RwLock::new(HashMap::new()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_displayobject::{
        add_display_object_child, create_display_container, create_display_object,
        create_display_object_generic,
    };
    use flighthq_geometry::set_rectangle;
    use flighthq_types::display_object_kind;

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
        let mut r = RectangleLike::default();
        set_rectangle(&mut r, x, y, w, h);
        let b = &mut arena[id].spatial.bounds.local;
        b.x = r.x;
        b.y = r.y;
        b.width = r.width;
        b.height = r.height;
    }

    fn bounds_self_hit(
        arena: &DisplayObjectArena,
        id: NodeId,
        x: f32,
        y: f32,
        _shape_flag: bool,
    ) -> bool {
        hit_test_graph_local_bounds(arena, id, x, y)
    }

    // find_graph_hit_target

    #[test]
    fn find_graph_hit_target_returns_none_when_disabled() {
        let mut arena = new_arena();
        let obj = create_display_object(&mut arena);
        arena[obj].spatial.enabled = false;
        assert_eq!(find_graph_hit_target(&arena, obj, 50.0, 50.0, false), None);
    }

    #[test]
    fn find_graph_hit_target_returns_hit_child() {
        register_hit_test_point(display_object_kind(), bounds_self_hit);
        let mut arena = new_arena();
        let parent = create_display_object(&mut arena);
        let child = create_display_object_generic(&mut arena, display_object_kind(), None);
        set_local_bounds(&mut arena, child, 0.0, 0.0, 100.0, 100.0);
        add_display_object_child(&mut arena, parent, child);
        assert_eq!(
            find_graph_hit_target(&arena, parent, 50.0, 50.0, false),
            Some(child)
        );
    }

    // hit_test_display_objects

    #[test]
    fn hit_test_display_objects_true_when_bounds_intersect() {
        let mut arena = new_arena();
        let a = create_display_object(&mut arena);
        let b = create_display_object(&mut arena);
        let pa = create_display_container(&mut arena);
        let pb = create_display_container(&mut arena);
        add_display_object_child(&mut arena, pa, a);
        add_display_object_child(&mut arena, pb, b);
        set_local_bounds(&mut arena, a, 0.0, 0.0, 10.0, 10.0);
        set_local_bounds(&mut arena, b, 0.0, 0.0, 10.0, 10.0);
        arena[b].spatial.transform.x = 5.0;
        arena[b].spatial.transform.y = 5.0;
        assert!(hit_test_display_objects(&arena, a, b));
    }

    #[test]
    fn hit_test_display_objects_false_when_disjoint() {
        let mut arena = new_arena();
        let a = create_display_object(&mut arena);
        let b = create_display_object(&mut arena);
        let pa = create_display_container(&mut arena);
        let pb = create_display_container(&mut arena);
        add_display_object_child(&mut arena, pa, a);
        add_display_object_child(&mut arena, pb, b);
        set_local_bounds(&mut arena, a, 0.0, 0.0, 10.0, 10.0);
        set_local_bounds(&mut arena, b, 0.0, 0.0, 10.0, 10.0);
        arena[b].spatial.transform.x = 20.0;
        arena[b].spatial.transform.y = 20.0;
        assert!(!hit_test_display_objects(&arena, a, b));
    }

    #[test]
    fn hit_test_display_objects_false_when_no_parent() {
        let mut arena = new_arena();
        let a = create_display_object(&mut arena);
        let b = create_display_object(&mut arena);
        let pa = create_display_container(&mut arena);
        add_display_object_child(&mut arena, pa, a);
        set_local_bounds(&mut arena, a, 0.0, 0.0, 10.0, 10.0);
        set_local_bounds(&mut arena, b, 0.0, 0.0, 10.0, 10.0);
        assert!(!hit_test_display_objects(&arena, a, b));
    }

    #[test]
    fn hit_test_display_objects_includes_child_bounds() {
        let mut arena = new_arena();
        let a = create_display_container(&mut arena);
        let b = create_display_object(&mut arena);
        let pa = create_display_container(&mut arena);
        let pb = create_display_container(&mut arena);
        add_display_object_child(&mut arena, pa, a);
        add_display_object_child(&mut arena, pb, b);
        set_local_bounds(&mut arena, a, 0.0, 0.0, 10.0, 10.0);
        set_local_bounds(&mut arena, b, 0.0, 0.0, 10.0, 10.0);

        let child = create_display_object(&mut arena);
        arena[child].spatial.transform.x = 90.0;
        arena[child].spatial.transform.y = 90.0;
        set_local_bounds(&mut arena, child, 0.0, 0.0, 20.0, 20.0);
        add_display_object_child(&mut arena, a, child);

        arena[b].spatial.transform.x = 100.0;
        arena[b].spatial.transform.y = 100.0;
        assert!(hit_test_display_objects(&arena, a, b));
    }

    // hit_test_graph_local_bounds

    #[test]
    fn hit_test_graph_local_bounds_inside() {
        let mut arena = new_arena();
        let obj = create_display_object(&mut arena);
        set_local_bounds(&mut arena, obj, 0.0, 0.0, 100.0, 100.0);
        assert!(hit_test_graph_local_bounds(&arena, obj, 50.0, 50.0));
    }

    #[test]
    fn hit_test_graph_local_bounds_outside() {
        let mut arena = new_arena();
        let obj = create_display_object(&mut arena);
        set_local_bounds(&mut arena, obj, 0.0, 0.0, 100.0, 100.0);
        assert!(!hit_test_graph_local_bounds(&arena, obj, 200.0, 200.0));
    }

    // hit_test_graph_point

    #[test]
    fn hit_test_graph_point_inside_and_outside() {
        register_hit_test_point(display_object_kind(), bounds_self_hit);
        let mut arena = new_arena();
        let obj = create_display_object(&mut arena);
        set_local_bounds(&mut arena, obj, 0.0, 0.0, 100.0, 100.0);
        assert!(hit_test_graph_point(&arena, obj, 50.0, 50.0, false));
        assert!(!hit_test_graph_point(&arena, obj, 200.0, 200.0, false));
    }

    #[test]
    fn hit_test_graph_point_false_when_disabled() {
        register_hit_test_point(display_object_kind(), bounds_self_hit);
        let mut arena = new_arena();
        let obj = create_display_object(&mut arena);
        set_local_bounds(&mut arena, obj, 0.0, 0.0, 100.0, 100.0);
        arena[obj].spatial.enabled = false;
        assert!(!hit_test_graph_point(&arena, obj, 50.0, 50.0, false));
    }

    #[test]
    fn hit_test_graph_point_respects_world_transform() {
        register_hit_test_point(display_object_kind(), bounds_self_hit);
        let mut arena = new_arena();
        let obj = create_display_object(&mut arena);
        set_local_bounds(&mut arena, obj, 0.0, 0.0, 100.0, 100.0);
        arena[obj].spatial.transform.x = 100.0;
        arena[obj].spatial.transform.y = 100.0;
        assert!(hit_test_graph_point(&arena, obj, 150.0, 150.0, false));
        assert!(!hit_test_graph_point(&arena, obj, 50.0, 50.0, false));
    }

    #[test]
    fn hit_test_graph_point_hits_child_when_parent_empty() {
        register_hit_test_point(display_object_kind(), bounds_self_hit);
        let mut arena = new_arena();
        let obj = create_display_object(&mut arena);
        let child = create_display_object(&mut arena);
        set_local_bounds(&mut arena, child, 0.0, 0.0, 100.0, 100.0);
        add_display_object_child(&mut arena, obj, child);
        set_local_bounds(&mut arena, obj, 0.0, 0.0, 0.0, 0.0);
        assert!(hit_test_graph_point(&arena, obj, 50.0, 50.0, false));
    }

    #[test]
    fn hit_test_graph_point_does_not_test_children_of_disabled_parent() {
        register_hit_test_point(display_object_kind(), bounds_self_hit);
        let mut arena = new_arena();
        let obj = create_display_object(&mut arena);
        arena[obj].spatial.enabled = false;
        let child = create_display_object(&mut arena);
        set_local_bounds(&mut arena, child, 0.0, 0.0, 100.0, 100.0);
        add_display_object_child(&mut arena, obj, child);
        assert!(!hit_test_graph_point(&arena, obj, 50.0, 50.0, false));
    }

    // register_hit_test_point

    #[test]
    fn register_hit_test_point_custom_kind() {
        let kind = KindId::new();
        fn always_true(_: &DisplayObjectArena, _: NodeId, _: f32, _: f32, _: bool) -> bool {
            true
        }
        register_hit_test_point(kind, always_true);
        let mut arena = new_arena();
        let node = create_display_object_generic(&mut arena, kind, None);
        assert!(hit_test_graph_point(&arena, node, 0.0, 0.0, false));
    }
}
