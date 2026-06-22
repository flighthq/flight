use flighthq_types::{RichTextData, TextLayoutResult};

use crate::text_bounds::{
    TEXT_BOUNDS_GUTTER, TextBoundsSpec, compute_text_bounds_height, compute_text_bounds_width,
};

/// Returns the last visible 1-based line given the scroll position and the
/// computed layout.
pub fn get_rich_text_bottom_scroll_v(data: &RichTextData, layout: &TextLayoutResult) -> u32 {
    let bottom = data.scroll_v as u32 + get_visible_line_count(data, layout) - 1;
    layout.num_lines.min(bottom)
}

/// Returns the total number of lines in the laid-out text.
pub fn get_rich_text_line_count(layout: &TextLayoutResult) -> u32 {
    layout.num_lines
}

/// Returns the maximum horizontal scroll offset in pixels.
pub fn get_rich_text_max_scroll_h(data: &RichTextData, layout: &TextLayoutResult) -> f32 {
    let visible_width =
        (compute_text_bounds_width(&bounds_spec(data), layout) - TEXT_BOUNDS_GUTTER * 2.0).max(0.0);
    (layout.text_width - visible_width).ceil().max(0.0)
}

/// Returns the maximum 1-based vertical scroll position (line index).
pub fn get_rich_text_max_scroll_v(data: &RichTextData, layout: &TextLayoutResult) -> u32 {
    if layout.num_lines <= 1 {
        return 1;
    }
    (layout.num_lines + 1)
        .saturating_sub(get_visible_line_count(data, layout))
        .max(1)
}

/// Returns the pixel Y offset that corresponds to scrolling past
/// `first_visible_line` lines.
pub fn get_rich_text_scroll_y_offset(line_heights: &[f32], first_visible_line: u32) -> f32 {
    let limit = (first_visible_line as usize).min(line_heights.len());
    let mut offset = 0.0;
    for &h in &line_heights[..limit] {
        offset += h;
    }
    offset
}

/// Returns the ceil'd glyph height of the text content.
pub fn get_rich_text_text_height(layout: &TextLayoutResult) -> f32 {
    layout.text_height.ceil()
}

/// Returns the ceil'd glyph width of the text content.
pub fn get_rich_text_text_width(layout: &TextLayoutResult) -> f32 {
    layout.text_width.ceil()
}

fn bounds_spec(data: &RichTextData) -> TextBoundsSpec {
    TextBoundsSpec {
        auto_size: data.auto_size,
        height: data.height,
        width: data.width,
        word_wrap: data.word_wrap,
    }
}

fn get_visible_line_count(data: &RichTextData, layout: &TextLayoutResult) -> u32 {
    let visible_height = (compute_text_bounds_height(&bounds_spec(data), layout)
        - TEXT_BOUNDS_GUTTER * 2.0)
        .max(0.0);
    if visible_height == 0.0 {
        return 1;
    }

    let mut total = 0.0;
    let mut count: u32 = 0;
    for &height in &layout.line_heights {
        if count > 0 && total + height > visible_height {
            break;
        }
        total += height;
        count += 1;
    }
    count.max(1)
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::{RichTextData, TextLayoutResult};

    fn create_data() -> RichTextData {
        RichTextData {
            height: 100.0,
            scroll_v: 1.0,
            width: 200.0,
            ..Default::default()
        }
    }

    fn create_layout() -> TextLayoutResult {
        TextLayoutResult {
            num_lines: 1,
            text_height: 20.0,
            text_width: 50.0,
            ..Default::default()
        }
    }

    #[test]
    fn get_rich_text_bottom_scroll_v_last_visible() {
        let data = RichTextData {
            height: 34.0,
            scroll_v: 2.0,
            ..create_data()
        };
        let layout = TextLayoutResult {
            line_heights: vec![10.0, 10.0, 10.0, 10.0],
            num_lines: 4,
            ..create_layout()
        };
        assert_eq!(get_rich_text_bottom_scroll_v(&data, &layout), 4);
    }

    #[test]
    fn get_rich_text_bottom_scroll_v_clamps() {
        let data = RichTextData {
            height: 80.0,
            scroll_v: 2.0,
            ..create_data()
        };
        let layout = TextLayoutResult {
            line_heights: vec![10.0, 10.0, 10.0],
            num_lines: 3,
            ..create_layout()
        };
        assert_eq!(get_rich_text_bottom_scroll_v(&data, &layout), 3);
    }

    #[test]
    fn get_rich_text_line_count_empty() {
        let layout = TextLayoutResult {
            num_lines: 3,
            ..create_layout()
        };
        assert_eq!(get_rich_text_line_count(&layout), 3);
    }

    #[test]
    fn get_rich_text_max_scroll_h_overflow() {
        let data = RichTextData {
            width: 54.0,
            ..create_data()
        };
        let layout = TextLayoutResult {
            text_width: 80.0,
            ..create_layout()
        };
        assert_eq!(get_rich_text_max_scroll_h(&data, &layout), 30.0);
    }

    #[test]
    fn get_rich_text_max_scroll_h_fits() {
        let data = RichTextData {
            width: 100.0,
            ..create_data()
        };
        let layout = TextLayoutResult {
            text_width: 50.0,
            ..create_layout()
        };
        assert_eq!(get_rich_text_max_scroll_h(&data, &layout), 0.0);
    }

    #[test]
    fn get_rich_text_max_scroll_v_final_visible() {
        let data = RichTextData {
            height: 34.0,
            ..create_data()
        };
        let layout = TextLayoutResult {
            line_heights: vec![10.0, 10.0, 10.0, 10.0],
            num_lines: 4,
            ..create_layout()
        };
        assert_eq!(get_rich_text_max_scroll_v(&data, &layout), 2);
    }

    #[test]
    fn get_rich_text_max_scroll_v_single_line() {
        let layout = TextLayoutResult {
            num_lines: 1,
            ..create_layout()
        };
        assert_eq!(get_rich_text_max_scroll_v(&create_data(), &layout), 1);
    }

    #[test]
    fn get_rich_text_scroll_y_offset_zero() {
        assert_eq!(get_rich_text_scroll_y_offset(&[10.0, 12.0, 14.0], 0), 0.0);
    }

    #[test]
    fn get_rich_text_scroll_y_offset_sum() {
        assert_eq!(get_rich_text_scroll_y_offset(&[10.0, 12.0, 14.0], 2), 22.0);
    }

    #[test]
    fn get_rich_text_scroll_y_offset_clamps() {
        assert_eq!(get_rich_text_scroll_y_offset(&[10.0, 12.0], 5), 22.0);
    }

    #[test]
    fn get_rich_text_text_height_ceil() {
        let layout = TextLayoutResult {
            text_height: 12.2,
            ..create_layout()
        };
        assert_eq!(get_rich_text_text_height(&layout), 13.0);
    }

    #[test]
    fn get_rich_text_text_width_ceil() {
        let layout = TextLayoutResult {
            text_width: 21.1,
            ..create_layout()
        };
        assert_eq!(get_rich_text_text_width(&layout), 22.0);
    }
}
