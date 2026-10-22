use std::sync::Arc;

use flight_quadbatch::contract::QUAD_BATCH_KIND;
use flight_scene2d::{DISPLAY_OBJECT_KIND, HTML_VIEW_KIND, SCALE9_SPRITE_KIND, SPRITE_KIND};
use flight_shape::contract::{MORPH_SHAPE_KIND, SCALE9_SHAPE_KIND, SHAPE_KIND};
use flight_text::{RICH_TEXT_KIND, TEXT_LABEL_KIND};
use flight_tilemap::contract::TILEMAP_KIND;

use crate::display_hit_tests::{
    default_html_view_hit_test_handler, default_movie_clip_hit_test_handler,
    default_node2d_hit_test_handler, default_rich_text_hit_test_handler,
    default_shape_hit_test_handler, default_text_hit_test_handler,
};
use crate::hit_tests::{HitTestContext, register_hit_test};
use crate::sprite_hit_tests::{
    default_quad_batch_hit_test_handler, default_sprite_hit_test_handler,
    default_tilemap_hit_test_handler,
};

// flight-lint: allow(conform-params) D5: caller-owned hit test context
pub fn register_default_hit_tests(ctx: &mut HitTestContext) {
    register_hit_test(
        ctx,
        DISPLAY_OBJECT_KIND.to_string(),
        Arc::new(default_node2d_hit_test_handler),
    );
    register_hit_test(
        ctx,
        HTML_VIEW_KIND.to_string(),
        Arc::new(default_html_view_hit_test_handler),
    );
    register_hit_test(
        ctx,
        "MovieClip".to_string(),
        Arc::new(default_movie_clip_hit_test_handler),
    );
    register_hit_test(
        ctx,
        MORPH_SHAPE_KIND.to_string(),
        Arc::new(default_shape_hit_test_handler),
    );
    register_hit_test(
        ctx,
        QUAD_BATCH_KIND.to_string(),
        Arc::new(default_quad_batch_hit_test_handler),
    );
    register_hit_test(
        ctx,
        RICH_TEXT_KIND.to_string(),
        Arc::new(default_rich_text_hit_test_handler),
    );
    register_hit_test(
        ctx,
        SCALE9_SHAPE_KIND.to_string(),
        Arc::new(default_shape_hit_test_handler),
    );
    register_hit_test(
        ctx,
        SCALE9_SPRITE_KIND.to_string(),
        Arc::new(default_sprite_hit_test_handler),
    );
    register_hit_test(
        ctx,
        SHAPE_KIND.to_string(),
        Arc::new(default_shape_hit_test_handler),
    );
    register_hit_test(
        ctx,
        SPRITE_KIND.to_string(),
        Arc::new(default_sprite_hit_test_handler),
    );
    register_hit_test(
        ctx,
        TEXT_LABEL_KIND.to_string(),
        Arc::new(default_text_hit_test_handler),
    );
    register_hit_test(
        ctx,
        TILEMAP_KIND.to_string(),
        Arc::new(default_tilemap_hit_test_handler),
    );
}
