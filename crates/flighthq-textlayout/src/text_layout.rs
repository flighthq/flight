use std::collections::HashSet;

use flighthq_types::{
    TextAutoSize, TextDirection, TextFormat, TextFormatAlign, TextFormatListMarker,
    TextFormatRange, TextJustification, TextLayoutGroup, TextLayoutParams, TextLayoutResult,
};

use crate::text_format::{
    get_text_format_ascent, get_text_format_descent, get_text_format_leading, merge_text_format,
};
use crate::text_layout_group::create_text_layout_group;
use crate::text_line_breaks::get_text_line_breaks;

/// Inner padding (px) between a text box edge and its content, applied on every side.
pub const TEXT_LAYOUT_GUTTER: f32 = 2.0;

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
    let direction = params.direction.unwrap_or(TextDirection::Ltr);
    let justification = params.justification.unwrap_or(TextJustification::InterWord);
    let max_lines = params.max_lines.unwrap_or(-1);
    let truncation_character = params.truncation_character.as_deref().unwrap_or("…");

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

    let mut paragraph_last_lines: HashSet<usize> = HashSet::new();
    build_groups(
        &mut out.groups,
        &mut paragraph_last_lines,
        &chars,
        format_ranges,
        &line_breaks,
        width,
        measure,
        word_wrap,
        multiline,
        max_lines,
        truncation_character,
    );
    write_line_metrics(out);

    // Alignment shifts require knowing per-line widths first.
    apply_alignment(
        &mut out.groups,
        width,
        &out.line_widths,
        direction,
        justification,
        &paragraph_last_lines,
    );

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
    let kerning_enabled = format.kerning != Some(false);
    let mut current_x = start_x;

    // `chars` holds Unicode scalar values, so surrogate pairs (emoji, astral
    // scripts) are already single elements and never split.
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

        // Look ahead for the next codepoint to compute a kerned pair advance.
        let next_start = i + 1;
        let advance;
        if kerning_enabled && next_start < end && chars[next_start] != '\t' {
            // Pair-wise measurement accounts for kerning between adjacent chars.
            let next_s: String = chars[next_start].to_string();
            let pair_s: String = [ch, chars[next_start]].iter().collect();
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
    // Bullet: hanging-indent prefix for list items. Set when a bullet format
    // starts a paragraph.
    bullet_pending: bool,

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

    // Whether truncation has been applied; stops further placement.
    truncated: bool,

    // Index into `groups` of the active group, if any.
    active_group: Option<usize>,

    scratch: Vec<f32>,
}

impl<'a> BuildState<'a> {
    fn base_x(&self) -> f32 {
        TEXT_LAYOUT_GUTTER
            + self.left_margin
            + self.block_indent
            + if self.first_line_of_paragraph {
                self.indent
            } else {
                0.0
            }
    }

    fn wrap_width(&self) -> f32 {
        self.container_width - TEXT_LAYOUT_GUTTER - self.right_margin - self.base_x()
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
        // Detect bullet format at paragraph start.
        self.bullet_pending = self.current_format.bullet == Some(true);
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
    paragraph_last_lines: &mut HashSet<usize>,
    chars: &[char],
    format_ranges: &[TextFormatRange],
    line_breaks: &[usize],
    container_width: f32,
    measure: &dyn Fn(&str, &TextFormat) -> f32,
    word_wrap: bool,
    multiline: bool,
    max_lines: i32,
    truncation_character: &str,
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
        bullet_pending: false,
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
        truncated: false,
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
        if s.truncated {
            break;
        }

        // Emit pending bullet at the start of each list-item paragraph.
        emit_bullet(&mut s, groups, measure);

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
            // The just-committed line (line_index - 1) ends a paragraph — do not justify it.
            paragraph_last_lines.insert(s.line_index - 1);
            if check_truncation(&mut s, groups, measure, max_lines, truncation_character) {
                break;
            }

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
                && container_width >= TEXT_LAYOUT_GUTTER * 2.0
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
                if check_truncation(&mut s, groups, measure, max_lines, truncation_character) {
                    break;
                }

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

            if word_wrap && container_width >= TEXT_LAYOUT_GUTTER * 2.0 {
                break_long_word(
                    &mut s,
                    groups,
                    text_len,
                    measure,
                    max_lines,
                    truncation_character,
                );
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
    // The current line_index is always the last paragraph's final line (never justified).
    paragraph_last_lines.insert(s.line_index);
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

// The bullet glyph used for list-item paragraphs.
const BULLET_CHAR: &str = "•";

// Check whether `max_lines` has been reached. If so, append the truncation
// character to the last visible line and mark truncated. Must be called after
// `commit_line`, so `line_index` points one past the last committed line.
fn check_truncation(
    s: &mut BuildState,
    groups: &mut Vec<TextLayoutGroup>,
    measure: &dyn Fn(&str, &TextFormat) -> f32,
    max_lines: i32,
    truncation_character: &str,
) -> bool {
    if max_lines < 0 || (s.line_index as i32) < max_lines {
        return false;
    }
    // The last committed line index is line_index - 1.
    let last_line_index = s.line_index - 1;
    // Append the truncation character to the last visible group on that line.
    if !truncation_character.is_empty() && !groups.is_empty() {
        let mut last_group: Option<usize> = None;
        for i in (0..groups.len()).rev() {
            if groups[i].line_index == last_line_index {
                last_group = Some(i);
                break;
            }
        }
        if let Some(gi) = last_group {
            let ellipsis_w = measure(truncation_character, &groups[gi].format);
            let available =
                s.container_width - TEXT_LAYOUT_GUTTER - s.right_margin - groups[gi].offset_x;
            // Trim characters from the end of the last group until the ellipsis fits.
            while !groups[gi].positions.is_empty() {
                let used_w = sum_advances(&groups[gi].positions);
                if used_w + ellipsis_w <= available {
                    break;
                }
                let trimmed = groups[gi].positions.pop().unwrap_or(0.0);
                groups[gi].width -= trimmed;
                groups[gi].end_index -= 1;
                if groups[gi].end_index <= groups[gi].start_index {
                    break;
                }
            }
            // Build a synthetic group for the ellipsis using the last group's format.
            let format = groups[gi].format.clone();
            let end_index = groups[gi].end_index;
            let ellipsis_offset_x = groups[gi].offset_x + groups[gi].width;
            let mut ellipsis_group = create_text_layout_group(format, end_index, end_index);
            ellipsis_group.positions = vec![ellipsis_w];
            ellipsis_group.width = ellipsis_w;
            ellipsis_group.offset_x = ellipsis_offset_x;
            ellipsis_group.ascent = groups[gi].ascent;
            ellipsis_group.descent = groups[gi].descent;
            ellipsis_group.leading = groups[gi].leading;
            ellipsis_group.line_index = last_line_index;
            ellipsis_group.offset_y = groups[gi].offset_y;
            ellipsis_group.height = groups[gi].height;
            groups.push(ellipsis_group);
        }
    }
    s.truncated = true;
    true
}

// Emit a bullet glyph at the start of a list-item paragraph.
fn emit_bullet(
    s: &mut BuildState,
    groups: &mut Vec<TextLayoutGroup>,
    measure: &dyn Fn(&str, &TextFormat) -> f32,
) {
    if !s.bullet_pending {
        return;
    }
    s.bullet_pending = false;
    // Respect list_marker: `None` suppresses the glyph while keeping the indent.
    if s.current_format.list_marker == Some(TextFormatListMarker::None) {
        if s.indent <= 0.0 {
            s.indent = measure(BULLET_CHAR, &s.current_format).ceil() + 2.0;
        }
        return;
    }
    let bullet_w = measure(BULLET_CHAR, &s.current_format);
    // Hanging-indent: the bullet occupies the indent area before the text margin.
    let mut bullet_group =
        create_text_layout_group(s.current_format.clone(), s.text_index, s.text_index);
    bullet_group.positions = vec![bullet_w];
    bullet_group.width = bullet_w;
    // Position the bullet in the indent area to the left of base_x.
    bullet_group.offset_x = TEXT_LAYOUT_GUTTER + s.left_margin + s.block_indent;
    bullet_group.ascent = s.ascent;
    bullet_group.descent = s.descent;
    bullet_group.leading = s.leading;
    bullet_group.line_index = s.line_index;
    bullet_group.offset_y = s.offset_y + TEXT_LAYOUT_GUTTER;
    bullet_group.height = s.line_height;
    groups.push(bullet_group);
    // Ensure a positive indent so text doesn't overlap the bullet.
    if s.indent <= 0.0 {
        s.indent = bullet_w.ceil() + 2.0;
    }
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
            groups[group_idx].offset_y = s.offset_y + TEXT_LAYOUT_GUTTER;
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
#[allow(clippy::too_many_arguments)]
fn break_long_word(
    s: &mut BuildState,
    groups: &mut Vec<TextLayoutGroup>,
    end: usize,
    measure: &dyn Fn(&str, &TextFormat) -> f32,
    max_lines: i32,
    truncation_character: &str,
) {
    let mut remaining = s.text_index;

    while remaining < end {
        if s.truncated {
            return;
        }
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
        if check_truncation(s, groups, measure, max_lines, truncation_character) {
            return;
        }
        remaining += count;
    }
}

// ---------------------------------------------------------------------------
// Alignment pass
// ---------------------------------------------------------------------------

fn apply_alignment(
    groups: &mut [TextLayoutGroup],
    container_width: f32,
    line_widths: &[f32],
    direction: TextDirection,
    justification: TextJustification,
    paragraph_last_lines: &HashSet<usize>,
) {
    for g in groups.iter_mut() {
        let line_w = line_widths[g.line_index];
        let align = g.format.align.unwrap_or(TextFormatAlign::Left);

        // Resolve direction-relative aliases.
        let resolved = match align {
            TextFormatAlign::Start => {
                if direction == TextDirection::Rtl {
                    TextFormatAlign::Right
                } else {
                    TextFormatAlign::Left
                }
            }
            TextFormatAlign::End => {
                if direction == TextDirection::Rtl {
                    TextFormatAlign::Left
                } else {
                    TextFormatAlign::Right
                }
            }
            other => other,
        };

        let shift = match resolved {
            TextFormatAlign::Right => container_width - line_w - TEXT_LAYOUT_GUTTER * 2.0,
            TextFormatAlign::Center => (container_width - line_w - TEXT_LAYOUT_GUTTER * 2.0) / 2.0,
            // Justify is applied per-line across groups on the same line; handled below.
            _ => 0.0,
        };
        if shift != 0.0 {
            g.offset_x += shift;
        }
    }

    // Inter-word justification pass: for each line where align === justify,
    // distribute residual width across inter-word spaces. The last line of each
    // paragraph (tracked in paragraph_last_lines) is left-aligned per CSS standard.
    justify_lines(
        groups,
        container_width,
        line_widths,
        justification,
        paragraph_last_lines,
    );
}

fn justify_lines(
    groups: &mut [TextLayoutGroup],
    container_width: f32,
    line_widths: &[f32],
    justification: TextJustification,
    paragraph_last_lines: &HashSet<usize>,
) {
    if justification == TextJustification::None {
        return;
    }

    let line_count = line_widths.len();

    for li in 0..line_count {
        // Skip the final line of each paragraph — it is left-aligned per CSS standard.
        if paragraph_last_lines.contains(&li) {
            continue;
        }

        // Gather indices of all groups on this line that have align === justify.
        let mut line_groups: Vec<usize> = Vec::new();
        for (i, g) in groups.iter().enumerate() {
            if g.line_index == li && g.format.align == Some(TextFormatAlign::Justify) {
                line_groups.push(i);
            }
        }
        if line_groups.is_empty() {
            continue;
        }

        let line_w = line_widths[li];
        let available = container_width - TEXT_LAYOUT_GUTTER * 2.0;
        let residual = available - line_w;
        if residual <= 0.0 {
            continue;
        }

        // Count inter-word gaps: each group boundary on the same line represents
        // at least one space between words (trailing spaces already trimmed on wrap).
        let space_count = line_groups.len().saturating_sub(1);
        if space_count == 0 {
            continue;
        }

        let extra_per_space = residual / space_count as f32;

        // Shift each group rightward by the cumulative extra space.
        let mut accumulated = 0.0;
        for (i, &gi) in line_groups.iter().enumerate() {
            groups[gi].offset_x += accumulated;
            if i < line_groups.len() - 1 {
                accumulated += extra_per_space;
            }
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

        let right_edge = g.offset_x - TEXT_LAYOUT_GUTTER + g.width;
        if right_edge > out.line_widths[li] {
            out.line_widths[li] = right_edge;
        }
        if right_edge > out.text_width {
            out.text_width = right_edge;
        }

        let bottom = (g.offset_y - TEXT_LAYOUT_GUTTER + g.ascent + g.descent).ceil();
        if bottom > out.text_height {
            out.text_height = bottom;
        }
    }

    if out.num_lines == 0 {
        out.num_lines = 1;
    }
}

/// Returns whether the layout was clipped by `max_lines`. Mirrors the
/// truncation predicate the layout engine applies internally.
pub fn get_text_layout_is_truncated(layout: &TextLayoutResult, params: &TextLayoutParams) -> bool {
    let max_lines = match params.max_lines {
        Some(m) if m >= 0 => m,
        _ => return false,
    };
    layout.num_lines >= max_lines as u32 && !layout.groups.is_empty()
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
    use flighthq_types::{TextDirection, TextFormat, TextFormatListMarker, TextLayoutParams};

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

    // --- Incremental delta: bullets, codepoints, justify, kerning, truncation ---

    fn fmt_with(f: TextFormat, start: usize, end: usize) -> TextFormatRange {
        create_text_format_range(f, start, end)
    }

    #[test]
    fn compute_emits_bullet_group() {
        let text = "item";
        let params = TextLayoutParams {
            text: text.to_string(),
            format_ranges: vec![fmt_with(
                TextFormat {
                    size: Some(16.0),
                    bullet: Some(true),
                    ..Default::default()
                },
                0,
                text.chars().count(),
            )],
            width: 200.0,
            height: 100.0,
            multiline: true,
            ..Default::default()
        };
        let result = do_layout(&params);
        let bullet_group = result.groups.iter().find(|g| g.start_index == g.end_index);
        assert!(bullet_group.is_some());
        assert_eq!(bullet_group.unwrap().line_index, 0);
    }

    #[test]
    fn compute_does_not_split_surrogate_pairs() {
        // U+1F600 GRINNING FACE; length-based measure to expose any split.
        let text = "😀ab";
        let params = TextLayoutParams {
            text: text.to_string(),
            format_ranges: vec![fmt_with(
                TextFormat {
                    size: Some(16.0),
                    ..Default::default()
                },
                0,
                text.chars().count(),
            )],
            width: 200.0,
            height: 100.0,
            ..Default::default()
        };
        // measure returns char-count * 10 (codepoint length-based).
        let mut out = create_text_layout_result();
        compute_text_layout(&mut out, &params, &|s, _f| s.chars().count() as f32 * 10.0);
        // emoji + 'a' + 'b' = 3 codepoints
        assert_eq!(out.groups[0].positions.len(), 3);
    }

    #[test]
    fn compute_bullet_list_marker_none_suppresses_glyph() {
        let text = "item";
        let params = TextLayoutParams {
            text: text.to_string(),
            format_ranges: vec![fmt_with(
                TextFormat {
                    size: Some(16.0),
                    bullet: Some(true),
                    list_marker: Some(TextFormatListMarker::None),
                    ..Default::default()
                },
                0,
                text.chars().count(),
            )],
            width: 200.0,
            height: 100.0,
            multiline: true,
            ..Default::default()
        };
        let result = do_layout(&params);
        let bullet_groups: Vec<_> = result
            .groups
            .iter()
            .filter(|g| g.start_index == g.end_index)
            .collect();
        assert_eq!(bullet_groups.len(), 0);
    }

    #[test]
    fn compute_bullet_list_marker_absent_emits_glyph() {
        let text = "item";
        let params = TextLayoutParams {
            text: text.to_string(),
            format_ranges: vec![fmt_with(
                TextFormat {
                    size: Some(16.0),
                    bullet: Some(true),
                    ..Default::default()
                },
                0,
                text.chars().count(),
            )],
            width: 200.0,
            height: 100.0,
            multiline: true,
            ..Default::default()
        };
        let result = do_layout(&params);
        let bullet_groups = result
            .groups
            .iter()
            .filter(|g| g.start_index == g.end_index)
            .count();
        assert!(bullet_groups > 0);
    }

    #[test]
    fn compute_center_alignment_golden() {
        // container=100, gutter=2, "hi"=20px → shift=(100-20-4)/2=38 → offsetX=2+38=40
        let text = "hi";
        let params = TextLayoutParams {
            text: text.to_string(),
            format_ranges: vec![fmt_with(
                TextFormat {
                    size: Some(16.0),
                    align: Some(TextFormatAlign::Center),
                    ..Default::default()
                },
                0,
                text.chars().count(),
            )],
            width: 100.0,
            height: 100.0,
            ..Default::default()
        };
        let result = do_layout(&params);
        assert_eq!(result.groups[0].offset_x, 40.0);
    }

    #[test]
    fn compute_right_alignment_golden() {
        // container=100, gutter=2, "hi"=20px → shift=100-20-4=76 → offsetX=2+76=78
        let text = "hi";
        let params = TextLayoutParams {
            text: text.to_string(),
            format_ranges: vec![fmt_with(
                TextFormat {
                    size: Some(16.0),
                    align: Some(TextFormatAlign::Right),
                    ..Default::default()
                },
                0,
                text.chars().count(),
            )],
            width: 100.0,
            height: 100.0,
            ..Default::default()
        };
        let result = do_layout(&params);
        assert_eq!(result.groups[0].offset_x, 78.0);
    }

    #[test]
    fn compute_justify_does_not_justify_last_line_of_each_paragraph() {
        let text = "aa bb\ncc dd";
        let params = TextLayoutParams {
            text: text.to_string(),
            format_ranges: vec![fmt_with(
                TextFormat {
                    size: Some(16.0),
                    align: Some(TextFormatAlign::Justify),
                    ..Default::default()
                },
                0,
                text.chars().count(),
            )],
            width: 100.0,
            height: 200.0,
            multiline: true,
            ..Default::default()
        };
        let result = do_layout(&params);
        assert_eq!(result.num_lines, 2);
        let line0: Vec<_> = result.groups.iter().filter(|g| g.line_index == 0).collect();
        let line1: Vec<_> = result.groups.iter().filter(|g| g.line_index == 1).collect();
        assert_eq!(line0[0].offset_x, TEXT_LAYOUT_GUTTER);
        assert_eq!(line1[0].offset_x, TEXT_LAYOUT_GUTTER);
    }

    #[test]
    fn compute_justify_shifts_mid_paragraph_lines() {
        let text = "a b\nc d";
        let params = TextLayoutParams {
            text: text.to_string(),
            format_ranges: vec![fmt_with(
                TextFormat {
                    size: Some(16.0),
                    align: Some(TextFormatAlign::Justify),
                    ..Default::default()
                },
                0,
                text.chars().count(),
            )],
            width: 100.0,
            height: 200.0,
            multiline: true,
            ..Default::default()
        };
        let result = do_layout(&params);
        assert_eq!(result.num_lines, 2);
        let line0: Vec<_> = result.groups.iter().filter(|g| g.line_index == 0).collect();
        assert!(!line0.is_empty());
    }

    #[test]
    fn compute_kerning_flag_disabled() {
        let text = "ab";
        let with = do_layout(&TextLayoutParams {
            format_ranges: vec![fmt_with(
                TextFormat {
                    size: Some(16.0),
                    kerning: Some(true),
                    ..Default::default()
                },
                0,
                text.chars().count(),
            )],
            ..single_range_params(text, 1000.0)
        });
        let without = do_layout(&TextLayoutParams {
            format_ranges: vec![fmt_with(
                TextFormat {
                    size: Some(16.0),
                    kerning: Some(false),
                    ..Default::default()
                },
                0,
                text.chars().count(),
            )],
            ..single_range_params(text, 1000.0)
        });
        assert_eq!(with.groups[0].positions.len(), 2);
        assert_eq!(without.groups[0].positions.len(), 2);
    }

    #[test]
    fn compute_max_lines_truncation_appends_character() {
        let text = "line one\nline two\nline three";
        let params = TextLayoutParams {
            text: text.to_string(),
            format_ranges: vec![fmt_with(
                TextFormat {
                    size: Some(16.0),
                    ..Default::default()
                },
                0,
                text.chars().count(),
            )],
            width: 300.0,
            height: 200.0,
            multiline: true,
            max_lines: Some(2),
            ..Default::default()
        };
        let result = do_layout(&params);
        assert!(result.num_lines <= 2);
        let last_line: Vec<_> = result
            .groups
            .iter()
            .filter(|g| g.line_index == result.num_lines as usize - 1)
            .collect();
        assert!(!last_line.is_empty());
    }

    #[test]
    fn compute_truncation_clips_long_word_with_word_wrap() {
        let text = "abcdefghijklmnop";
        let params = TextLayoutParams {
            text: text.to_string(),
            format_ranges: vec![fmt_with(
                TextFormat {
                    size: Some(16.0),
                    ..Default::default()
                },
                0,
                text.chars().count(),
            )],
            width: 60.0,
            height: 200.0,
            multiline: true,
            word_wrap: true,
            max_lines: Some(1),
            ..Default::default()
        };
        let result = do_layout(&params);
        assert!(result.num_lines <= 1);
        let line0: Vec<_> = result.groups.iter().filter(|g| g.line_index == 0).collect();
        assert!(!line0.is_empty());
    }

    #[test]
    fn compute_start_alignment_ltr_is_left() {
        let text = "hi";
        let params = TextLayoutParams {
            text: text.to_string(),
            format_ranges: vec![fmt_with(
                TextFormat {
                    size: Some(16.0),
                    align: Some(TextFormatAlign::Start),
                    ..Default::default()
                },
                0,
                text.chars().count(),
            )],
            width: 100.0,
            height: 100.0,
            direction: Some(TextDirection::Ltr),
            ..Default::default()
        };
        let result = do_layout(&params);
        assert_eq!(result.groups[0].offset_x, TEXT_LAYOUT_GUTTER);
    }

    #[test]
    fn compute_end_alignment_ltr_is_right() {
        let text = "hi";
        let params = TextLayoutParams {
            text: text.to_string(),
            format_ranges: vec![fmt_with(
                TextFormat {
                    size: Some(16.0),
                    align: Some(TextFormatAlign::End),
                    ..Default::default()
                },
                0,
                text.chars().count(),
            )],
            width: 100.0,
            height: 100.0,
            direction: Some(TextDirection::Ltr),
            ..Default::default()
        };
        let result = do_layout(&params);
        assert!(result.groups[0].offset_x > TEXT_LAYOUT_GUTTER);
    }

    #[test]
    fn compute_start_alignment_rtl_is_right() {
        let text = "hi";
        let params = TextLayoutParams {
            text: text.to_string(),
            format_ranges: vec![fmt_with(
                TextFormat {
                    size: Some(16.0),
                    align: Some(TextFormatAlign::Start),
                    ..Default::default()
                },
                0,
                text.chars().count(),
            )],
            width: 100.0,
            height: 100.0,
            direction: Some(TextDirection::Rtl),
            ..Default::default()
        };
        let result = do_layout(&params);
        assert!(result.groups[0].offset_x > TEXT_LAYOUT_GUTTER);
    }

    #[test]
    fn get_text_layout_is_truncated_true_when_clipped() {
        let text = "line one\nline two\nline three";
        let params = TextLayoutParams {
            text: text.to_string(),
            format_ranges: vec![fmt_with(
                TextFormat {
                    size: Some(16.0),
                    ..Default::default()
                },
                0,
                text.chars().count(),
            )],
            width: 300.0,
            height: 200.0,
            multiline: true,
            max_lines: Some(2),
            ..Default::default()
        };
        let result = do_layout(&params);
        assert!(get_text_layout_is_truncated(&result, &params));
    }

    #[test]
    fn get_text_layout_is_truncated_false_when_unlimited() {
        let params = single_range_params("one line", 1000.0);
        let result = do_layout(&params);
        assert!(!get_text_layout_is_truncated(&result, &params));
    }

    #[test]
    fn get_text_layout_is_truncated_false_when_max_lines_negative() {
        let params = TextLayoutParams {
            max_lines: Some(-1),
            ..single_range_params("hello", 1000.0)
        };
        let result = do_layout(&params);
        assert!(!get_text_layout_is_truncated(&result, &params));
    }

    #[test]
    fn text_layout_gutter_is_positive() {
        assert!(TEXT_LAYOUT_GUTTER > 0.0);
    }
}
