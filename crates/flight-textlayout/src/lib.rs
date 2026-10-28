//! Renderer-agnostic text layout, bounds, metrics, and rich-text hit queries.
//!
//! Runtime-dependent rich-text content operations, `richTextMetrics`, and `textLayoutRuntime` move
//! to their final `text` owner under the Principal D8 ruling. Pure content construction stays in
//! this lower crate, which must not name the future text display objects.

// flight-lint: conform-skip(clearRichTextContent, computeRichTextContent, getRichTextContent, computeRichTextBottomScrollV, computeRichTextLineCount, computeRichTextMaxScrollH, computeRichTextMaxScrollV, computeRichTextTextHeight, computeRichTextTextWidth, getRichTextScrollYOffset, clearTextLayoutResult, getTextLayoutResult) Principal 46126ffc plus 8b33bdfb D8 moves only runtime-dependent functions to flight-text
// flight-lint: conform-skip(createTextFormatRange, initializeTextFormatRange) D8: defined once beside TextFormatRange in flight-textformat; re-exported here, not redefined

mod rich_text_content;
mod rich_text_query;
mod sugar;
mod text_bounds;
mod text_layout;
mod text_layout_group;
mod text_layout_measure;
mod text_line_breaks;
mod text_metrics;
mod text_units;
mod types;

pub mod contract;

pub use contract::RichTextContent;
pub use contract::TEXT_BOUNDS_GUTTER;
pub use contract::TEXT_LAYOUT_GUTTER;
pub use contract::TextAutoSize;
pub use contract::TextBoundsSpec;
pub use contract::TextJustification;
pub use contract::TextLayoutGroup;
pub use contract::TextLayoutMeasureState;
pub use contract::TextLayoutParams;
pub use contract::TextLayoutResult;
pub use contract::TextLineMetrics;
pub use contract::TextMetrics;
pub use contract::TextSelectionRectangle;
pub use contract::TextVerticalAlign;

pub use contract::compute_rich_text_char_index_at_point;
pub use contract::compute_rich_text_line_metrics;
pub use contract::compute_text_bounds_height;
pub use contract::compute_text_bounds_offset_x;
pub use contract::compute_text_bounds_rectangle;
pub use contract::compute_text_bounds_width;
pub use contract::compute_text_layout;
pub use contract::create_rich_text_content;
pub use contract::create_text_format_range;
pub use contract::create_text_layout_group;
pub use contract::create_text_layout_measure_state;
pub use contract::create_text_layout_result;
pub use contract::create_text_metrics;
pub use contract::get_rich_text_char_boundaries;
pub use contract::get_rich_text_first_char_in_paragraph;
pub use contract::get_rich_text_line_index_at_point;
pub use contract::get_rich_text_line_index_of_char;
pub use contract::get_rich_text_line_length;
pub use contract::get_rich_text_line_offset;
pub use contract::get_rich_text_line_text;
pub use contract::get_rich_text_link_at_point;
pub use contract::get_rich_text_paragraph_length;
pub use contract::get_rich_text_selection_rectangles;
pub use contract::get_text_layout_measure_provider;
pub use contract::get_text_line_break_index;
pub use contract::get_text_line_breaks;
pub use contract::get_text_metrics;
pub use contract::is_text_layout_truncated;
pub use contract::set_text_layout_measure_provider;
