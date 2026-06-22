//! Default hit-test functions for display object node kinds.
//!
//! These are ready-to-use implementations to pass to
//! [`crate::register_hit_test_point`]. Each corresponds to a display object
//! type defined in `flighthq-displayobject` and matches the [`crate::HitTestFn`]
//! signature: `fn(&DisplayObjectArena, NodeId, f32, f32, bool) -> bool`.

use flighthq_displayobject::DisplayObjectArena;
use flighthq_node::NodeId;

use crate::hit_tests::hit_test_graph_local_bounds;

/// Hit-test for `Bitmap` nodes: `true` when `(x, y)` is inside local bounds.
pub fn default_bitmap_hit_test_point(
    arena: &DisplayObjectArena,
    source: NodeId,
    x: f32,
    y: f32,
    _shape_flag: bool,
) -> bool {
    hit_test_graph_local_bounds(arena, source, x, y)
}

/// Hit-test for base `DisplayObject` container nodes: always `false`.
///
/// Containers have no self hit-area; [`crate::find_graph_hit_target`] traverses
/// children separately.
pub fn default_display_object_hit_test_point(
    _arena: &DisplayObjectArena,
    _source: NodeId,
    _x: f32,
    _y: f32,
    _shape_flag: bool,
) -> bool {
    false
}

/// Hit-test for `HTMLView` nodes: always `false`.
///
/// HTMLView elements handle pointer events through the platform, not the
/// interaction system.
pub fn default_html_view_hit_test_point(
    _arena: &DisplayObjectArena,
    _source: NodeId,
    _x: f32,
    _y: f32,
    _shape_flag: bool,
) -> bool {
    false
}

/// Hit-test for `MovieClip` container nodes: always `false`.
///
/// Containers have no self hit-area; children are traversed separately.
pub fn default_movie_clip_hit_test_point(
    _arena: &DisplayObjectArena,
    _source: NodeId,
    _x: f32,
    _y: f32,
    _shape_flag: bool,
) -> bool {
    false
}

/// Hit-test for `RenderView` nodes: `true` when `(x, y)` is inside local bounds.
pub fn default_render_view_hit_test_point(
    arena: &DisplayObjectArena,
    source: NodeId,
    x: f32,
    y: f32,
    _shape_flag: bool,
) -> bool {
    hit_test_graph_local_bounds(arena, source, x, y)
}

/// Hit-test for `RichText` nodes: `true` when `(x, y)` is inside local bounds.
pub fn default_rich_text_hit_test_point(
    arena: &DisplayObjectArena,
    source: NodeId,
    x: f32,
    y: f32,
    _shape_flag: bool,
) -> bool {
    hit_test_graph_local_bounds(arena, source, x, y)
}

/// Hit-test for `Shape` nodes: `true` when `(x, y)` is inside local bounds.
///
/// Shape-flag exact path hit-testing is not yet implemented.
pub fn default_shape_hit_test_point(
    arena: &DisplayObjectArena,
    source: NodeId,
    x: f32,
    y: f32,
    _shape_flag: bool,
) -> bool {
    hit_test_graph_local_bounds(arena, source, x, y)
}

/// Hit-test for `Stage` nodes: always `false`.
///
/// Stages have no self hit-area; children are traversed separately.
pub fn default_stage_hit_test_point(
    _arena: &DisplayObjectArena,
    _source: NodeId,
    _x: f32,
    _y: f32,
    _shape_flag: bool,
) -> bool {
    false
}

/// Hit-test for `Text` / `TextLabel` nodes: `true` when `(x, y)` is inside
/// local bounds.
pub fn default_text_hit_test_point(
    arena: &DisplayObjectArena,
    source: NodeId,
    x: f32,
    y: f32,
    _shape_flag: bool,
) -> bool {
    hit_test_graph_local_bounds(arena, source, x, y)
}

/// Hit-test for `TextInput` nodes: `true` when `(x, y)` is inside local bounds.
pub fn default_text_input_hit_test_point(
    arena: &DisplayObjectArena,
    source: NodeId,
    x: f32,
    y: f32,
    _shape_flag: bool,
) -> bool {
    hit_test_graph_local_bounds(arena, source, x, y)
}

/// Hit-test for `Video` nodes: `true` when `(x, y)` is inside local bounds.
pub fn default_video_hit_test_point(
    arena: &DisplayObjectArena,
    source: NodeId,
    x: f32,
    y: f32,
    _shape_flag: bool,
) -> bool {
    hit_test_graph_local_bounds(arena, source, x, y)
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

    /// Builds a display object sized 100x100 at the origin.
    fn make_display_object() -> (DisplayObjectArena, NodeId) {
        let mut arena = new_arena();
        let id = create_display_object(&mut arena);
        set_bounds(&mut arena, id, 100.0, 100.0);
        (arena, id)
    }

    #[test]
    fn default_bitmap_hit_test_point_inside_and_outside() {
        let (arena, id) = make_display_object();
        assert!(default_bitmap_hit_test_point(&arena, id, 50.0, 50.0, false));
        assert!(!default_bitmap_hit_test_point(
            &arena, id, 200.0, 200.0, false
        ));
    }

    #[test]
    fn default_display_object_hit_test_point_always_false() {
        let (arena, id) = make_display_object();
        assert!(!default_display_object_hit_test_point(
            &arena, id, 50.0, 50.0, false
        ));
        assert!(!default_display_object_hit_test_point(
            &arena, id, 0.0, 0.0, false
        ));
        assert!(!default_display_object_hit_test_point(
            &arena, id, 200.0, 200.0, false
        ));
    }

    #[test]
    fn default_html_view_hit_test_point_always_false() {
        let (arena, id) = make_display_object();
        assert!(!default_html_view_hit_test_point(
            &arena, id, 50.0, 50.0, false
        ));
    }

    #[test]
    fn default_movie_clip_hit_test_point_always_false() {
        let (arena, id) = make_display_object();
        assert!(!default_movie_clip_hit_test_point(
            &arena, id, 50.0, 50.0, false
        ));
    }

    #[test]
    fn default_render_view_hit_test_point_inside_and_outside() {
        let (arena, id) = make_display_object();
        assert!(default_render_view_hit_test_point(
            &arena, id, 50.0, 50.0, false
        ));
        assert!(!default_render_view_hit_test_point(
            &arena, id, 200.0, 200.0, false
        ));
    }

    #[test]
    fn default_rich_text_hit_test_point_inside_and_outside() {
        let (arena, id) = make_display_object();
        assert!(default_rich_text_hit_test_point(
            &arena, id, 50.0, 50.0, false
        ));
        assert!(!default_rich_text_hit_test_point(
            &arena, id, 200.0, 200.0, false
        ));
    }

    #[test]
    fn default_shape_hit_test_point_inside_and_outside() {
        let (arena, id) = make_display_object();
        assert!(default_shape_hit_test_point(&arena, id, 50.0, 50.0, false));
        assert!(!default_shape_hit_test_point(
            &arena, id, 200.0, 200.0, false
        ));
    }

    #[test]
    fn default_stage_hit_test_point_always_false() {
        let (arena, id) = make_display_object();
        assert!(!default_stage_hit_test_point(&arena, id, 50.0, 50.0, false));
    }

    #[test]
    fn default_text_hit_test_point_inside_and_outside() {
        let (arena, id) = make_display_object();
        assert!(default_text_hit_test_point(&arena, id, 50.0, 50.0, false));
        assert!(!default_text_hit_test_point(
            &arena, id, 200.0, 200.0, false
        ));
    }

    #[test]
    fn default_text_input_hit_test_point_inside_and_outside() {
        let (arena, id) = make_display_object();
        assert!(default_text_input_hit_test_point(
            &arena, id, 50.0, 50.0, false
        ));
        assert!(!default_text_input_hit_test_point(
            &arena, id, 200.0, 200.0, false
        ));
    }

    #[test]
    fn default_video_hit_test_point_inside_and_outside() {
        let (arena, id) = make_display_object();
        assert!(default_video_hit_test_point(&arena, id, 50.0, 50.0, false));
        assert!(!default_video_hit_test_point(
            &arena, id, 200.0, 200.0, false
        ));
    }
}
