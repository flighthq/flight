use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_bitmaptext::{
    BitmapText, BitmapTextGuardState, create_bitmap_text, get_bitmap_text_pages, update_bitmap_text,
};
use flight_entity::{Ref, allocate_entity};
use flight_glyphatlas::contract::{GlyphEntry, GlyphMetrics, GlyphSource};
use flight_node::NodeRef;
use flight_render_gl::{GlRenderState, register_gl_bitmap_texture_resolver};
use flight_scene2d_gl::*;
use flight_texture::TextureSourceRef;

use crate::gl_test_helper::{
    calls_with, count_calls, create_gl_state, make_color_scale_bias, make_scene2d_proxy,
};

fn glyph_entry(x: u32) -> Ref<GlyphEntry> {
    return Arc::new(RwLock::new(GlyphEntry {
        advance: 10.0,
        bearing_x: 0,
        bearing_y: 8,
        height: 8,
        page: 0,
        width: 6,
        x,
        y: 0,
    }));
}

// A single-page stub glyph source whose page-0 image carries a drawable source.
fn create_test_glyph_source() -> Ref<GlyphSource> {
    let entries = Arc::new(HashMap::from([
        (0x41, glyph_entry(0)),
        (0x42, glyph_entry(6)),
    ]));
    let image: TextureSourceRef = Arc::new(RwLock::new(flight_bitmap::create_bitmap(64, 64, None)));
    let mut source: GlyphSource = allocate_entity();
    source.get_glyph_atlas_image = Arc::new(move |page| {
        return if page.unwrap_or(0) == 0 {
            Some(image.clone())
        } else {
            None
        };
    });
    source.get_glyph_entry = Arc::new(move |codepoint| entries.get(&codepoint).cloned());
    source.get_glyph_kerning = Arc::new(|_, _| 0.0);
    source.get_glyph_layout_version = Arc::new(|| 0);
    source.get_glyph_metrics = Arc::new(|| {
        return Arc::new(GlyphMetrics {
            ascent: 8.0,
            descent: 2.0,
            line_gap: 0.0,
        });
    });
    return Arc::new(RwLock::new(source));
}

fn make_text(text: &str) -> Ref<BitmapText> {
    let node = create_bitmap_text(Some(create_test_glyph_source()));
    node.write().unwrap().data.text = text.to_string();
    update_bitmap_text(
        &mut node.write().unwrap(),
        &crate::gl_test_helper::test_default::<BitmapTextGuardState>(),
    );
    return node;
}

fn create_text_state() -> GlRenderState {
    let mut state = create_gl_state();
    register_gl_bitmap_texture_resolver(&mut state);
    register_gl_standard_material(&mut state);
    return state;
}

mod gl_bitmap_text_renderer {
    use super::*;

    #[test]
    fn has_create_data_and_submit_functions() {
        let mut state = create_gl_state();
        let node: NodeRef = make_text("A");
        assert!((GL_BITMAP_TEXT_RENDERER.create_data)(&mut state, &node).is_none());
    }

    #[test]
    fn draws_one_instanced_pass_covering_every_laid_out_glyph() {
        let text = make_text("AB");
        assert_eq!(
            get_bitmap_text_pages(&text.read().unwrap())[0].instance_count,
            2
        );
        let mut state = create_text_state();
        let proxy = make_scene2d_proxy(&mut state, text);

        (GL_BITMAP_TEXT_RENDERER.submit)(&mut state, &proxy);
        flush_gl_quad_batch_writer(&mut state);

        let draws = calls_with("draw_elements_instanced");
        assert_eq!(draws.len(), 1);
        assert_eq!(draws[0].integers[4], 2);
    }

    #[test]
    fn draws_nothing_for_empty_text() {
        let text = make_text("");
        let mut state = create_text_state();
        let proxy = make_scene2d_proxy(&mut state, text);

        (GL_BITMAP_TEXT_RENDERER.submit)(&mut state, &proxy);
        flush_gl_quad_batch_writer(&mut state);

        assert_eq!(count_calls("draw_elements_instanced"), 0);
    }

    #[test]
    fn folds_the_node_color_adjustment_in_when_the_adjustment_fold_is_enabled() {
        let text = make_text("A");
        let mut state = create_text_state();
        register_gl_color_adjustment_material_feature(&mut state);
        let mut proxy = make_scene2d_proxy(&mut state, text);
        proxy.color_scale_bias = Some(make_color_scale_bias(
            0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0,
        ));

        (GL_BITMAP_TEXT_RENDERER.submit)(&mut state, &proxy);
        flush_gl_quad_batch_writer(&mut state);

        assert_eq!(count_calls("draw_elements_instanced"), 1);
    }
}
