//! flight-compiler: root-only computeRichTextCharIndexAtPoint computeRichTextLineMetrics
//! flight-compiler: root-only getRichTextCharBoundaries getRichTextFirstCharInParagraph
//! flight-compiler: root-only getRichTextLineIndexAtPoint getRichTextLineIndexOfChar getRichTextLineLength
//! flight-compiler: root-only getRichTextLineOffset getRichTextLineText getRichTextLinkAtPoint
//! flight-compiler: root-only getRichTextParagraphLength getRichTextSelectionRectangles

use flight_geometry::Rectangle;

use crate::text_layout::TEXT_LAYOUT_GUTTER;
use crate::text_units::{js_max, js_min, utf16_slice};
use crate::types::{TextLayoutGroup, TextLayoutResult, TextLineMetrics, TextSelectionRectangle};

pub fn compute_rich_text_char_index_at_point(layout: &TextLayoutResult, x: f32, y: f32) -> usize {
    if layout.groups.is_empty() {
        return 0;
    }

    let mut closest_line_index = 0;
    let mut closest_distance = f32::INFINITY;
    let mut closest_line_bottom = 0.0;
    for index in 0..layout.line_heights.len() {
        let line_top = rich_text_get_line_offset_y(layout, index);
        let line_bottom = line_top + get_f32(&layout.line_heights, index, 0.0);
        let distance = if y < line_top {
            line_top - y
        } else if y > line_bottom {
            y - line_bottom
        } else {
            0.0
        };
        if distance < closest_distance {
            closest_distance = distance;
            closest_line_index = index;
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

    let mut line_start = if layout.groups.is_empty() {
        0
    } else {
        layout.groups[layout.groups.len() - 1].end_index
    };
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
            let mut group_x = group.offset_x;
            for (index, advance) in group.positions.iter().enumerate() {
                if x <= group_x + *advance / 2.0 {
                    return group.start_index + index;
                }
                group_x += *advance;
            }
            return group.end_index;
        }
    }

    return if line_end > 0 { line_end } else { line_start };
}

pub fn compute_rich_text_line_metrics(
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
        ascent = js_max(ascent, group.ascent);
        descent = js_max(descent, group.descent);
        leading = js_max(leading, group.leading);
        x = js_min(x, group.offset_x);
        right = js_max(right, group.offset_x + group.width);
    }

    if !found {
        return None;
    }
    return Some(TextLineMetrics {
        ascent,
        descent,
        height: get_f32(&layout.line_heights, line_index, ascent + descent + leading),
        leading,
        width: right - x,
        x: if x == f32::INFINITY { 0.0 } else { x },
    });
}

pub fn get_rich_text_char_boundaries(
    out: &mut Rectangle,
    layout: &TextLayoutResult,
    char_index: usize,
) -> bool {
    let Some(group) = rich_text_get_group_containing_index(layout, char_index) else {
        return false;
    };

    let mut x = group.offset_x;
    let limit = (char_index - group.start_index).min(group.positions.len());
    for index in 0..limit {
        x += get_f32(&group.positions, index, 0.0);
    }

    out.x = x;
    out.y = group.offset_y;
    out.width = get_f32(&group.positions, char_index - group.start_index, 0.0);
    out.height = group.height;
    return true;
}

pub fn get_rich_text_first_char_in_paragraph(text: &str, char_index: usize) -> usize {
    let units: Vec<u16> = text.encode_utf16().collect();
    let clamped = char_index.min(units.len());
    for index in (0..clamped).rev() {
        if units[index] == 0x000a {
            return index + 1;
        }
    }
    return 0;
}

pub fn get_rich_text_line_index_at_point(layout: &TextLayoutResult, y: f32) -> usize {
    let mut closest_line_index = 0;
    let mut closest_distance = f32::INFINITY;
    for index in 0..layout.line_heights.len() {
        let line_top = rich_text_get_line_offset_y(layout, index);
        let line_bottom = line_top + layout.line_heights[index];
        let distance = if y < line_top {
            line_top - y
        } else if y > line_bottom {
            y - line_bottom
        } else {
            0.0
        };
        if distance < closest_distance {
            closest_distance = distance;
            closest_line_index = index;
        }
    }
    return closest_line_index;
}

pub fn get_rich_text_line_index_of_char(layout: &TextLayoutResult, char_index: usize) -> usize {
    return rich_text_get_group_containing_index(layout, char_index)
        .map(|group| group.line_index)
        .unwrap_or(0);
}

pub fn get_rich_text_line_length(layout: &TextLayoutResult, line_index: usize) -> usize {
    let mut start = 0;
    let mut end = 0;
    let mut found = false;
    for group in &layout.groups {
        if group.line_index != line_index {
            continue;
        }
        if !found || group.start_index < start {
            start = group.start_index;
        }
        end = end.max(group.end_index);
        found = true;
    }
    return if found { end - start } else { 0 };
}

pub fn get_rich_text_line_offset(layout: &TextLayoutResult, line_index: usize) -> usize {
    for group in &layout.groups {
        if group.line_index == line_index {
            return group.start_index;
        }
    }
    return 0;
}

pub fn get_rich_text_line_text(text: &str, layout: &TextLayoutResult, line_index: usize) -> String {
    let mut start = 0;
    let mut end = 0;
    let mut found = false;
    for group in &layout.groups {
        if group.line_index != line_index {
            continue;
        }
        if !found || group.start_index < start {
            start = group.start_index;
        }
        end = end.max(group.end_index);
        found = true;
    }
    if !found {
        return String::new();
    }
    let units: Vec<u16> = text.encode_utf16().collect();
    return utf16_slice(&units, start.min(units.len()), end.min(units.len()));
}

pub fn get_rich_text_link_at_point(layout: &TextLayoutResult, x: f32, y: f32) -> Option<String> {
    for group in &layout.groups {
        let url = group.format.read().unwrap().url.clone();
        if url.is_none() {
            continue;
        }
        if x >= group.offset_x
            && x <= group.offset_x + group.width
            && y >= group.offset_y
            && y <= group.offset_y + group.height
        {
            return url;
        }
    }
    return None;
}

pub fn get_rich_text_paragraph_length(text: &str, char_index: usize) -> usize {
    let units: Vec<u16> = text.encode_utf16().collect();
    let start = get_rich_text_first_char_in_paragraph(text, char_index);
    let mut end = units.len();
    for (offset, unit) in units[start..].iter().enumerate() {
        if *unit == 0x000a {
            end = start + offset + 1;
            break;
        }
    }
    return end - start;
}

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
        let x = rich_text_get_caret_x(group, group_start);
        let right = rich_text_get_caret_x(group, group_end);
        out.push(TextSelectionRectangle {
            height: group.height,
            line_index: group.line_index,
            width: right - x,
            x,
            y: group.offset_y,
        });
    }
}

fn rich_text_get_caret_x(group: &TextLayoutGroup, index: usize) -> f32 {
    let mut x = group.offset_x;
    let limit = index.min(group.end_index).saturating_sub(group.start_index);
    for position_index in 0..limit {
        x += get_f32(&group.positions, position_index, 0.0);
    }
    return x;
}

fn rich_text_get_group_containing_index(
    layout: &TextLayoutResult,
    char_index: usize,
) -> Option<&TextLayoutGroup> {
    return layout
        .groups
        .iter()
        .find(|group| char_index >= group.start_index && char_index < group.end_index);
}

fn rich_text_get_line_offset_y(layout: &TextLayoutResult, line_index: usize) -> f32 {
    for group in &layout.groups {
        if group.line_index == line_index {
            return group.offset_y;
        }
    }
    let mut y = TEXT_LAYOUT_GUTTER;
    for index in 0..line_index {
        y += get_f32(&layout.line_heights, index, 0.0);
    }
    return y;
}

fn get_f32(values: &[f32], index: usize, fallback: f32) -> f32 {
    return if index < values.len() {
        values[index]
    } else {
        fallback
    };
}
