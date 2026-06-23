use flighthq_types::{
    TextAutoSize, TextFormat, TextFormatAlign, TextFormatRange, TextLayoutGroup, TextLayoutParams,
    TextLayoutResult,
};

use crate::text_format::{
    get_text_format_ascent, get_text_format_descent, get_text_format_leading, merge_text_format,
};
use crate::text_layout_group::create_text_layout_group;
use crate::text_line_breaks::get_text_line_breaks;

const GUTTER: f32 = 2.0;

/// Allocates an empty `TextLayoutResult`.
pub fn create_text_layout_result() -> TextLayoutResult {
    TextLayoutResult {
        groups: Vec::new(),
        line_ascents: Vec::new(),
        line_descents: Vec::new(),
        line_heights: Vec::new(),
        line_leadings: Vec::new(),
        line_widths: Vec::new(),
        num_lines: 0,
        text_height: 0.0,
        text_width: 0.0,
    }
}

/// Runs the layout engine over `params`, writing the result into `out`.
///
/// This computes glyph groups, per-line metrics, alignment shifts, and the
/// overall content size. `measure` is called to measure individual character
/// advances; it is supplied explicitly rather than read from a global provider
/// so layout stays a pure function of its inputs.
pub fn compute_text_layout(
    out: &mut TextLayoutResult,
    params: &TextLayoutParams,
    measure: &dyn Fn(&str, &TextFormat) -> f32,
) {
    let text = &params.text;
    let format_ranges = &params.format_ranges;
    let width = params.width;
    let word_wrap = params.word_wrap;
    let multiline = params.multiline;

    if text.is_empty() || format_ranges.is_empty() {
        out.groups.clear();
        out.line_ascents.clear();
        out.line_descents.clear();
        out.line_heights.clear();
        out.line_leadings.clear();
        out.line_widths.clear();
        out.num_lines = 1;
        out.text_height = 0.0;
        out.text_width = 0.0;
        return;
    }

    let chars: Vec<char> = text.chars().collect();

    let mut line_breaks: Vec<usize> = Vec::new();
    get_text_line_breaks(&mut line_breaks, text);
    // The line-break indices are byte offsets, but the layout works in char
    // indices. Convert via a byte->char map. Common cases (ASCII) coincide,
    // but the conversion keeps multibyte text correct.
    convert_byte_breaks_to_char(&mut line_breaks, text);

    build_groups(
        &mut out.groups,
        &chars,
        format_ranges,
        &line_breaks,
        width,
        measure,
        word_wrap,
        multiline,
    );
    write_line_metrics(out);

    // Alignment shifts require knowing per-line widths first.
    apply_alignment(&mut out.groups, width, &out.line_widths);

    // auto_size and border are intentionally not applied here — callers (scene
    // graph / renderer) own the node's width/height and apply the result.
    let _ = params.auto_size.unwrap_or(TextAutoSize::None);
    let _ = params.border;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Maps byte offsets in `line_breaks` to char indices for `text`.
fn convert_byte_breaks_to_char(line_breaks: &mut [usize], text: &str) {
    if text.is_ascii() {
        return;
    }
    for lb in line_breaks.iter_mut() {
        *lb = text[..*lb].chars().count();
    }
}

fn char_advances(
    out: &mut Vec<f32>,
    chars: &[char],
    format: &TextFormat,
    start: usize,
    end: usize,
    measure: &dyn Fn(&str, &TextFormat) -> f32,
    start_x: f32,
) {
    out.clear();
    let letter_spacing = format.letter_spacing.unwrap_or(0.0);
    let tab_stops = format.tab_stops.as_deref();
    let mut current_x = start_x;

    let mut i = start;
    while i < end {
        let ch = chars[i];

        if ch == '\t' {
            let advance = get_tab_advance(current_x, tab_stops, measure, format);
            out.push(advance);
            current_x += advance;
            i += 1;
            continue;
        }

        let advance;
        if i < chars.len() - 1 && chars[i + 1] != '\t' {
            // Pair-wise measurement accounts for kerning between adjacent chars.
            let next_s: String = chars[i + 1].to_string();
            let pair_s: String = chars[i..i + 2].iter().collect();
            let next_w = measure(&next_s, format);
            let pair_w = measure(&pair_s, format);
            advance = pair_w - next_w;
        } else {
            let single: String = ch.to_string();
            advance = measure(&single, format);
        }
        out.push(advance + letter_spacing);
        current_x += advance + letter_spacing;
        i += 1;
    }
}

fn get_tab_advance(
    current_x: f32,
    tab_stops: Option<&[f32]>,
    measure: &dyn Fn(&str, &TextFormat) -> f32,
    format: &TextFormat,
) -> f32 {
    if let Some(stops) = tab_stops {
        for &stop in stops {
            if stop > current_x {
                return stop - current_x;
            }
        }
    }
    // Default: advance to next multiple of 4 spaces.
    let space_w = measure("    ", format) / 4.0;
    let tab_w = space_w.max(1.0) * 4.0;
    tab_w - (current_x % tab_w)
}

fn sum_advances(positions: &[f32]) -> f32 {
    let mut total = 0.0;
    for &p in positions {
        total += p;
    }
    total
}

// ---------------------------------------------------------------------------
// Layout group construction
// ---------------------------------------------------------------------------

// Internal mutable state shared by the group-building loop. Mirrors the closure
// captures used in the TS implementation.
struct BuildState<'a> {
    chars: &'a [char],
    format_ranges: &'a [TextFormatRange],
    container_width: f32,

    range_index: usize,
    current_format: TextFormat,

    left_margin: f32,
    right_margin: f32,
    block_indent: f32,
    indent: f32,
    first_line_of_paragraph: bool,

    ascent: f32,
    descent: f32,
    leading: f32,
    line_height: f32,
    max_ascent: f32,
    max_line_height: f32,

    text_index: usize,
    line_index: usize,
    offset_x: f32,
    offset_y: f32,

    // Index into `groups` of the active group, if any.
    active_group: Option<usize>,

    scratch: Vec<f32>,
}

impl<'a> BuildState<'a> {
    fn base_x(&self) -> f32 {
        GUTTER
            + self.left_margin
            + self.block_indent
            + if self.first_line_of_paragraph {
                self.indent
            } else {
                0.0
            }
    }

    fn wrap_width(&self) -> f32 {
        self.container_width - GUTTER - self.right_margin - self.base_x()
    }

    fn update_line_metrics(&mut self) {
        self.ascent = get_text_format_ascent(&self.current_format);
        self.descent = get_text_format_descent(&self.current_format);
        self.leading = get_text_format_leading(&self.current_format);
        self.line_height = (self.ascent + self.descent + self.leading).ceil();
        if self.line_height > self.max_line_height {
            self.max_line_height = self.line_height;
        }
        if self.ascent > self.max_ascent {
            self.max_ascent = self.ascent;
        }
    }

    fn update_paragraph_metrics(&mut self) {
        self.first_line_of_paragraph = true;
        self.left_margin = self.current_format.left_margin.unwrap_or(0.0);
        self.right_margin = self.current_format.right_margin.unwrap_or(0.0);
        self.block_indent = self.current_format.block_indent.unwrap_or(0.0);
        self.indent = self.current_format.indent.unwrap_or(0.0);
    }

    fn advance_format_range(&mut self) -> bool {
        if self.range_index < self.format_ranges.len() - 1 {
            self.range_index += 1;
            self.current_format = merge_text_format(
                &self.current_format,
                &self.format_ranges[self.range_index].format,
            );
            true
        } else {
            false
        }
    }

    fn current_range(&self) -> &TextFormatRange {
        &self.format_ranges[self.range_index]
    }
}

#[allow(clippy::too_many_arguments)]
fn build_groups(
    groups: &mut Vec<TextLayoutGroup>,
    chars: &[char],
    format_ranges: &[TextFormatRange],
    line_breaks: &[usize],
    container_width: f32,
    measure: &dyn Fn(&str, &TextFormat) -> f32,
    word_wrap: bool,
    multiline: bool,
) {
    groups.clear();

    let first_format = format_ranges[0].format.clone();
    let mut s = BuildState {
        chars,
        format_ranges,
        container_width,
        range_index: 0,
        left_margin: first_format.left_margin.unwrap_or(0.0),
        right_margin: first_format.right_margin.unwrap_or(0.0),
        block_indent: first_format.block_indent.unwrap_or(0.0),
        indent: first_format.indent.unwrap_or(0.0),
        first_line_of_paragraph: true,
        ascent: 0.0,
        descent: 0.0,
        leading: 0.0,
        line_height: 0.0,
        max_ascent: 0.0,
        max_line_height: 0.0,
        text_index: 0,
        line_index: 0,
        offset_x: 0.0,
        offset_y: 0.0,
        active_group: None,
        current_format: first_format,
        scratch: Vec::new(),
    };

    s.ascent = get_text_format_ascent(&s.current_format);
    s.descent = get_text_format_descent(&s.current_format);
    s.leading = get_text_format_leading(&s.current_format);
    s.line_height = (s.ascent + s.descent + s.leading).ceil();
    s.max_ascent = s.ascent;
    s.max_line_height = s.line_height;

    let mut break_count = 0usize;
    let mut break_index: i64 = if !line_breaks.is_empty() {
        line_breaks[0] as i64
    } else {
        -1
    };
    let mut space_index: i64 = index_of_char(chars, ' ', 0);
    let mut prev_space_index: i64 = -2;

    s.update_line_metrics();
    s.update_paragraph_metrics();

    let text_len = chars.len();

    while s.text_index <= text_len {
        let has_break = break_index != -1;
        let break_before_space = has_break && (space_index == -1 || break_index <= space_index);

        if break_before_space {
            let bi = break_index as usize;
            let ti = s.text_index;
            if ti <= bi {
                place_span(&mut s, groups, ti, bi, measure);
                s.active_group = None;
            }

            commit_line(&mut s, groups);

            if !multiline {
                break;
            }

            s.text_index = bi + 1;
            break_count += 1;
            break_index = if break_count < line_breaks.len() {
                line_breaks[break_count] as i64
            } else {
                -1
            };
            space_index = index_of_char(chars, ' ', s.text_index);
            prev_space_index = -2;

            s.update_paragraph_metrics();
            s.update_line_metrics();
        } else if space_index != -1 {
            let si = space_index as usize;
            let word_end = si + 1;
            let seg_end = if has_break && (break_index as usize) < word_end {
                break_index as usize
            } else {
                word_end
            };

            let ti = s.text_index;
            let (seg_positions, seg_width) = measure_span(&mut s, ti, seg_end, measure);

            let mut should_wrap = word_wrap
                && container_width >= GUTTER * 2.0
                && s.offset_x + seg_width > s.wrap_width();

            // If the overrun is only due to the trailing space, don't wrap.
            if should_wrap && seg_end == word_end && !seg_positions.is_empty() {
                let trailing_space = seg_positions[seg_positions.len() - 1];
                if s.offset_x + seg_width - trailing_space <= s.wrap_width() {
                    should_wrap = false;
                }
            }

            if should_wrap {
                // Trim trailing space from the last group on the current line.
                let trim_target = s.active_group.or_else(|| {
                    if groups.is_empty() {
                        None
                    } else {
                        Some(groups.len() - 1)
                    }
                });
                if let Some(idx) = trim_target {
                    let g = &mut groups[idx];
                    if !g.positions.is_empty() && g.line_index == s.line_index {
                        let trailing_w = g.positions[g.positions.len() - 1];
                        g.width -= trailing_w;
                        g.end_index -= 1;
                    }
                }

                commit_line(&mut s, groups);

                // Skip leading space of the newly wrapped line.
                if s.text_index as i64 == prev_space_index + 1 {
                    s.text_index += 1;
                }
            }

            let ti = s.text_index;
            place_span(&mut s, groups, ti, seg_end, measure);
            prev_space_index = space_index;
            space_index = index_of_char(chars, ' ', word_end);
        } else {
            // No more spaces or breaks — place the remainder of the text.
            if s.text_index >= text_len {
                break;
            }

            if word_wrap && container_width >= GUTTER * 2.0 {
                break_long_word(&mut s, groups, text_len, measure);
            } else {
                let ti = s.text_index;
                place_span(&mut s, groups, ti, text_len, measure);
            }
            break;
        }
    }

    // Commit the final line.
    let line_index = s.line_index;
    let max_ascent = s.max_ascent;
    let max_line_height = s.max_line_height;
    for i in (0..groups.len()).rev() {
        if groups[i].line_index < line_index {
            break;
        }
        if max_ascent != 0.0 {
            groups[i].ascent = max_ascent;
        }
        if max_line_height != 0.0 {
            groups[i].height = max_line_height;
        }
    }
}

// Finalise the current line: set max ascent/height on all groups in it, then
// advance the pen to the next line.
fn commit_line(s: &mut BuildState, groups: &mut [TextLayoutGroup]) {
    let line_index = s.line_index;
    let max_ascent = s.max_ascent;
    let max_line_height = s.max_line_height;
    for i in (0..groups.len()).rev() {
        if groups[i].line_index < line_index {
            break;
        }
        groups[i].ascent = max_ascent;
        groups[i].height = max_line_height;
    }
    s.offset_y += s.max_line_height;
    s.max_ascent = 0.0;
    s.max_line_height = 0.0;
    s.line_index += 1;
    s.offset_x = 0.0;
    s.first_line_of_paragraph = false;
    s.active_group = None;
    s.update_line_metrics();
}

// Place a contiguous span [start, end) of text, respecting format range
// boundaries (may emit multiple groups if the span crosses a format change).
fn place_span(
    s: &mut BuildState,
    groups: &mut Vec<TextLayoutGroup>,
    start: usize,
    end: usize,
    measure: &dyn Fn(&str, &TextFormat) -> f32,
) {
    let mut idx = start;

    while idx < end {
        let range_end = end.min(s.current_range().end);

        if idx < range_end {
            // Reuse the active group if it is empty (start == end), else create.
            let reuse = match s.active_group {
                Some(gi) => groups[gi].start_index == groups[gi].end_index,
                None => false,
            };
            let group_idx = if reuse {
                let gi = s.active_group.expect("reuse implies an active group");
                groups[gi].format = s.current_range().format.clone();
                groups[gi].start_index = idx;
                groups[gi].end_index = range_end;
                gi
            } else {
                let g = create_text_layout_group(s.current_range().format.clone(), idx, range_end);
                groups.push(g);
                let gi = groups.len() - 1;
                s.active_group = Some(gi);
                gi
            };

            let base_x = s.base_x();
            let start_x = s.offset_x + base_x;
            let mut positions = std::mem::take(&mut groups[group_idx].positions);
            char_advances(
                &mut positions,
                s.chars,
                &s.current_format,
                idx,
                range_end,
                measure,
                start_x,
            );
            let span_width = sum_advances(&positions);
            groups[group_idx].positions = positions;
            groups[group_idx].offset_x = start_x;
            groups[group_idx].ascent = s.ascent;
            groups[group_idx].descent = s.descent;
            groups[group_idx].leading = s.leading;
            groups[group_idx].line_index = s.line_index;
            groups[group_idx].offset_y = s.offset_y + GUTTER;
            groups[group_idx].width = span_width;
            groups[group_idx].height = s.line_height;

            s.offset_x += span_width;
            idx = range_end;
        }

        if idx >= end {
            break;
        }

        if !s.advance_format_range() {
            break;
        }
        s.update_line_metrics();
    }

    s.text_index = end;

    // Step past exhausted format ranges so the next place_span call starts in
    // the right range.
    while s.text_index >= s.current_range().end && s.range_index < s.format_ranges.len() - 1 {
        s.advance_format_range();
        s.update_line_metrics();
    }
}

// Measure a span without placing it (saves/restores range state).
fn measure_span(
    s: &mut BuildState,
    start: usize,
    end: usize,
    measure: &dyn Fn(&str, &TextFormat) -> f32,
) -> (Vec<f32>, f32) {
    if start >= end {
        return (Vec::new(), 0.0);
    }

    let saved_range_index = s.range_index;
    let saved_format = s.current_format.clone();

    let mut idx = start;
    let mut all_positions: Vec<f32> = Vec::new();
    let base_x = s.base_x();

    while idx < end {
        let range_end = end.min(s.current_range().end);
        if idx < range_end {
            let start_x = s.offset_x + base_x + sum_advances(&all_positions);
            let mut scratch = std::mem::take(&mut s.scratch);
            char_advances(
                &mut scratch,
                s.chars,
                &s.current_format,
                idx,
                range_end,
                measure,
                start_x,
            );
            all_positions.extend_from_slice(&scratch);
            s.scratch = scratch;
            idx = range_end;
        }
        if idx >= end {
            break;
        }
        if !s.advance_format_range() {
            break;
        }
    }

    // Restore.
    s.range_index = saved_range_index;
    s.current_format = saved_format;

    let width = sum_advances(&all_positions);
    (all_positions, width)
}

// Break a run [text_index, end) across lines when word-wrap is active and the
// run is a single long word that exceeds the wrap width.
fn break_long_word(
    s: &mut BuildState,
    groups: &mut Vec<TextLayoutGroup>,
    end: usize,
    measure: &dyn Fn(&str, &TextFormat) -> f32,
) {
    let mut remaining = s.text_index;

    while remaining < end {
        let base_x = s.base_x();
        let start_x = s.offset_x + base_x;
        let mut scratch = std::mem::take(&mut s.scratch);
        char_advances(
            &mut scratch,
            s.chars,
            &s.current_format,
            remaining,
            end,
            measure,
            start_x,
        );
        let total_w = sum_advances(&scratch);

        if s.offset_x + total_w <= s.wrap_width() {
            s.scratch = scratch;
            place_span(s, groups, remaining, end, measure);
            return;
        }

        // Find the largest prefix that fits.
        let mut count = 0usize;
        let mut w = 0.0;
        while count < scratch.len() && s.offset_x + w + scratch[count] <= s.wrap_width() {
            w += scratch[count];
            count += 1;
        }
        if count == 0 {
            count = 1; // always place at least one character
        }
        s.scratch = scratch;

        place_span(s, groups, remaining, remaining + count, measure);
        commit_line(s, groups);
        remaining += count;
    }
}

// ---------------------------------------------------------------------------
// Alignment pass
// ---------------------------------------------------------------------------

fn apply_alignment(groups: &mut [TextLayoutGroup], container_width: f32, line_widths: &[f32]) {
    for g in groups.iter_mut() {
        let line_w = line_widths[g.line_index];
        let align = g.format.align.unwrap_or(TextFormatAlign::Left);
        let shift = match align {
            TextFormatAlign::Right => container_width - line_w - GUTTER * 2.0,
            TextFormatAlign::Center => (container_width - line_w - GUTTER * 2.0) / 2.0,
            _ => 0.0,
        };
        if shift != 0.0 {
            g.offset_x += shift;
        }
    }
}

// ---------------------------------------------------------------------------
// Line metrics pass
// ---------------------------------------------------------------------------

fn write_line_metrics(out: &mut TextLayoutResult) {
    out.line_ascents.clear();
    out.line_descents.clear();
    out.line_heights.clear();
    out.line_leadings.clear();
    out.line_widths.clear();
    out.text_width = 0.0;
    out.text_height = 0.0;
    out.num_lines = 0;

    for g in &out.groups {
        while g.line_index as u32 >= out.num_lines {
            out.line_ascents.push(0.0);
            out.line_descents.push(0.0);
            out.line_heights.push(0.0);
            out.line_leadings.push(0.0);
            out.line_widths.push(0.0);
            out.num_lines += 1;
        }

        let li = g.line_index;
        out.line_ascents[li] = out.line_ascents[li].max(g.ascent);
        out.line_descents[li] = out.line_descents[li].max(g.descent);
        out.line_heights[li] = out.line_heights[li].max(g.height);
        if g.leading > out.line_leadings[li] {
            out.line_leadings[li] = g.leading;
        }

        let right_edge = g.offset_x - GUTTER + g.width;
        if right_edge > out.line_widths[li] {
            out.line_widths[li] = right_edge;
        }
        if right_edge > out.text_width {
            out.text_width = right_edge;
        }

        let bottom = (g.offset_y - GUTTER + g.ascent + g.descent).ceil();
        if bottom > out.text_height {
            out.text_height = bottom;
        }
    }

    if out.num_lines == 0 {
        out.num_lines = 1;
    }
}

fn index_of_char(chars: &[char], target: char, from: usize) -> i64 {
    let mut i = from;
    while i < chars.len() {
        if chars[i] == target {
            return i as i64;
        }
        i += 1;
    }
    -1
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::text_format_range::create_text_format_range;
    use flighthq_types::{TextFormat, TextLayoutParams};

    // Fixed-width measure: every character is 10px regardless of font settings.
    fn fixed_measure(text: &str, _f: &TextFormat) -> f32 {
        text.chars().count() as f32 * 10.0
    }

    fn fmt() -> TextFormat {
        TextFormat {
            size: Some(16.0),
            ..Default::default()
        }
    }

    fn range(start: usize, end: usize) -> TextFormatRange {
        create_text_format_range(fmt(), start, end)
    }

    fn single_range_params(text: &str, width: f32) -> TextLayoutParams {
        TextLayoutParams {
            text: text.to_string(),
            format_ranges: vec![range(0, text.chars().count())],
            width,
            height: 100.0,
            ..Default::default()
        }
    }

    fn do_layout(params: &TextLayoutParams) -> TextLayoutResult {
        let mut out = create_text_layout_result();
        compute_text_layout(&mut out, params, &fixed_measure);
        out
    }

    #[test]
    fn create_text_layout_result_defaults() {
        let r = create_text_layout_result();
        assert_eq!(r.num_lines, 0);
        assert_eq!(r.text_width, 0.0);
        assert_eq!(r.text_height, 0.0);
        assert!(r.groups.is_empty());
    }

    #[test]
    fn create_text_layout_result_new_object() {
        let a = create_text_layout_result();
        let b = create_text_layout_result();
        // Distinct allocations; verify both are independent.
        assert_eq!(a.num_lines, b.num_lines);
    }

    #[test]
    fn compute_text_layout_empty_text() {
        let result = do_layout(&single_range_params("", 1000.0));
        assert_eq!(result.groups.len(), 0);
        assert_eq!(result.num_lines, 1);
    }

    #[test]
    fn compute_empty_format_ranges() {
        let params = TextLayoutParams {
            text: "hello".to_string(),
            format_ranges: vec![],
            width: 200.0,
            height: 100.0,
            ..Default::default()
        };
        let result = do_layout(&params);
        assert_eq!(result.groups.len(), 0);
    }

    #[test]
    fn compute_simple_text() {
        let result = do_layout(&single_range_params("hi", 1000.0));
        assert!(!result.groups.is_empty());
        assert!(result.num_lines > 0);
    }

    #[test]
    fn compute_single_group_for_simple_string() {
        let result = do_layout(&single_range_params("hello", 1000.0));
        assert_eq!(result.groups.len(), 1);
        assert_eq!(result.groups[0].start_index, 0);
        assert_eq!(result.groups[0].end_index, 5);
        assert_eq!(result.groups[0].line_index, 0);
    }

    #[test]
    fn compute_gutter_offset() {
        let result = do_layout(&single_range_params("hi", 1000.0));
        assert_eq!(result.groups[0].offset_x, 2.0);
        assert_eq!(result.groups[0].offset_y, 2.0);
    }

    #[test]
    fn compute_width_is_sum_of_advances() {
        let result = do_layout(&single_range_params("abc", 1000.0));
        assert!((result.groups[0].width - 30.0).abs() < 0.5);
    }

    #[test]
    fn compute_num_lines_single() {
        assert_eq!(
            do_layout(&single_range_params("hello", 1000.0)).num_lines,
            1
        );
    }

    #[test]
    fn compute_stores_positions() {
        let result = do_layout(&single_range_params("ab", 1000.0));
        assert_eq!(result.groups[0].positions.len(), 2);
    }

    #[test]
    fn compute_text_width_positive() {
        let result = do_layout(&single_range_params("hello", 1000.0));
        assert!(result.text_width > 0.0);
    }

    #[test]
    fn compute_text_height_positive() {
        let result = do_layout(&single_range_params("hello", 1000.0));
        assert!(result.text_height > 0.0);
    }

    #[test]
    fn compute_multiline_splits_on_lf() {
        let text = "ab\ncd";
        let params = TextLayoutParams {
            multiline: true,
            ..single_range_params(text, 1000.0)
        };
        let result = do_layout(&params);
        let lines: Vec<usize> = result.groups.iter().map(|g| g.line_index).collect();
        assert!(lines.contains(&0));
        assert!(lines.contains(&1));
        assert_eq!(result.num_lines, 2);
    }

    #[test]
    fn compute_no_split_when_not_multiline() {
        let text = "ab\ncd";
        let params = TextLayoutParams {
            multiline: false,
            ..single_range_params(text, 1000.0)
        };
        let result = do_layout(&params);
        assert_eq!(result.num_lines, 1);
    }

    #[test]
    fn compute_multiline_splits_on_cr() {
        let text = "ab\rcd";
        let params = TextLayoutParams {
            multiline: true,
            ..single_range_params(text, 1000.0)
        };
        let result = do_layout(&params);
        assert_eq!(result.num_lines, 2);
    }

    #[test]
    fn compute_multiple_consecutive_breaks() {
        let text = "a\n\nb";
        let params = TextLayoutParams {
            multiline: true,
            ..single_range_params(text, 1000.0)
        };
        let result = do_layout(&params);
        assert_eq!(result.num_lines, 3);
    }

    #[test]
    fn compute_line_widths_per_line() {
        let text = "ab\ncd";
        let params = TextLayoutParams {
            multiline: true,
            ..single_range_params(text, 1000.0)
        };
        let result = do_layout(&params);
        assert_eq!(result.line_widths.len(), 2);
    }

    #[test]
    fn compute_line_heights_per_line() {
        let text = "ab\ncd";
        let params = TextLayoutParams {
            multiline: true,
            ..single_range_params(text, 1000.0)
        };
        let result = do_layout(&params);
        assert_eq!(result.line_heights.len(), 2);
        for h in &result.line_heights {
            assert!(*h > 0.0);
        }
    }

    #[test]
    fn compute_multiple_format_ranges() {
        let text = "helloworld";
        let f16 = TextFormat {
            size: Some(16.0),
            ..Default::default()
        };
        let f24 = TextFormat {
            size: Some(24.0),
            ..Default::default()
        };
        let params = TextLayoutParams {
            text: text.to_string(),
            format_ranges: vec![
                create_text_format_range(f16, 0, 5),
                create_text_format_range(f24, 5, 10),
            ],
            width: 1000.0,
            height: 100.0,
            ..Default::default()
        };
        let result = do_layout(&params);
        assert!(result.groups.len() >= 2);
        assert_eq!(result.groups[0].format.size, Some(16.0));
        assert_eq!(result.groups[1].format.size, Some(24.0));
    }

    #[test]
    fn compute_center_alignment() {
        let text = "hi";
        let no_align = do_layout(&single_range_params(text, 100.0));
        let no_align_offset_x = no_align.groups[0].offset_x;

        let centered_fmt = TextFormat {
            size: Some(16.0),
            align: Some(TextFormatAlign::Center),
            ..Default::default()
        };
        let params = TextLayoutParams {
            text: text.to_string(),
            format_ranges: vec![create_text_format_range(centered_fmt, 0, text.len())],
            width: 100.0,
            height: 100.0,
            ..Default::default()
        };
        let aligned = do_layout(&params);
        assert!(aligned.groups[0].offset_x > no_align_offset_x);
    }

    #[test]
    fn compute_right_alignment() {
        let text = "hi";
        let right_fmt = TextFormat {
            size: Some(16.0),
            align: Some(TextFormatAlign::Right),
            ..Default::default()
        };
        let params = TextLayoutParams {
            text: text.to_string(),
            format_ranges: vec![create_text_format_range(right_fmt, 0, text.len())],
            width: 100.0,
            height: 100.0,
            ..Default::default()
        };
        let result = do_layout(&params);
        assert!(result.groups[0].offset_x > 2.0);
    }

    #[test]
    fn compute_word_wrap_at_boundary() {
        let text = "hello world";
        let params = TextLayoutParams {
            word_wrap: true,
            multiline: true,
            ..single_range_params(text, 50.0)
        };
        let result = do_layout(&params);
        let max_line = result.groups.iter().map(|g| g.line_index).max().unwrap();
        assert!(max_line >= 1);
    }

    #[test]
    fn compute_no_wrap_when_disabled() {
        let text = "hello world";
        let params = TextLayoutParams {
            word_wrap: false,
            ..single_range_params(text, 50.0)
        };
        let result = do_layout(&params);
        assert_eq!(result.num_lines, 1);
    }

    #[test]
    fn compute_breaks_long_word() {
        let text = "abcdefghij";
        let params = TextLayoutParams {
            word_wrap: true,
            multiline: true,
            ..single_range_params(text, 50.0)
        };
        let result = do_layout(&params);
        assert!(result.num_lines > 1);
    }
}
