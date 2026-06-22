//! Default hit-test functions for sprite graph node kinds.
//!
//! Ready-to-use implementations to pass to [`crate::register_hit_test_point`].
//! Each corresponds to a node type defined in `flighthq-sprite` and matches the
//! [`crate::HitTestFn`] signature:
//! `fn(&DisplayObjectArena, NodeId, f32, f32, bool) -> bool`.

use flighthq_displayobject::DisplayObjectArena;
use flighthq_node::NodeId;

use crate::hit_tests::hit_test_graph_local_bounds;

/// Hit-test for `QuadBatch` nodes: delegates to bounds-based sprite hit-test.
///
/// Per-quad shape testing is not yet implemented.
pub fn default_quad_batch_hit_test_point(
    arena: &DisplayObjectArena,
    source: NodeId,
    x: f32,
    y: f32,
    shape_flag: bool,
) -> bool {
    default_sprite_hit_test_point(arena, source, x, y, shape_flag)
}

/// Hit-test for `Sprite` nodes: `true` when `(x, y)` is inside local bounds.
pub fn default_sprite_hit_test_point(
    arena: &DisplayObjectArena,
    source: NodeId,
    x: f32,
    y: f32,
    _shape_flag: bool,
) -> bool {
    hit_test_graph_local_bounds(arena, source, x, y)
}

/// Hit-test for `Tilemap` nodes: delegates to bounds-based sprite hit-test.
///
/// Per-tile shape testing is not yet implemented.
pub fn default_tilemap_hit_test_point(
    arena: &DisplayObjectArena,
    source: NodeId,
    x: f32,
    y: f32,
    shape_flag: bool,
) -> bool {
    default_sprite_hit_test_point(arena, source, x, y, shape_flag)
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_displayobject::create_display_object;

    fn new_arena() -> DisplayObjectArena {
        slotmap::SlotMap::with_key()
    }

    fn set_bounds(arena: &mut DisplayObjectArena, id: NodeId, w: f32, h: f32) {
        let b = &mut arena[id].spatial.bounds.local;
        b.x = 0.0;
        b.y = 0.0;
        b.width = w;
        b.height = h;
    }

    fn make_sprite(w: f32, h: f32) -> (DisplayObjectArena, NodeId) {
        let mut arena = new_arena();
        let id = create_display_object(&mut arena);
        set_bounds(&mut arena, id, w, h);
        (arena, id)
    }

    #[test]
    fn default_quad_batch_hit_test_point_inside_and_outside() {
        let (arena, id) = make_sprite(100.0, 100.0);
        assert!(default_quad_batch_hit_test_point(
            &arena, id, 50.0, 50.0, false
        ));
        assert!(!default_quad_batch_hit_test_point(
            &arena, id, 200.0, 200.0, false
        ));
    }

    #[test]
    fn default_sprite_hit_test_point_inside_and_outside() {
        let (arena, id) = make_sprite(100.0, 100.0);
        assert!(default_sprite_hit_test_point(&arena, id, 50.0, 50.0, false));
        assert!(!default_sprite_hit_test_point(
            &arena, id, 200.0, 200.0, false
        ));
    }

    #[test]
    fn default_sprite_hit_test_point_zero_size_misses() {
        let (arena, id) = make_sprite(0.0, 0.0);
        assert!(!default_sprite_hit_test_point(&arena, id, 0.0, 0.0, false));
    }

    #[test]
    fn default_sprite_hit_test_point_ignores_shape_flag() {
        let (arena, id) = make_sprite(100.0, 100.0);
        assert!(default_sprite_hit_test_point(&arena, id, 10.0, 10.0, true));
        assert!(!default_sprite_hit_test_point(
            &arena, id, 200.0, 200.0, true
        ));
    }

    #[test]
    fn default_tilemap_hit_test_point_inside_and_outside() {
        let (arena, id) = make_sprite(100.0, 100.0);
        assert!(default_tilemap_hit_test_point(
            &arena, id, 10.0, 10.0, false
        ));
        assert!(!default_tilemap_hit_test_point(
            &arena, id, 999.0, 999.0, false
        ));
    }
}
