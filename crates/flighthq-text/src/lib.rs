//! `flighthq-text` — text display objects.
//!
//! Provides `TextLabel` (single-format) and `RichText` (multi-format / HTML)
//! display objects built on the `flighthq-textlayout` spine, plus `NativeText`
//! (platform-rendered, no layout spine). All three are analogous in shape to
//! display-object siblings such as `Bitmap` and `Shape`.

pub mod native_text;
pub mod rich_text;
pub mod text_label;
pub mod text_layout;

// Re-export the complete public surface at the crate root.

// native_text
pub use native_text::{
    NativeText, NativeTextRuntime, compute_native_text_local_bounds_rectangle, create_native_text,
    create_native_text_data, create_native_text_runtime, get_native_text_runtime, native_text_kind,
    set_native_text_auto_size, set_native_text_height, set_native_text_string,
    set_native_text_style, set_native_text_width,
};

// rich_text
pub use rich_text::{
    RichText, RichTextRuntime, build_rich_text_layout_params, clear_rich_text_format_ranges,
    compute_rich_text_local_bounds_rectangle, create_rich_text, create_rich_text_data,
    dispatch_rich_text_wheel, get_rich_text_input, get_rich_text_input_mut,
    get_rich_text_password_character, get_rich_text_runtime, get_rich_text_selection_begin_index,
    get_rich_text_selection_end_index, get_rich_text_text_layout, rich_text_kind,
    set_rich_text_format_range, set_rich_text_input, set_rich_text_scroll_h,
    set_rich_text_scroll_v, set_rich_text_selection_indices, set_rich_text_string,
};

// text_label
pub use text_label::{
    TextLabel, TextLabelRuntime, build_text_label_layout_params,
    compute_text_label_local_bounds_rectangle, create_text_label, create_text_label_data,
    create_text_label_runtime, get_text_label_runtime, set_text_label_auto_size,
    set_text_label_format, set_text_label_height, set_text_label_string, set_text_label_width,
    text_label_kind,
};

// text_layout
pub use text_layout::{
    TextLayoutCache, ensure_text_layout, get_text_layout, get_text_layout_metrics,
};
