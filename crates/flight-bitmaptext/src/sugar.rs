use flight_entity::Ref;
use flight_geometry::Rectangle;
use flight_glyphatlas::GlyphSource;
use flight_log::LogStateRef;

use crate::bitmap_text::*;
use crate::bitmap_text_strings::*;
use crate::enable_bitmap_text_guards::*;
use crate::explain_bitmap_text_missing_glyphs::*;
use crate::types::*;
use crate::update_bitmap_text::*;

#[cfg(test)]
#[path = "sugar_tests.rs"]
mod sugar_tests;

pub trait GlyphSourceBitmapTextMethods {
    fn explain_bitmap_text_missing_glyphs(&self, text: &str) -> BitmapTextMissingGlyphs;
}

impl GlyphSourceBitmapTextMethods for Ref<GlyphSource> {
    fn explain_bitmap_text_missing_glyphs(&self, text: &str) -> BitmapTextMissingGlyphs {
        return explain_bitmap_text_missing_glyphs(self, text);
    }
}

impl BitmapText {
    pub fn new(glyph_source: Option<Ref<GlyphSource>>) -> Ref<Self> {
        return create_bitmap_text(glyph_source);
    }

    pub fn compute_local_bounds_rectangle(&self, out: &mut Rectangle) {
        compute_bitmap_text_local_bounds_rectangle(out, self);
    }

    pub fn get_bounds(&self) -> Rectangle {
        return get_bitmap_text_bounds(self);
    }

    pub fn get_line_count(&self) -> usize {
        return get_bitmap_text_line_count(self);
    }

    pub fn get_pages(&self) -> &[BitmapTextPage] {
        return get_bitmap_text_pages(self);
    }

    pub fn is_glyph_layout_stale(&self) -> bool {
        return is_bitmap_text_glyph_layout_stale(self);
    }

    pub fn is_truncated(&self) -> bool {
        return is_bitmap_text_truncated(self);
    }

    pub fn refresh_glyph_layout(&mut self, guard_state: &BitmapTextGuardState) -> bool {
        return refresh_bitmap_text_glyph_layout(self, guard_state);
    }

    pub fn reserve(&mut self, glyph_capacity: usize) {
        reserve_bitmap_text(self, glyph_capacity);
    }

    pub fn set_align(&mut self, align: BitmapTextAlign) {
        set_bitmap_text_align(self, align);
    }

    pub fn set_ellipsis(&mut self, ellipsis: &str) {
        set_bitmap_text_ellipsis(self, ellipsis);
    }

    pub fn set_glyph_source(&mut self, glyph_source: Option<Ref<GlyphSource>>) {
        set_bitmap_text_glyph_source(self, glyph_source);
    }

    pub fn set_letter_spacing(&mut self, letter_spacing: f32) {
        set_bitmap_text_letter_spacing(self, letter_spacing);
    }

    pub fn set_line_height(&mut self, line_height: f32) {
        set_bitmap_text_line_height(self, line_height);
    }

    pub fn set_max_lines(&mut self, max_lines: Option<usize>) {
        set_bitmap_text_max_lines(self, max_lines);
    }

    pub fn set_text(&mut self, text: &str) {
        set_bitmap_text_text(self, text);
    }

    pub fn set_wrap_width(&mut self, wrap_width: Option<f32>) {
        set_bitmap_text_wrap_width(self, wrap_width);
    }

    pub fn update(&mut self, guard_state: &BitmapTextGuardState) {
        update_bitmap_text(self, guard_state);
    }
}

impl BitmapTextAlign {
    pub fn as_str(&self) -> &'static str {
        return get_bitmap_text_align_string(*self);
    }
}

impl BitmapTextGuardState {
    pub fn disable(&mut self) {
        disable_bitmap_text_guards(self);
    }

    pub fn enable(&mut self, log_state: &LogStateRef, clock: BitmapTextClock) {
        enable_bitmap_text_guards(self, log_state, clock);
    }

    pub fn set_missing_glyph_guard(&mut self, guard: Option<BitmapTextMissingGlyphGuard>) {
        set_bitmap_text_missing_glyph_guard(self, guard);
    }
}
