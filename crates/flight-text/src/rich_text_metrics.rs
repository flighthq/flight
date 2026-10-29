use flight_textlayout::{
    TEXT_BOUNDS_GUTTER, TextBoundsSpec, TextLayoutResult, compute_text_bounds_height,
    compute_text_bounds_width,
};

use crate::types::RichTextData;

fn bounds_spec(data: &RichTextData) -> TextBoundsSpec {
    return TextBoundsSpec {
        auto_size: data.auto_size,
        height: data.height,
        width: data.width,
        word_wrap: Some(data.word_wrap),
    };
}

// flight-lint: allow(conform-extra) D8 moved from textlayout to the approved text owner
pub fn compute_rich_text_bottom_scroll_v(data: &RichTextData, layout: &TextLayoutResult) -> f32 {
    return (layout.num_lines as f32)
        .min(data.scroll_v + get_visible_line_count(data, layout) - 1.0);
}

// flight-lint: allow(conform-extra) D8 moved from textlayout to the approved text owner
pub fn compute_rich_text_line_count(layout: &TextLayoutResult) -> usize {
    return layout.num_lines;
}

// flight-lint: allow(conform-extra) D8 moved from textlayout to the approved text owner
pub fn compute_rich_text_max_scroll_h(data: &RichTextData, layout: &TextLayoutResult) -> f32 {
    let visible_width =
        (compute_text_bounds_width(&bounds_spec(data), layout) - TEXT_BOUNDS_GUTTER * 2.0).max(0.0);
    return (layout.text_width - visible_width).ceil().max(0.0);
}

// flight-lint: allow(conform-extra) D8 moved from textlayout to the approved text owner
pub fn compute_rich_text_max_scroll_v(data: &RichTextData, layout: &TextLayoutResult) -> f32 {
    if layout.num_lines <= 1 {
        return 1.0;
    }
    return ((layout.num_lines as f32) - get_visible_line_count(data, layout) + 1.0).max(1.0);
}

// flight-lint: allow(conform-extra) D8 moved from textlayout to the approved text owner
pub fn compute_rich_text_text_height(layout: &TextLayoutResult) -> f32 {
    return layout.text_height.ceil();
}

// flight-lint: allow(conform-extra) D8 moved from textlayout to the approved text owner
pub fn compute_rich_text_text_width(layout: &TextLayoutResult) -> f32 {
    return layout.text_width.ceil();
}

// flight-lint: allow(conform-extra) D8 moved from textlayout to the approved text owner
pub fn get_rich_text_scroll_y_offset(line_heights: &[f32], first_visible_line: usize) -> f32 {
    let mut offset = 0.0;
    let end = first_visible_line.min(line_heights.len());
    for index in 0..end {
        offset += line_heights[index];
    }
    return offset;
}

fn get_visible_line_count(data: &RichTextData, layout: &TextLayoutResult) -> f32 {
    let visible_height = (compute_text_bounds_height(&bounds_spec(data), layout)
        - TEXT_BOUNDS_GUTTER * 2.0)
        .max(0.0);
    if visible_height == 0.0 {
        return 1.0;
    }
    let mut total = 0.0;
    let mut count = 0;
    for height in &layout.line_heights {
        if count > 0 && total + height > visible_height {
            break;
        }
        total += height;
        count += 1;
    }
    return (count as f32).max(1.0);
}
