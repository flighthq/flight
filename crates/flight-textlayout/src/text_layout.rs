use std::collections::HashSet;
use std::sync::{Arc, RwLock};

use flight_entity::allocate_entity;
use flight_textformat::{
    TextFormat, TextFormatAlign, TextFormatListMarker, TextFormatRange, get_text_format_ascent,
    get_text_format_descent, get_text_format_leading, merge_text_format,
};
use flight_textshaper::{TextDirection, TextMeasureFunction};

use crate::text_layout_group::create_text_layout_group;
use crate::text_line_breaks::get_text_line_breaks;
use crate::text_units::{js_max, utf16_code_point_len, utf16_slice};
use crate::types::{
    TextJustification, TextLayoutGroup, TextLayoutParams, TextLayoutResult, TextVerticalAlign,
};

pub const TEXT_LAYOUT_GUTTER: f32 = 2.0;

struct LayoutBuilder<'a> {
    groups: &'a mut Vec<TextLayoutGroup>,
    paragraph_last_lines: &'a mut HashSet<usize>,
    text: &'a [u16],
    format_ranges: &'a [TextFormatRange],
    line_breaks: &'a [usize],
    container_width: f32,
    measure: &'a TextMeasureFunction,
    word_wrap: bool,
    multiline: bool,
    max_lines: i32,
    truncation_character: &'a str,
    range_index: usize,
    current_format: TextFormat,
    left_margin: f32,
    right_margin: f32,
    block_indent: f32,
    indent: f32,
    first_line_of_paragraph: bool,
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
    truncated: bool,
    break_count: usize,
    break_index: Option<usize>,
    space_index: Option<usize>,
    active_group: Option<usize>,
}

pub fn create_text_layout_result() -> TextLayoutResult {
    let mut out: TextLayoutResult = allocate_entity();
    initialize_text_layout_result(&mut out);
    return out;
}

pub fn initialize_text_layout_result(out: &mut TextLayoutResult) {
    out.groups.clear();
    out.line_ascents.clear();
    out.line_descents.clear();
    out.line_heights.clear();
    out.line_leadings.clear();
    out.line_widths.clear();
    out.num_lines = 0;
    out.text_height = 0.0;
    out.text_width = 0.0;
}

fn apply_alignment(
    groups: &mut [TextLayoutGroup],
    container_width: f32,
    line_widths: &[f32],
    direction: TextDirection,
    justification: TextJustification,
    paragraph_last_lines: &HashSet<usize>,
    text: &[u16],
) {
    for group in groups.iter_mut() {
        let line_width = line_widths.get(group.line_index).copied().unwrap_or(0.0);
        let align = group
            .format
            .read()
            .unwrap()
            .align
            .unwrap_or(TextFormatAlign::Left);
        let resolved = match align {
            TextFormatAlign::Start => {
                if direction == TextDirection::RightToLeft {
                    TextFormatAlign::Right
                } else {
                    TextFormatAlign::Left
                }
            }
            TextFormatAlign::End => {
                if direction == TextDirection::RightToLeft {
                    TextFormatAlign::Left
                } else {
                    TextFormatAlign::Right
                }
            }
            _ => align,
        };
        let shift = match resolved {
            TextFormatAlign::Right => container_width - line_width - TEXT_LAYOUT_GUTTER * 2.0,
            TextFormatAlign::Center => {
                (container_width - line_width - TEXT_LAYOUT_GUTTER * 2.0) / 2.0
            }
            _ => 0.0,
        };
        if shift != 0.0 {
            group.offset_x += shift;
        }
    }

    justify_lines(
        groups,
        container_width,
        line_widths,
        justification,
        paragraph_last_lines,
        text,
    );
}

fn apply_vertical_alignment(
    groups: &mut [TextLayoutGroup],
    container_height: f32,
    content_height: f32,
    vertical_align: TextVerticalAlign,
) {
    if vertical_align == TextVerticalAlign::Top {
        return;
    }
    let slack = container_height - (content_height + TEXT_LAYOUT_GUTTER * 2.0);
    if slack <= 0.0 {
        return;
    }
    let shift = if vertical_align == TextVerticalAlign::Middle {
        slack / 2.0
    } else {
        slack
    };
    for group in groups {
        group.offset_y += shift;
    }
}

fn char_advances(
    out: &mut Vec<f32>,
    text: &[u16],
    format: &TextFormat,
    start: usize,
    end: usize,
    measure: &TextMeasureFunction,
    start_x: f32,
) {
    out.clear();
    let letter_spacing = format.letter_spacing.unwrap_or(0.0);
    let tab_stops = format.tab_stops.as_deref();
    let kerning_enabled = format.kerning != Some(false);
    let mut current_x = start_x;
    let mut index = start;
    while index < end {
        let char_length = utf16_code_point_len(text, index).min(end - index);
        let character = utf16_slice(text, index, index + char_length);
        if character == "\t" {
            let advance = get_tab_advance(current_x, tab_stops, measure, format);
            out.push(advance);
            current_x += advance;
            index += char_length;
            continue;
        }

        let next_start = index + char_length;
        let advance = if kerning_enabled && next_start < end && text[next_start] != 0x0009 {
            let next_length = utf16_code_point_len(text, next_start).min(end - next_start);
            let next_character = utf16_slice(text, next_start, next_start + next_length);
            let next_width = measure(&next_character, format);
            let pair = format!("{character}{next_character}");
            measure(&pair, format) - next_width
        } else {
            measure(&character, format)
        };
        out.push(advance + letter_spacing);
        current_x += advance + letter_spacing;
        index += char_length;
    }
}

pub fn compute_text_layout(out: &mut TextLayoutResult, params: &TextLayoutParams) {
    if params.text.is_empty() || params.format_ranges.is_empty() {
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

    let text: Vec<u16> = params.text.encode_utf16().collect();
    let mut line_breaks = Vec::new();
    get_text_line_breaks(&mut line_breaks, &params.text);
    let mut paragraph_last_lines = HashSet::new();
    let truncation_character = params.truncation_character.as_deref().unwrap_or("…");
    {
        let mut builder = LayoutBuilder::new(
            &mut out.groups,
            &mut paragraph_last_lines,
            &text,
            &params.format_ranges,
            &line_breaks,
            params.width,
            &params.measure,
            params.word_wrap.unwrap_or(false),
            params.multiline.unwrap_or(false),
            params.max_lines.unwrap_or(-1),
            truncation_character,
        );
        builder.build();
    }
    let groups = std::mem::take(&mut out.groups);
    write_line_metrics(out, &groups);
    out.groups = groups;

    apply_alignment(
        &mut out.groups,
        params.width,
        &out.line_widths,
        params.direction.unwrap_or(TextDirection::LeftToRight),
        params.justification.unwrap_or(TextJustification::InterWord),
        &paragraph_last_lines,
        &text,
    );
    apply_vertical_alignment(
        &mut out.groups,
        params.height,
        out.text_height,
        params.vertical_align.unwrap_or(TextVerticalAlign::Top),
    );

    let _ = params.auto_size;
    let _ = params.border;
}

fn get_tab_advance(
    current_x: f32,
    tab_stops: Option<&[f32]>,
    measure: &TextMeasureFunction,
    format: &TextFormat,
) -> f32 {
    if let Some(tab_stops) = tab_stops {
        for stop in tab_stops {
            if *stop > current_x {
                return *stop - current_x;
            }
        }
    }
    let space_width = measure("    ", format) / 4.0;
    let tab_width = js_max(space_width, 1.0) * 4.0;
    return tab_width - (current_x % tab_width);
}

pub fn is_text_layout_truncated(layout: &TextLayoutResult, params: &TextLayoutParams) -> bool {
    let Some(max_lines) = params.max_lines else {
        return false;
    };
    if max_lines < 0 {
        return false;
    }
    return layout.num_lines >= max_lines as usize && !layout.groups.is_empty();
}

fn justify_lines(
    groups: &mut [TextLayoutGroup],
    container_width: f32,
    line_widths: &[f32],
    justification: TextJustification,
    paragraph_last_lines: &HashSet<usize>,
    text: &[u16],
) {
    if justification == TextJustification::None {
        return;
    }

    for (line_index, line_width) in line_widths.iter().enumerate() {
        if paragraph_last_lines.contains(&line_index) {
            continue;
        }
        let line_groups: Vec<usize> = groups
            .iter()
            .enumerate()
            .filter_map(|(index, group)| {
                let align = group.format.read().unwrap().align;
                (group.line_index == line_index && align == Some(TextFormatAlign::Justify))
                    .then_some(index)
            })
            .collect();
        if line_groups.is_empty() {
            continue;
        }

        let available = container_width - TEXT_LAYOUT_GUTTER * 2.0;
        let residual = available - *line_width;
        if residual <= 0.0 {
            continue;
        }

        if justification == TextJustification::InterCharacter {
            let character_count: usize = line_groups
                .iter()
                .map(|index| groups[*index].positions.len())
                .sum();
            let gap_count = character_count.saturating_sub(1);
            if gap_count == 0 {
                continue;
            }
            let extra_per_gap = residual / gap_count as f32;
            let last_group = *line_groups.last().unwrap();
            let mut accumulated = 0.0;
            for group_index in &line_groups {
                let group = &mut groups[*group_index];
                group.offset_x += accumulated;
                let last_position = if *group_index == last_group {
                    group.positions.len().saturating_sub(1)
                } else {
                    group.positions.len()
                };
                let mut group_extra = 0.0;
                for position in group.positions.iter_mut().take(last_position) {
                    *position += extra_per_gap;
                    accumulated += extra_per_gap;
                    group_extra += extra_per_gap;
                }
                group.width += group_extra;
            }
        } else {
            let mut space_count = 0;
            for group_index in &line_groups {
                let group = &groups[*group_index];
                let mut text_index = group.start_index;
                for _ in 0..group.positions.len() {
                    if text_index >= group.end_index || text_index >= text.len() {
                        break;
                    }
                    if text[text_index] == 0x0020 {
                        space_count += 1;
                    }
                    text_index += utf16_code_point_len(text, text_index);
                }
            }
            if space_count == 0 {
                continue;
            }
            let extra_per_space = residual / space_count as f32;
            let mut accumulated = 0.0;
            for group_index in &line_groups {
                let group = &mut groups[*group_index];
                group.offset_x += accumulated;
                let mut group_extra = 0.0;
                let mut text_index = group.start_index;
                for position in &mut group.positions {
                    if text_index >= group.end_index || text_index >= text.len() {
                        break;
                    }
                    if text[text_index] == 0x0020 {
                        *position += extra_per_space;
                        accumulated += extra_per_space;
                        group_extra += extra_per_space;
                    }
                    text_index += utf16_code_point_len(text, text_index);
                }
                group.width += group_extra;
            }
        }
    }
}

fn sum_advances(positions: &[f32]) -> f32 {
    let mut total = 0.0;
    for position in positions {
        total += *position;
    }
    return total;
}

fn write_line_metrics(out: &mut TextLayoutResult, groups: &[TextLayoutGroup]) {
    out.line_ascents.clear();
    out.line_descents.clear();
    out.line_heights.clear();
    out.line_leadings.clear();
    out.line_widths.clear();
    out.text_width = 0.0;
    out.text_height = 0.0;
    out.num_lines = 0;

    for group in groups {
        while group.line_index >= out.num_lines {
            out.line_ascents.push(0.0);
            out.line_descents.push(0.0);
            out.line_heights.push(0.0);
            out.line_leadings.push(0.0);
            out.line_widths.push(0.0);
            out.num_lines += 1;
        }
        let line_index = group.line_index;
        out.line_ascents[line_index] = js_max(out.line_ascents[line_index], group.ascent);
        out.line_descents[line_index] = js_max(out.line_descents[line_index], group.descent);
        out.line_heights[line_index] = js_max(out.line_heights[line_index], group.height);
        if group.leading > out.line_leadings[line_index] {
            out.line_leadings[line_index] = group.leading;
        }

        let right_edge = group.offset_x - TEXT_LAYOUT_GUTTER + group.width;
        if right_edge > out.line_widths[line_index] {
            out.line_widths[line_index] = right_edge;
        }
        if right_edge > out.text_width {
            out.text_width = right_edge;
        }

        let bottom = (group.offset_y - TEXT_LAYOUT_GUTTER + group.ascent + group.descent).ceil();
        if bottom > out.text_height {
            out.text_height = bottom;
        }
    }
    if out.num_lines == 0 {
        out.num_lines = 1;
    }
}

// flight-lint: allow(sugar-delegates) private builder methods carry the pinned source closure's mutable layout algorithm state and are not public D18 method sugar
impl<'a> LayoutBuilder<'a> {
    fn new(
        groups: &'a mut Vec<TextLayoutGroup>,
        paragraph_last_lines: &'a mut HashSet<usize>,
        text: &'a [u16],
        format_ranges: &'a [TextFormatRange],
        line_breaks: &'a [usize],
        container_width: f32,
        measure: &'a TextMeasureFunction,
        word_wrap: bool,
        multiline: bool,
        max_lines: i32,
        truncation_character: &'a str,
    ) -> Self {
        let current_format = format_ranges[0].format.read().unwrap().clone();
        return LayoutBuilder {
            groups,
            paragraph_last_lines,
            text,
            format_ranges,
            line_breaks,
            container_width,
            measure,
            word_wrap,
            multiline,
            max_lines,
            truncation_character,
            range_index: 0,
            current_format,
            left_margin: 0.0,
            right_margin: 0.0,
            block_indent: 0.0,
            indent: 0.0,
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
            break_count: 0,
            break_index: line_breaks.first().copied(),
            space_index: text.iter().position(|unit| *unit == 0x0020),
            active_group: None,
        };
    }

    fn advance_format_range(&mut self) -> bool {
        if self.range_index + 1 >= self.format_ranges.len() {
            return false;
        }
        self.range_index += 1;
        let override_format = self.format_ranges[self.range_index]
            .format
            .read()
            .unwrap()
            .clone();
        self.current_format = merge_text_format(&self.current_format, &override_format);
        return true;
    }

    fn base_x(&self) -> f32 {
        return TEXT_LAYOUT_GUTTER
            + self.left_margin
            + self.block_indent
            + if self.first_line_of_paragraph {
                self.indent
            } else {
                0.0
            };
    }

    fn break_long_word(&mut self, end: usize) {
        let mut remaining = self.text_index;
        while remaining < end {
            if self.truncated {
                return;
            }
            let mut advances = Vec::new();
            char_advances(
                &mut advances,
                self.text,
                &self.current_format,
                remaining,
                end,
                self.measure,
                self.offset_x + self.base_x(),
            );
            let total_width = sum_advances(&advances);
            if self.offset_x + total_width <= self.wrap_width() {
                self.place_span(remaining, end);
                return;
            }

            let mut count = 0;
            let mut character_count = 0;
            let mut width = 0.0;
            let mut index = remaining;
            while index < end && count < advances.len() {
                let code_point_length = utf16_code_point_len(self.text, index).min(end - index);
                if self.offset_x + width + advances.get(count).copied().unwrap_or(0.0)
                    > self.wrap_width()
                {
                    break;
                }
                width += advances.get(count).copied().unwrap_or(0.0);
                count += 1;
                character_count += code_point_length;
                index += code_point_length;
            }
            if character_count == 0 {
                character_count = utf16_code_point_len(self.text, remaining).min(end - remaining);
            }

            self.place_span(remaining, remaining + character_count);
            self.commit_line();
            if self.check_truncation() {
                return;
            }
            remaining += character_count;
        }
    }

    fn build(&mut self) {
        self.groups.clear();
        self.update_line_metrics();
        self.update_paragraph_metrics();

        while self.text_index <= self.text.len() {
            if self.truncated {
                break;
            }
            self.emit_bullet();
            let has_break = self.break_index.is_some();
            let break_before_space =
                has_break && (self.space_index.is_none() || self.break_index <= self.space_index);

            if break_before_space {
                let break_index = self.break_index.unwrap();
                if self.text_index <= break_index {
                    self.place_span(self.text_index, break_index);
                    self.active_group = None;
                }
                self.commit_line();
                self.paragraph_last_lines.insert(self.line_index - 1);
                if self.check_truncation() {
                    break;
                }
                if !self.multiline {
                    break;
                }
                self.text_index = break_index + 1;
                self.break_count += 1;
                self.break_index = self.line_breaks.get(self.break_count).copied();
                self.space_index = self.text[self.text_index..]
                    .iter()
                    .position(|unit| *unit == 0x0020)
                    .map(|offset| self.text_index + offset);
                self.update_paragraph_metrics();
                self.update_line_metrics();
            } else if let Some(space_index) = self.space_index {
                let word_end = space_index + 1;
                let segment_end = self
                    .break_index
                    .filter(|break_index| *break_index < word_end)
                    .unwrap_or(word_end);
                let (segment_positions, segment_width) =
                    self.measure_span(self.text_index, segment_end);
                let mut should_wrap = self.word_wrap
                    && self.container_width >= TEXT_LAYOUT_GUTTER * 2.0
                    && self.offset_x + segment_width > self.wrap_width();
                if should_wrap && segment_end == word_end && !segment_positions.is_empty() {
                    let trailing_space = *segment_positions.last().unwrap();
                    if self.offset_x + segment_width - trailing_space <= self.wrap_width() {
                        should_wrap = false;
                    }
                }

                if should_wrap {
                    let trim_target = self
                        .active_group
                        .or_else(|| (!self.groups.is_empty()).then(|| self.groups.len() - 1));
                    if let Some(group_index) = trim_target {
                        let group = &mut self.groups[group_index];
                        if !group.positions.is_empty() && group.line_index == self.line_index {
                            let trailing_width = *group.positions.last().unwrap();
                            group.width -= trailing_width;
                            group.end_index = group.end_index.saturating_sub(1);
                        }
                    }
                    self.commit_line();
                    if self.check_truncation() {
                        break;
                    }
                    if self.text.get(self.text_index) == Some(&0x0020) {
                        self.text_index += 1;
                    }
                }

                self.place_span(self.text_index, segment_end);
                self.space_index = self.text[word_end..]
                    .iter()
                    .position(|unit| *unit == 0x0020)
                    .map(|offset| word_end + offset);
            } else {
                if self.text_index >= self.text.len() {
                    break;
                }
                if self.word_wrap && self.container_width >= TEXT_LAYOUT_GUTTER * 2.0 {
                    self.break_long_word(self.text.len());
                } else {
                    self.place_span(self.text_index, self.text.len());
                }
                break;
            }
        }

        for group in self.groups.iter_mut().rev() {
            if group.line_index < self.line_index {
                break;
            }
            group.ascent = if self.max_ascent != 0.0 {
                self.max_ascent
            } else {
                group.ascent
            };
            group.height = if self.max_line_height != 0.0 {
                self.max_line_height
            } else {
                group.height
            };
        }
        self.paragraph_last_lines.insert(self.line_index);
    }

    fn check_truncation(&mut self) -> bool {
        if self.max_lines < 0 || self.line_index < self.max_lines as usize {
            return false;
        }
        let last_line_index = self.line_index - 1;
        if !self.truncation_character.is_empty() && !self.groups.is_empty() {
            let last_group_index = self
                .groups
                .iter()
                .rposition(|group| group.line_index == last_line_index);
            if let Some(last_group_index) = last_group_index {
                let format_ref = self.groups[last_group_index].format.clone();
                let format = format_ref.read().unwrap().clone();
                let ellipsis_width = (self.measure)(self.truncation_character, &format);
                let available = self.container_width
                    - TEXT_LAYOUT_GUTTER
                    - self.right_margin
                    - self.groups[last_group_index].offset_x;
                while !self.groups[last_group_index].positions.is_empty() {
                    let used_width = sum_advances(&self.groups[last_group_index].positions);
                    if used_width + ellipsis_width <= available {
                        break;
                    }
                    let trimmed = self.groups[last_group_index].positions.pop().unwrap_or(0.0);
                    self.groups[last_group_index].width -= trimmed;
                    self.groups[last_group_index].end_index =
                        self.groups[last_group_index].end_index.saturating_sub(1);
                    if self.groups[last_group_index].end_index
                        <= self.groups[last_group_index].start_index
                    {
                        break;
                    }
                }
                let last_group = &self.groups[last_group_index];
                let mut ellipsis_group = create_text_layout_group(format_ref);
                ellipsis_group.start_index = last_group.end_index;
                ellipsis_group.end_index = last_group.end_index;
                ellipsis_group.positions = vec![ellipsis_width];
                ellipsis_group.width = ellipsis_width;
                ellipsis_group.offset_x = last_group.offset_x + last_group.width;
                ellipsis_group.ascent = last_group.ascent;
                ellipsis_group.descent = last_group.descent;
                ellipsis_group.leading = last_group.leading;
                ellipsis_group.line_index = last_line_index;
                ellipsis_group.offset_y = last_group.offset_y;
                ellipsis_group.height = last_group.height;
                self.groups.push(ellipsis_group);
            }
        }
        self.truncated = true;
        return true;
    }

    fn commit_line(&mut self) {
        for group in self.groups.iter_mut().rev() {
            if group.line_index < self.line_index {
                break;
            }
            group.ascent = self.max_ascent;
            group.height = self.max_line_height;
        }
        self.offset_y += self.max_line_height;
        self.max_ascent = 0.0;
        self.max_line_height = 0.0;
        self.line_index += 1;
        self.offset_x = 0.0;
        self.first_line_of_paragraph = false;
        self.active_group = None;
        self.update_line_metrics();
    }

    fn emit_bullet(&mut self) {
        if !self.bullet_pending {
            return;
        }
        self.bullet_pending = false;
        if self.current_format.list_marker == Some(TextFormatListMarker::None) {
            if self.indent <= 0.0 {
                self.indent = (self.measure)("•", &self.current_format).ceil() + 2.0;
            }
            return;
        }
        let bullet_width = (self.measure)("•", &self.current_format);
        let format = Arc::new(RwLock::new(self.current_format.clone()));
        let mut group = create_text_layout_group(format);
        group.start_index = self.text_index;
        group.end_index = self.text_index;
        group.positions = vec![bullet_width];
        group.width = bullet_width;
        group.offset_x = TEXT_LAYOUT_GUTTER + self.left_margin + self.block_indent;
        group.ascent = self.ascent;
        group.descent = self.descent;
        group.leading = self.leading;
        group.line_index = self.line_index;
        group.offset_y = self.offset_y + TEXT_LAYOUT_GUTTER;
        group.height = self.line_height;
        self.groups.push(group);
        if self.indent <= 0.0 {
            self.indent = bullet_width.ceil() + 2.0;
        }
    }

    fn measure_span(&mut self, start: usize, end: usize) -> (Vec<f32>, f32) {
        if start >= end {
            return (Vec::new(), 0.0);
        }
        let saved_range_index = self.range_index;
        let saved_format = self.current_format.clone();
        let mut index = start;
        let mut positions = Vec::new();
        while index < end {
            let range_end = end.min(self.format_ranges[self.range_index].end);
            if index < range_end {
                let mut range_positions = Vec::new();
                char_advances(
                    &mut range_positions,
                    self.text,
                    &self.current_format,
                    index,
                    range_end,
                    self.measure,
                    self.offset_x + self.base_x() + sum_advances(&positions),
                );
                positions.extend(range_positions);
                index = range_end;
            }
            if index >= end || !self.advance_format_range() {
                break;
            }
        }
        self.range_index = saved_range_index;
        self.current_format = saved_format;
        let width = sum_advances(&positions);
        return (positions, width);
    }

    fn place_span(&mut self, start: usize, end: usize) {
        let mut index = start;
        while index < end {
            let range_end = end.min(self.format_ranges[self.range_index].end);
            if index < range_end {
                let needs_new_group = self
                    .active_group
                    .map(|group_index| {
                        let group = &self.groups[group_index];
                        group.start_index != group.end_index
                    })
                    .unwrap_or(true);
                if needs_new_group {
                    let format = self.format_ranges[self.range_index].format.clone();
                    let mut group = create_text_layout_group(format);
                    group.start_index = index;
                    group.end_index = range_end;
                    self.groups.push(group);
                    self.active_group = Some(self.groups.len() - 1);
                } else {
                    let group = &mut self.groups[self.active_group.unwrap()];
                    group.format = self.format_ranges[self.range_index].format.clone();
                    group.start_index = index;
                    group.end_index = range_end;
                }

                let mut positions = Vec::new();
                let base_x = self.base_x();
                char_advances(
                    &mut positions,
                    self.text,
                    &self.current_format,
                    index,
                    range_end,
                    self.measure,
                    self.offset_x + base_x,
                );
                let span_width = sum_advances(&positions);
                let group = &mut self.groups[self.active_group.unwrap()];
                group.positions = positions;
                group.offset_x = self.offset_x + base_x;
                group.ascent = self.ascent;
                group.descent = self.descent;
                group.leading = self.leading;
                group.line_index = self.line_index;
                group.offset_y = self.offset_y + TEXT_LAYOUT_GUTTER;
                group.width = span_width;
                group.height = self.line_height;
                self.offset_x += span_width;
                index = range_end;
            }
            if index >= end {
                break;
            }
            if !self.advance_format_range() {
                break;
            }
            self.update_line_metrics();
        }

        self.text_index = end;
        while self.text_index >= self.format_ranges[self.range_index].end
            && self.range_index + 1 < self.format_ranges.len()
        {
            self.advance_format_range();
            self.update_line_metrics();
        }
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
        self.bullet_pending = self.current_format.bullet == Some(true);
    }

    fn wrap_width(&self) -> f32 {
        return self.container_width - TEXT_LAYOUT_GUTTER - self.right_margin - self.base_x();
    }
}
