//! Glyph-source-backed bitmap text layout and its Node2D display node.

mod bitmap_text;
mod bitmap_text_strings;
mod enable_bitmap_text_guards;
mod explain_bitmap_text_missing_glyphs;
mod sugar;
mod types;
mod update_bitmap_text;

pub mod contract;

pub use contract::BITMAP_TEXT_KIND;
pub use contract::BitmapText;
pub use contract::BitmapTextAlign;
pub use contract::BitmapTextClock;
pub use contract::BitmapTextData;
pub use contract::BitmapTextGuardState;
pub use contract::BitmapTextLayoutGuard;
pub use contract::BitmapTextMissingGlyphGuard;
pub use contract::BitmapTextMissingGlyphs;
pub use contract::BitmapTextOptions;
pub use contract::BitmapTextPage;
pub use contract::BitmapTextRuntime;
pub use contract::GlyphSourceBitmapTextMethods;

pub use contract::compute_bitmap_text_local_bounds_rectangle;
pub use contract::create_bitmap_text;
pub use contract::disable_bitmap_text_guards;
pub use contract::enable_bitmap_text_guards;
pub use contract::explain_bitmap_text_missing_glyphs;
pub use contract::get_bitmap_text_align_string;
pub use contract::get_bitmap_text_bounds;
pub use contract::get_bitmap_text_line_count;
pub use contract::get_bitmap_text_pages;
pub use contract::is_bitmap_text_glyph_layout_stale;
pub use contract::is_bitmap_text_truncated;
pub use contract::parse_bitmap_text_align;
pub use contract::refresh_bitmap_text_glyph_layout;
pub use contract::reserve_bitmap_text;
pub use contract::set_bitmap_text_align;
pub use contract::set_bitmap_text_ellipsis;
pub use contract::set_bitmap_text_glyph_source;
pub use contract::set_bitmap_text_letter_spacing;
pub use contract::set_bitmap_text_line_height;
pub use contract::set_bitmap_text_max_lines;
pub use contract::set_bitmap_text_missing_glyph_guard;
pub use contract::set_bitmap_text_text;
pub use contract::set_bitmap_text_wrap_width;
pub use contract::update_bitmap_text;
