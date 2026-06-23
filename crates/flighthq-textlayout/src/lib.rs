//! `flighthq-textlayout` — renderer-agnostic text layout engine.
//!
//! Provides free functions for measuring and positioning glyphs into
//! `TextLayoutGroup`s, computing line metrics, resolving rich-text HTML
//! content, and querying spatial positions within a laid-out text field.

pub mod rich_text_content;
pub mod rich_text_metrics;
pub mod rich_text_query;
pub mod text_bounds;
pub mod text_format;
pub mod text_format_range;
pub mod text_layout;
pub mod text_layout_group;
pub mod text_layout_measure;
pub mod text_layout_runtime;
pub mod text_line_breaks;
pub mod text_metrics;

// Re-export the complete public surface at the crate root.

// rich_text_content
pub use rich_text_content::{
    clear_rich_text_content, compute_rich_text_content, create_rich_text_content,
    get_rich_text_content,
};

// rich_text_metrics
pub use rich_text_metrics::{
    get_rich_text_bottom_scroll_v, get_rich_text_line_count, get_rich_text_max_scroll_h,
    get_rich_text_max_scroll_v, get_rich_text_scroll_y_offset, get_rich_text_text_height,
    get_rich_text_text_width,
};

// rich_text_query
pub use rich_text_query::{
    get_rich_text_char_boundaries, get_rich_text_char_index_at_point,
    get_rich_text_first_char_in_paragraph, get_rich_text_line_index_at_point,
    get_rich_text_line_index_of_char, get_rich_text_line_length, get_rich_text_line_metrics,
    get_rich_text_line_offset, get_rich_text_line_text, get_rich_text_link_at_point,
    get_rich_text_paragraph_length, get_rich_text_selection_rectangles,
};

// text_bounds
pub use text_bounds::{
    TEXT_BOUNDS_GUTTER, TextBoundsSpec, compute_text_bounds_height, compute_text_bounds_offset_x,
    compute_text_bounds_rectangle, compute_text_bounds_width,
};

// text_format
pub use text_format::{
    get_text_format_ascent, get_text_format_descent, get_text_format_height,
    get_text_format_leading, merge_text_format,
};

// text_format_range
pub use text_format_range::create_text_format_range;

// text_layout
pub use text_layout::{compute_text_layout, create_text_layout_result};

// text_layout_group
pub use text_layout_group::create_text_layout_group;

// text_layout_measure
pub use text_layout_measure::{get_text_layout_measure_provider, set_text_layout_measure_provider};

// text_layout_runtime
pub use text_layout_runtime::{clear_text_layout_result, get_text_layout_result};

// text_line_breaks
pub use text_line_breaks::{get_text_line_break_index, get_text_line_breaks};

// text_metrics
pub use text_metrics::{create_text_metrics, get_text_metrics};
