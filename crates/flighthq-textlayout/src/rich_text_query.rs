use flighthq_types::{
    Rectangle, TextLayoutGroup, TextLayoutResult, TextLineMetrics, TextSelectionRectangle,
};

/// Fills `out` with the pixel bounds of the character at `char_index` within
/// the laid-out text. Returns `false` when `char_index` is out of range.
pub fn get_rich_text_char_boundaries(
    out: &mut Rectangle,
    _text: &str,
    layout: &TextLayoutResult,
    char_index: usize,
) -> bool {
    let group = match get_group_containing_index(layout, char_index) {
        Some(g) => g,
        None => return false,
    };

    let mut x = group.offset_x;
    let limit = (char_index - group.start_index).min(group.positions.len());
    for i in 0..limit {
        x += group.positions[i];
    }

    let char_width = group
        .positions
        .get(char_index - group.start_index)
        .copied()
        .unwrap_or(0.0);
    out.x = x;
    out.y = group.offset_y;
    out.width = char_width;
    out.height = group.height;
    true
}

/// Returns the character index closest to the pixel point `(x, y)`.
///
/// `_text` is unused — hit-testing is performed against layout group geometry.
/// Kept for backward compatibility; will be removed in a future breaking release.
pub fn get_rich_text_char_index_at_point(
    _text: &str,
    layout: &TextLayoutResult,
    x: f32,
    y: f32,
) -> usize {
    if layout.groups.is_empty() {
        return 0;
    }

    let mut closest_line_index: usize = 0;
    let mut closest_dist = f32::INFINITY;
    let mut closest_line_bottom = 0.0;
    for i in 0..layout.line_heights.len() {
        let line_top = get_line_offset_y(layout, i);
        let line_bottom = line_top + layout.line_heights[i];
        let dist = if y < line_top {
            line_top - y
        } else if y > line_bottom {
            y - line_bottom
        } else {
            0.0
        };
        if dist < closest_dist {
            closest_dist = dist;
            closest_line_index = i;
            closest_line_bottom = line_bottom;
        }
    }

    if y > closest_line_bottom {
        let mut line_end = 0;
        for group in &layout.groups {
            if group.line_index == closest_line_index {
                line_end = line_end.max(group.end_index);
            }
        }
        return line_end;
    }

    let mut line_start = layout.groups.last().map(|g| g.end_index).unwrap_or(0);
    let mut line_end = 0;
    for group in &layout.groups {
        if group.line_index != closest_line_index {
            continue;
        }
        line_start = line_start.min(group.start_index);
        line_end = line_end.max(group.end_index);
        if x <= group.offset_x {
            return group.start_index;
        }
        if x <= group.offset_x + group.width {
            let mut gx = group.offset_x;
            for (i, &advance) in group.positions.iter().enumerate() {
                if x <= gx + advance / 2.0 {
                    return group.start_index + i;
                }
                gx += advance;
            }
            return group.end_index;
        }
    }

    if line_end > 0 { line_end } else { line_start }
}

/// Returns the index of the first character in the paragraph that contains
/// `char_index`.
pub fn get_rich_text_first_char_in_paragraph(text: &str, char_index: usize) -> usize {
    let chars: Vec<char> = text.chars().collect();
    let clamped = char_index.min(chars.len());
    let mut i = clamped;
    while i > 0 {
        i -= 1;
        if chars[i] == '\n' {
            return i + 1;
        }
    }
    0
}

/// Returns the line index at the pixel Y coordinate `y`.
pub fn get_rich_text_line_index_at_point(layout: &TextLayoutResult, y: f32) -> usize {
    let mut closest_line_index: usize = 0;
    let mut closest_dist = f32::INFINITY;
    for i in 0..layout.line_heights.len() {
        let line_top = get_line_offset_y(layout, i);
        let line_bottom = line_top + layout.line_heights[i];
        let dist = if y < line_top {
            line_top - y
        } else if y > line_bottom {
            y - line_bottom
        } else {
            0.0
        };
        if dist < closest_dist {
            closest_dist = dist;
            closest_line_index = i;
        }
    }
    closest_line_index
}

/// Returns the line index that contains the character at `char_index`.
pub fn get_rich_text_line_index_of_char(layout: &TextLayoutResult, char_index: usize) -> usize {
    get_group_containing_index(layout, char_index)
        .map(|g| g.line_index)
        .unwrap_or(0)
}

/// Returns the number of characters on line `line_index`.
pub fn get_rich_text_line_length(layout: &TextLayoutResult, line_index: usize) -> usize {
    let mut start: Option<usize> = None;
    let mut end = 0;
    for group in &layout.groups {
        if group.line_index != line_index {
            continue;
        }
        start = Some(start.map_or(group.start_index, |s| s.min(group.start_index)));
        end = end.max(group.end_index);
    }
    match start {
        Some(s) => end - s,
        None => 0,
    }
}

/// Returns the metrics for line `line_index`, or `None` when the line does
/// not exist in the layout.
pub fn get_rich_text_line_metrics(
    layout: &TextLayoutResult,
    line_index: usize,
) -> Option<TextLineMetrics> {
    let mut ascent = 0.0;
    let mut descent = 0.0;
    let mut leading = 0.0;
    let mut x = f32::INFINITY;
    let mut right = 0.0;
    let mut found = false;

    for group in &layout.groups {
        if group.line_index != line_index {
            continue;
        }
        found = true;
        ascent = f32::max(ascent, group.ascent);
        descent = f32::max(descent, group.descent);
        leading = f32::max(leading, group.leading);
        x = f32::min(x, group.offset_x);
        right = f32::max(right, group.offset_x + group.width);
    }

    if !found {
        return None;
    }
    Some(TextLineMetrics {
        ascent,
        descent,
        height: layout
            .line_heights
            .get(line_index)
            .copied()
            .unwrap_or(ascent + descent + leading),
        leading,
        width: right - x,
        x: if x == f32::INFINITY { 0.0 } else { x },
    })
}

/// Returns the text-buffer index of the first character on `line_index`.
pub fn get_rich_text_line_offset(layout: &TextLayoutResult, line_index: usize) -> usize {
    for group in &layout.groups {
        if group.line_index == line_index {
            return group.start_index;
        }
    }
    0
}

/// Returns the substring of `text` that falls on `line_index`.
pub fn get_rich_text_line_text<'a>(
    text: &'a str,
    layout: &TextLayoutResult,
    line_index: usize,
) -> &'a str {
    let mut start: Option<usize> = None;
    let mut end = 0;
    for group in &layout.groups {
        if group.line_index != line_index {
            continue;
        }
        start = Some(start.map_or(group.start_index, |s| s.min(group.start_index)));
        end = end.max(group.end_index);
    }
    match start {
        Some(s) => char_slice(text, s, end),
        None => "",
    }
}

/// Returns the hyperlink URL hit-tested at pixel point `(x, y)`, or `None`
/// when no link is under the point.
pub fn get_rich_text_link_at_point(layout: &TextLayoutResult, x: f32, y: f32) -> Option<String> {
    for group in &layout.groups {
        let url = match &group.format.url {
            Some(u) if !u.is_empty() => u,
            _ => continue,
        };
        if x >= group.offset_x
            && x <= group.offset_x + group.width
            && y >= group.offset_y
            && y <= group.offset_y + group.height
        {
            return Some(url.clone());
        }
    }
    None
}

/// Returns the character length of the paragraph containing `char_index`,
/// including any trailing newline.
pub fn get_rich_text_paragraph_length(text: &str, char_index: usize) -> usize {
    let start = get_rich_text_first_char_in_paragraph(text, char_index);
    let chars: Vec<char> = text.chars().collect();
    let mut end = chars.len();
    for (i, &c) in chars.iter().enumerate().skip(start) {
        if c == '\n' {
            end = i + 1;
            break;
        }
    }
    end - start
}

/// Fills `out` with one `TextSelectionRectangle` per line that falls within
/// the character range `[begin_index, end_index)`.
pub fn get_rich_text_selection_rectangles(
    out: &mut Vec<TextSelectionRectangle>,
    begin_index: usize,
    end_index: usize,
    layout: &TextLayoutResult,
) {
    out.clear();
    if begin_index == end_index {
        return;
    }
    let start = begin_index.min(end_index);
    let end = begin_index.max(end_index);

    for group in &layout.groups {
        let group_start = start.max(group.start_index);
        let group_end = end.min(group.end_index);
        if group_start >= group_end {
            continue;
        }

        let x = get_caret_x(group, group_start);
        let right = get_caret_x(group, group_end);
        out.push(TextSelectionRectangle {
            height: group.height,
            line_index: group.line_index as u32,
            width: right - x,
            x,
            y: group.offset_y,
        });
    }
}

// Byte slice of `text` for the char range `[start_char, end_char)`.
fn char_slice(text: &str, start_char: usize, end_char: usize) -> &str {
    let mut byte_start = text.len();
    let mut byte_end = text.len();
    for (count, (byte_idx, _)) in text.char_indices().enumerate() {
        if count == start_char {
            byte_start = byte_idx;
        }
        if count == end_char {
            byte_end = byte_idx;
            break;
        }
    }
    if start_char >= end_char {
        return "";
    }
    &text[byte_start..byte_end]
}

fn get_caret_x(group: &TextLayoutGroup, index: usize) -> f32 {
    let mut x = group.offset_x;
    let limit = index.min(group.end_index).saturating_sub(group.start_index);
    for i in 0..limit {
        x += group.positions.get(i).copied().unwrap_or(0.0);
    }
    x
}

fn get_group_containing_index(
    layout: &TextLayoutResult,
    char_index: usize,
) -> Option<&TextLayoutGroup> {
    layout
        .groups
        .iter()
        .find(|g| char_index >= g.start_index && char_index < g.end_index)
}

fn get_line_offset_y(layout: &TextLayoutResult, line_index: usize) -> f32 {
    for group in &layout.groups {
        if group.line_index == line_index {
            return group.offset_y;
        }
    }
    let mut y = 2.0;
    for i in 0..line_index {
        y += layout.line_heights.get(i).copied().unwrap_or(0.0);
    }
    y
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::{TextFormat, TextLayoutGroup, TextLayoutResult};

    // Two-line layout: 'abc' on line 0 (0-3), 'defg' on line 1 (3-7).
    fn create_layout() -> TextLayoutResult {
        TextLayoutResult {
            groups: vec![
                TextLayoutGroup {
                    ascent: 10.0,
                    descent: 2.0,
                    end_index: 3,
                    format: TextFormat::default(),
                    height: 12.0,
                    leading: 0.0,
                    line_index: 0,
                    offset_x: 0.0,
                    offset_y: 2.0,
                    positions: vec![10.0, 10.0, 10.0],
                    start_index: 0,
                    width: 30.0,
                },
                TextLayoutGroup {
                    ascent: 10.0,
                    descent: 2.0,
                    end_index: 7,
                    format: TextFormat {
                        url: Some("https://example.com".to_string()),
                        ..Default::default()
                    },
                    height: 12.0,
                    leading: 0.0,
                    line_index: 1,
                    offset_x: 0.0,
                    offset_y: 16.0,
                    positions: vec![10.0, 10.0, 10.0, 10.0],
                    start_index: 3,
                    width: 40.0,
                },
            ],
            line_ascents: vec![10.0, 10.0],
            line_descents: vec![2.0, 2.0],
            line_heights: vec![14.0, 14.0],
            line_leadings: vec![0.0, 0.0],
            line_widths: vec![30.0, 40.0],
            num_lines: 2,
            text_height: 28.0,
            text_width: 40.0,
        }
    }

    #[test]
    fn get_rich_text_char_boundaries_fills() {
        let mut out = Rectangle::default();
        let found = get_rich_text_char_boundaries(&mut out, "abcdefg", &create_layout(), 1);
        assert!(found);
        assert_eq!(out.x, 10.0);
        assert_eq!(out.y, 2.0);
        assert_eq!(out.width, 10.0);
        assert_eq!(out.height, 12.0);
    }

    #[test]
    fn get_rich_text_char_boundaries_out_of_range() {
        let mut out = Rectangle::default();
        assert!(!get_rich_text_char_boundaries(
            &mut out,
            "",
            &create_layout(),
            99
        ));
    }

    #[test]
    fn get_rich_text_char_index_at_point_in_group() {
        assert_eq!(
            get_rich_text_char_index_at_point("abcdefg", &create_layout(), 25.0, 5.0),
            2
        );
    }

    #[test]
    fn get_rich_text_char_index_at_point_closest_line() {
        assert_eq!(
            get_rich_text_char_index_at_point("abcdefg", &create_layout(), 5.0, 100.0),
            7
        );
    }

    #[test]
    fn get_rich_text_char_index_at_point_empty_layout() {
        let layout = TextLayoutResult::default();
        assert_eq!(get_rich_text_char_index_at_point("", &layout, 0.0, 0.0), 0);
    }

    #[test]
    fn get_rich_text_first_char_in_paragraph_start() {
        assert_eq!(get_rich_text_first_char_in_paragraph("hello\nworld", 3), 0);
    }

    #[test]
    fn get_rich_text_first_char_in_paragraph_after_newline() {
        assert_eq!(get_rich_text_first_char_in_paragraph("hello\nworld", 8), 6);
    }

    #[test]
    fn get_rich_text_line_index_at_point_lines() {
        assert_eq!(get_rich_text_line_index_at_point(&create_layout(), 5.0), 0);
        assert_eq!(get_rich_text_line_index_at_point(&create_layout(), 18.0), 1);
    }

    #[test]
    fn get_rich_text_line_index_of_char_lines() {
        assert_eq!(get_rich_text_line_index_of_char(&create_layout(), 1), 0);
        assert_eq!(get_rich_text_line_index_of_char(&create_layout(), 5), 1);
    }

    #[test]
    fn get_rich_text_line_length_lines() {
        assert_eq!(get_rich_text_line_length(&create_layout(), 0), 3);
        assert_eq!(get_rich_text_line_length(&create_layout(), 1), 4);
        assert_eq!(get_rich_text_line_length(&create_layout(), 5), 0);
    }

    #[test]
    fn get_rich_text_line_metrics_valid() {
        let metrics = get_rich_text_line_metrics(&create_layout(), 0).unwrap();
        assert_eq!(metrics.ascent, 10.0);
        assert_eq!(metrics.descent, 2.0);
        assert_eq!(metrics.width, 30.0);
    }

    #[test]
    fn get_rich_text_line_metrics_missing() {
        assert!(get_rich_text_line_metrics(&create_layout(), 5).is_none());
    }

    #[test]
    fn get_rich_text_line_offset_lines() {
        assert_eq!(get_rich_text_line_offset(&create_layout(), 0), 0);
        assert_eq!(get_rich_text_line_offset(&create_layout(), 1), 3);
    }

    #[test]
    fn get_rich_text_line_text_lines() {
        assert_eq!(
            get_rich_text_line_text("abcdefg", &create_layout(), 0),
            "abc"
        );
        assert_eq!(
            get_rich_text_line_text("abcdefg", &create_layout(), 1),
            "defg"
        );
        assert_eq!(get_rich_text_line_text("abcdefg", &create_layout(), 5), "");
    }

    #[test]
    fn get_rich_text_link_at_point_hit() {
        assert_eq!(
            get_rich_text_link_at_point(&create_layout(), 10.0, 18.0),
            Some("https://example.com".to_string())
        );
    }

    #[test]
    fn get_rich_text_link_at_point_miss() {
        assert_eq!(
            get_rich_text_link_at_point(&create_layout(), 10.0, 5.0),
            None
        );
    }

    #[test]
    fn get_rich_text_paragraph_length_with_newline() {
        assert_eq!(get_rich_text_paragraph_length("hello\nworld", 3), 6);
    }

    #[test]
    fn get_rich_text_paragraph_length_no_trailing_newline() {
        assert_eq!(get_rich_text_paragraph_length("hello\nworld", 8), 5);
    }

    #[test]
    fn get_rich_text_selection_rectangles_intersected() {
        let mut out = Vec::new();
        get_rich_text_selection_rectangles(&mut out, 1, 5, &create_layout());
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].line_index, 0);
        assert_eq!(out[1].line_index, 1);
    }

    #[test]
    fn get_rich_text_selection_rectangles_collapsed() {
        let mut out = Vec::new();
        get_rich_text_selection_rectangles(&mut out, 2, 2, &create_layout());
        assert!(out.is_empty());
    }
}
