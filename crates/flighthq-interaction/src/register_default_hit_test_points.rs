//! Convenience registration of all built-in display object and sprite hit test
//! handlers.

use flighthq_types::{
    bitmap_kind, display_object_kind, html_view_kind, movie_clip_kind, quad_batch_kind,
    render_view_kind, rich_text_kind, scale9_shape_kind, shape_kind, sprite_kind, stage_kind,
    text_label_kind, tilemap_kind, video_kind,
};

use crate::display_hit_tests::{
    default_bitmap_hit_test_point, default_display_object_hit_test_point,
    default_html_view_hit_test_point, default_movie_clip_hit_test_point,
    default_render_view_hit_test_point, default_rich_text_hit_test_point,
    default_shape_hit_test_point, default_stage_hit_test_point, default_text_hit_test_point,
    default_video_hit_test_point,
};
use crate::hit_tests::register_hit_test_point;
use crate::sprite_hit_tests::{
    default_quad_batch_hit_test_point, default_sprite_hit_test_point,
    default_tilemap_hit_test_point,
};

/// Registers all built-in display object and sprite hit test handlers.
///
/// Call once at startup to opt every standard node kind into interaction
/// hit-testing.
pub fn register_default_hit_test_points() {
    register_hit_test_point(bitmap_kind(), default_bitmap_hit_test_point);
    register_hit_test_point(display_object_kind(), default_display_object_hit_test_point);
    register_hit_test_point(html_view_kind(), default_html_view_hit_test_point);
    register_hit_test_point(movie_clip_kind(), default_movie_clip_hit_test_point);
    register_hit_test_point(quad_batch_kind(), default_quad_batch_hit_test_point);
    register_hit_test_point(render_view_kind(), default_render_view_hit_test_point);
    register_hit_test_point(rich_text_kind(), default_rich_text_hit_test_point);
    register_hit_test_point(scale9_shape_kind(), default_shape_hit_test_point);
    register_hit_test_point(shape_kind(), default_shape_hit_test_point);
    register_hit_test_point(sprite_kind(), default_sprite_hit_test_point);
    register_hit_test_point(stage_kind(), default_stage_hit_test_point);
    register_hit_test_point(text_label_kind(), default_text_hit_test_point);
    register_hit_test_point(tilemap_kind(), default_tilemap_hit_test_point);
    register_hit_test_point(video_kind(), default_video_hit_test_point);
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_displayobject::{
        DisplayObjectArena, add_display_object_child, create_display_object,
        create_display_object_generic,
    };
    use flighthq_node::NodeId;

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

    #[test]
    fn register_default_hit_test_points_enables_bitmap_hit_test() {
        register_default_hit_test_points();
        let mut arena = new_arena();
        let parent = create_display_object(&mut arena);
        let child = create_display_object_generic(&mut arena, bitmap_kind(), None);
        set_bounds(&mut arena, child, 100.0, 100.0);
        add_display_object_child(&mut arena, parent, child);
        assert!(crate::hit_test_graph_point(
            &arena, parent, 50.0, 50.0, false
        ));
    }

    #[test]
    fn register_default_hit_test_points_enables_shape_hit_test() {
        register_default_hit_test_points();
        let mut arena = new_arena();
        let parent = create_display_object(&mut arena);
        let child = create_display_object_generic(&mut arena, shape_kind(), None);
        set_bounds(&mut arena, child, 100.0, 100.0);
        add_display_object_child(&mut arena, parent, child);
        assert!(crate::hit_test_graph_point(
            &arena, parent, 50.0, 50.0, false
        ));
    }

    #[test]
    fn register_default_hit_test_points_stage_returns_false() {
        register_default_hit_test_points();
        let mut arena = new_arena();
        let stage = create_display_object_generic(&mut arena, stage_kind(), None);
        set_bounds(&mut arena, stage, 100.0, 100.0);
        // Stage hit-test always returns false (children are traversed separately).
        assert!(!crate::hit_test_graph_point(
            &arena, stage, 50.0, 50.0, false
        ));
    }
}
