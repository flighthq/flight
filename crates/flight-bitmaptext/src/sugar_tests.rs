use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_glyphatlas::GlyphSource;
use flight_log::create_log_state;

use crate::contract::*;

#[test]
fn bitmap_text_methods_match_free_functions() {
    let method = BitmapText::new(None);
    let function = create_bitmap_text(None);
    {
        let mut method = method.write().unwrap();
        let mut function = function.write().unwrap();
        method.set_align(BitmapTextAlign::Right);
        set_bitmap_text_align(&mut function, BitmapTextAlign::Right);
        method.set_ellipsis("...");
        set_bitmap_text_ellipsis(&mut function, "...");
        method.set_glyph_source(Some(source()));
        set_bitmap_text_glyph_source(&mut function, Some(source()));
        method.set_letter_spacing(2.0);
        set_bitmap_text_letter_spacing(&mut function, 2.0);
        method.set_line_height(1.5);
        set_bitmap_text_line_height(&mut function, 1.5);
        method.set_max_lines(Some(2));
        set_bitmap_text_max_lines(&mut function, Some(2));
        method.set_text("changed");
        set_bitmap_text_text(&mut function, "changed");
        method.set_wrap_width(Some(20.0));
        set_bitmap_text_wrap_width(&mut function, Some(20.0));
        method.reserve(4);
        reserve_bitmap_text(&mut function, 4);
        method.update(&guard_state());
        update_bitmap_text(&mut function, &guard_state());

        assert_eq!(method.data.align, function.data.align);
        assert_eq!(method.data.ellipsis, function.data.ellipsis);
        assert_eq!(method.data.letter_spacing, function.data.letter_spacing);
        assert_eq!(method.data.line_height, function.data.line_height);
        assert_eq!(method.data.max_lines, function.data.max_lines);
        assert_eq!(method.data.text, function.data.text);
        assert_eq!(method.data.wrap_width, function.data.wrap_width);
        assert_eq!(method.get_bounds(), get_bitmap_text_bounds(&function));
        assert_eq!(
            method.get_line_count(),
            get_bitmap_text_line_count(&function)
        );
        assert_eq!(
            method.get_pages().len(),
            get_bitmap_text_pages(&function).len()
        );
        assert_eq!(
            method.is_glyph_layout_stale(),
            is_bitmap_text_glyph_layout_stale(&function),
        );
        assert_eq!(method.is_truncated(), is_bitmap_text_truncated(&function));
        assert_eq!(
            method.refresh_glyph_layout(&guard_state()),
            refresh_bitmap_text_glyph_layout(&mut function, &guard_state(),),
        );
    }
}

fn guard_state() -> BitmapTextGuardState {
    return BitmapTextGuardState::default();
}

#[test]
fn guard_state_methods_match_free_functions() {
    let log_state = Arc::new(RwLock::new(create_log_state()));
    let clock: BitmapTextClock = Arc::new(|| 0.0);
    let mut method = guard_state();
    let mut function = guard_state();
    method.enable(&log_state, clock.clone());
    enable_bitmap_text_guards(&mut function, &log_state, clock);
    assert_eq!(
        method.layout_guard.is_some(),
        function.layout_guard.is_some()
    );
    assert_eq!(
        method.missing_glyph_guard.is_some(),
        function.missing_glyph_guard.is_some(),
    );

    method.set_missing_glyph_guard(None);
    set_bitmap_text_missing_glyph_guard(&mut function, None);
    assert_eq!(
        method.missing_glyph_guard.is_some(),
        function.missing_glyph_guard.is_some(),
    );
    method.disable();
    disable_bitmap_text_guards(&mut function);
    assert_eq!(
        method.layout_guard.is_some(),
        function.layout_guard.is_some()
    );
}

fn source() -> Ref<GlyphSource> {
    return Arc::new(RwLock::new(allocate_entity()));
}

#[test]
fn value_and_source_methods_match_free_functions() {
    assert_eq!(
        BitmapTextAlign::Justify.as_str(),
        get_bitmap_text_align_string(BitmapTextAlign::Justify),
    );
    let source = source();
    assert_eq!(
        source.explain_bitmap_text_missing_glyphs("AB"),
        explain_bitmap_text_missing_glyphs(&source, "AB"),
    );
}
