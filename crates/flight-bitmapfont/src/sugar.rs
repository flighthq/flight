use flight_entity::Ref;
use flight_font::GlyphMetrics;
use flight_glyphatlas::{GlyphAtlas, GlyphEntry, GlyphSource};
use flight_log::LogStateRef;
use flight_textureatlas::TextureAtlas;

use crate::bitmap_font::*;
use crate::bitmap_font_from_glyph_atlas::*;
use crate::bitmap_font_glyph_source::*;
use crate::bitmap_font_strings::*;
use crate::enable_bitmap_font_guards::*;
use crate::explain_bitmap_font_glyph::*;
use crate::summarize_bitmap_font::*;
use crate::types::*;

#[cfg(test)]
#[path = "sugar_tests.rs"]
mod sugar_tests;

pub trait BitmapFontGlyphSourceMethods {
    fn initialize_from_bitmap_font(&mut self, font: &Ref<BitmapFont>);
}

impl BitmapFontGlyphSourceMethods for GlyphSource {
    fn initialize_from_bitmap_font(&mut self, font: &Ref<BitmapFont>) {
        initialize_glyph_source_from_bitmap_font(self, font);
    }
}

pub trait BitmapFontGuardStateMethods {
    fn disable(&self);
    fn enable(&self, log_state: &LogStateRef, clock: BitmapFontClock);
    fn set_guard(&self, guard: Option<BitmapFontGuard>);
}

impl BitmapFontGuardStateMethods for BitmapFontGuardStateRef {
    fn disable(&self) {
        disable_bitmap_font_guards(self);
    }

    fn enable(&self, log_state: &LogStateRef, clock: BitmapFontClock) {
        enable_bitmap_font_guards(self, log_state, clock);
    }

    fn set_guard(&self, guard: Option<BitmapFontGuard>) {
        set_bitmap_font_guard(self, guard);
    }
}

pub trait BitmapFontMethods {
    fn create_glyph_source(&self) -> Ref<GlyphSource>;
    fn explain_glyph(&self, codepoint: u32) -> BitmapFontGlyphExplanation;
    fn get_glyph(&self, codepoint: u32) -> Option<Ref<GlyphEntry>>;
    fn get_kerning(&self, left: u32, right: u32) -> f32;
    fn get_metrics(&self) -> std::sync::Arc<GlyphMetrics>;
    fn get_page(&self, page: Option<usize>) -> Option<Ref<TextureAtlas>>;
    fn get_pages(&self) -> Vec<Ref<TextureAtlas>>;
    fn has_glyph(&self, codepoint: u32) -> bool;
    fn summarize(&self) -> BitmapFontSummary;
}

impl BitmapFontMethods for Ref<BitmapFont> {
    fn create_glyph_source(&self) -> Ref<GlyphSource> {
        return create_glyph_source_from_bitmap_font(self);
    }

    fn explain_glyph(&self, codepoint: u32) -> BitmapFontGlyphExplanation {
        return explain_bitmap_font_glyph(self, codepoint);
    }

    fn get_glyph(&self, codepoint: u32) -> Option<Ref<GlyphEntry>> {
        return get_bitmap_font_glyph(self, codepoint);
    }

    fn get_kerning(&self, left: u32, right: u32) -> f32 {
        return get_bitmap_font_kerning(self, left, right);
    }

    fn get_metrics(&self) -> std::sync::Arc<GlyphMetrics> {
        return get_bitmap_font_metrics(self);
    }

    fn get_page(&self, page: Option<usize>) -> Option<Ref<TextureAtlas>> {
        return get_bitmap_font_page(self, page);
    }

    fn get_pages(&self) -> Vec<Ref<TextureAtlas>> {
        return get_bitmap_font_pages(self);
    }

    fn has_glyph(&self, codepoint: u32) -> bool {
        return has_bitmap_font_glyph(self, codepoint);
    }

    fn summarize(&self) -> BitmapFontSummary {
        return summarize_bitmap_font(self);
    }
}

pub trait GlyphAtlasBitmapFontMethods {
    fn create_bitmap_font(&self, guard_state: &BitmapFontGuardStateRef) -> Ref<BitmapFont>;
}

impl GlyphAtlasBitmapFontMethods for Ref<GlyphAtlas> {
    fn create_bitmap_font(&self, guard_state: &BitmapFontGuardStateRef) -> Ref<BitmapFont> {
        return create_bitmap_font_from_glyph_atlas(guard_state, self);
    }
}

impl BitmapFont {
    pub fn new(guard_state: &BitmapFontGuardStateRef, data: &BitmapFontData) -> Ref<BitmapFont> {
        return create_bitmap_font(guard_state, data);
    }

    pub fn initialize(&mut self, guard_state: &BitmapFontGuardStateRef, data: &BitmapFontData) {
        initialize_bitmap_font(self, guard_state, data);
    }
}

impl BitmapFontEncoding {
    pub fn as_str(&self) -> &'static str {
        return get_bitmap_font_encoding_string(*self);
    }
}

impl BitmapFontGlyphExplanationReason {
    pub fn as_str(&self) -> &'static str {
        return get_bitmap_font_glyph_explanation_reason_string(*self);
    }
}

impl BitmapFontGuardLogKey {
    pub fn as_str(&self) -> &'static str {
        return get_bitmap_font_guard_log_key_string(*self);
    }
}

impl BitmapFontGuardReason {
    pub fn as_str(&self) -> &'static str {
        return get_bitmap_font_guard_reason_string(*self);
    }
}

impl BitmapFontGuardState {
    pub fn new() -> BitmapFontGuardStateRef {
        return create_bitmap_font_guard_state();
    }
}

impl BitmapFontKerningPair {
    pub fn unpack(&mut self, key: u64) {
        unpack_bitmap_font_kerning_key(self, key);
    }
}
