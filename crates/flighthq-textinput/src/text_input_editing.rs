use flighthq_types::{
    HandleTextInputKeyboardOptions, KeyboardEventData, ReplaceTextInputOptions, TextFormat,
    TextFormatRange, TextLayoutGroup, TextLayoutResult, TextSelectionRectangle, key_code,
};

use flighthq_text::RichText;
use flighthq_textlayout::get_rich_text_selection_rectangles;

use crate::text_input::get_text_input_state;

// All indices in this module are character (`char`) indices, matching the
// layout engine in `flighthq-textlayout`. Slicing/length use `char` counts,
// not bytes, so multi-byte text behaves consistently with the layout groups.

/// Appends `text` at the end of the field's content, respecting restrictions.
pub fn append_text_input(source: &mut RichText, text: &str) {
    let len = char_len(&source.data.text);
    replace_text_input(source, len, len, text, None);
}

/// Returns `text` with invalid characters removed according to `source`'s
/// `restrict` rule and `max_chars` limit.
///
/// `replace_length` is the number of characters being replaced (used to
/// compute remaining capacity under `max_chars`).
pub fn apply_text_input_restriction(
    source: &RichText,
    text: &str,
    replace_length: usize,
) -> String {
    let data = &source.data;
    let mut value: String = if data.multiline {
        text.to_string()
    } else {
        text.chars().filter(|c| *c != '\n' && *c != '\r').collect()
    };
    value = restrict_text_input(&value, &get_input_state(source).restrict);

    if data.max_chars > 0 {
        let max_chars = data.max_chars as usize;
        let used = char_len(&data.text);
        // Remaining capacity after accounting for what the replacement frees.
        if max_chars + replace_length <= used {
            return String::new();
        }
        let max_length = max_chars + replace_length - used;
        if char_len(&value) > max_length {
            value = value.chars().take(max_length).collect();
        }
    }

    value
}

/// Deletes backward from the caret: if there is a selection, deletes the
/// selection; otherwise deletes the character before the caret.
pub fn delete_text_input_backward(source: &mut RichText) {
    let start = get_text_input_selection_begin_index(source);
    let end = get_text_input_selection_end_index(source);
    if start != end {
        replace_text_input(source, start, end, "", None);
    } else if start > 0 {
        replace_text_input(source, start - 1, start, "", None);
    }
    let caret = get_input_state(source).caret_index;
    get_input_state_mut(source).selection_index = caret;
}

/// Deletes forward from the caret: if there is a selection, deletes the
/// selection; otherwise deletes the character after the caret.
pub fn delete_text_input_forward(source: &mut RichText) {
    let start = get_text_input_selection_begin_index(source);
    let end = get_text_input_selection_end_index(source);
    if start != end {
        replace_text_input(source, start, end, "", None);
    } else if start < char_len(&source.data.text) {
        replace_text_input(source, start, start + 1, "", None);
    }
}

/// Returns the current caret index, clamped to `[0, text.len()]`.
pub fn get_text_input_caret_index(source: &RichText) -> usize {
    clamp_index(
        get_input_state(source).caret_index,
        char_len(&source.data.text),
    )
}

/// Fills `out` with the pixel rectangle of the text caret in the given layout.
pub fn get_text_input_caret_rectangle(
    out: &mut TextSelectionRectangle,
    source: &RichText,
    layout: &TextLayoutResult,
) {
    let caret_index = get_text_input_caret_index(source);
    match get_text_layout_group_at_index(layout, caret_index) {
        None => {
            out.x = TEXT_BOUNDS_GUTTER;
            out.y = TEXT_BOUNDS_GUTTER;
            out.width = 1.0;
            out.height = get_fallback_line_height(layout);
            out.line_index = 0;
        }
        Some(group) => {
            out.x = get_text_layout_group_caret_x(group, caret_index);
            out.y = group.offset_y;
            out.width = 1.0;
            out.height = group.height;
            out.line_index = group.line_index as u32;
        }
    }
}

/// Returns the character index closest to the pixel point `(x, y)` in the
/// given layout, for use by pointer-down hit-testing.
pub fn get_text_input_character_index_at_point(
    source: &RichText,
    layout: &TextLayoutResult,
    x: f32,
    y: f32,
) -> usize {
    if layout.groups.is_empty() {
        return 0;
    }

    let mut closest_line_index = 0;
    let mut closest_line_distance = f32::INFINITY;
    for i in 0..layout.line_heights.len() {
        let line_top = get_line_offset_y(layout, i);
        let line_bottom = line_top + layout.line_heights[i];
        let distance = if y < line_top {
            line_top - y
        } else if y > line_bottom {
            y - line_bottom
        } else {
            0.0
        };
        if distance < closest_line_distance {
            closest_line_distance = distance;
            closest_line_index = i;
        }
    }

    let mut line_start = char_len(&source.data.text);
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
            return get_text_layout_group_character_index_at_x(group, x);
        }
    }

    if line_end > 0 { line_end } else { line_start }
}

/// Returns the text visible to the user: the raw text or the password-masked
/// equivalent.
pub fn get_text_input_display_text(source: &RichText) -> String {
    let state = get_input_state(source);
    if !state.display_as_password {
        return source.data.text.clone();
    }
    let password_character = state.password_character;
    std::iter::repeat(password_character)
        .take(char_len(&source.data.text))
        .collect()
}

/// Returns the lower of `caret_index` and `selection_index`, clamped to the
/// text length.
pub fn get_text_input_selection_begin_index(source: &RichText) -> usize {
    let state = get_input_state(source);
    let len = char_len(&source.data.text);
    clamp_index(state.caret_index, len).min(clamp_index(state.selection_index, len))
}

/// Returns the higher of `caret_index` and `selection_index`, clamped to the
/// text length.
pub fn get_text_input_selection_end_index(source: &RichText) -> usize {
    let state = get_input_state(source);
    let len = char_len(&source.data.text);
    clamp_index(state.caret_index, len).max(clamp_index(state.selection_index, len))
}

/// Fills `out` with per-line selection highlight rectangles for the current
/// selection range.
pub fn get_text_input_selection_rectangles(
    out: &mut Vec<TextSelectionRectangle>,
    source: &RichText,
    layout: &TextLayoutResult,
) {
    get_rich_text_selection_rectangles(
        out,
        get_text_input_selection_begin_index(source),
        get_text_input_selection_end_index(source),
        layout,
    );
}

/// Returns the substring of `text` covered by the current selection.
pub fn get_text_input_selection_text(source: &RichText) -> String {
    char_slice(
        &source.data.text,
        get_text_input_selection_begin_index(source),
        get_text_input_selection_end_index(source),
    )
}

/// Processes one keyboard event, performing the appropriate editing action.
/// Returns `true` when the event was consumed.
pub fn handle_text_input_keyboard(
    source: &mut RichText,
    data: &KeyboardEventData,
    options: Option<&HandleTextInputKeyboardOptions>,
) -> bool {
    match get_keyboard_command(data) {
        KeyboardCommand::None => false,
        KeyboardCommand::Backspace => {
            delete_text_input_backward(source);
            true
        }
        KeyboardCommand::Copy => {
            let copy_text = get_text_input_selection_text(source);
            if !copy_text.is_empty() {
                if let Some(on_copy) = options.and_then(|o| o.on_copy.as_ref()) {
                    on_copy(copy_text);
                }
            }
            true
        }
        KeyboardCommand::Cut => {
            let cut_text = get_text_input_selection_text(source);
            if !cut_text.is_empty() {
                if let Some(on_copy) = options.and_then(|o| o.on_copy.as_ref()) {
                    on_copy(cut_text);
                }
                replace_selected_text_input(source, "", None);
            }
            true
        }
        KeyboardCommand::Delete => {
            delete_text_input_forward(source);
            true
        }
        KeyboardCommand::End => {
            let len = char_len(&source.data.text);
            move_text_input_caret(source, len, data.shift_key);
            true
        }
        KeyboardCommand::Home => {
            move_text_input_caret(source, 0, data.shift_key);
            true
        }
        KeyboardCommand::Left => {
            let caret = get_text_input_caret_index(source);
            move_text_input_caret(source, caret.saturating_sub(1), data.shift_key);
            true
        }
        KeyboardCommand::Paste => {
            let clipboard = options
                .and_then(|o| o.clipboard_text.as_deref())
                .unwrap_or("");
            insert_text_input(source, clipboard);
            true
        }
        KeyboardCommand::Return => {
            if !source.data.multiline {
                return false;
            }
            insert_text_input(source, "\n");
            true
        }
        KeyboardCommand::Right => {
            let caret = get_text_input_caret_index(source);
            move_text_input_caret(source, caret + 1, data.shift_key);
            true
        }
        KeyboardCommand::SelectAll => {
            select_all_text_input(source);
            true
        }
    }
}

/// Inserts `text` at the current selection, applying input rules (restrict,
/// max_chars, multiline filter).
pub fn insert_text_input(source: &mut RichText, text: &str) {
    replace_selected_text_input(
        source,
        text,
        Some(&ReplaceTextInputOptions {
            apply_input_rules: true,
        }),
    );
}

/// Moves the caret to `index`. When `extend_selection` is `false`, the
/// selection anchor also moves (collapsing the selection).
pub fn move_text_input_caret(source: &mut RichText, index: usize, extend_selection: bool) {
    let caret = clamp_index(index, char_len(&source.data.text));
    let state = get_input_state_mut(source);
    state.caret_index = caret;
    if !extend_selection {
        state.selection_index = caret;
    }
    invalidate_appearance(source);
}

/// Replaces the current selection with `text`, optionally applying input rules.
pub fn replace_selected_text_input(
    source: &mut RichText,
    text: &str,
    options: Option<&ReplaceTextInputOptions>,
) {
    let begin = get_text_input_selection_begin_index(source);
    let end = get_text_input_selection_end_index(source);
    replace_text_input(source, begin, end, text, options);
}

/// Replaces the char range `[begin_index, end_index)` in the field's text with
/// `text`, adjusting format ranges and moving the caret to the end of the
/// inserted text.
pub fn replace_text_input(
    source: &mut RichText,
    begin_index: usize,
    end_index: usize,
    text: &str,
    options: Option<&ReplaceTextInputOptions>,
) {
    let len = char_len(&source.data.text);
    let mut start = clamp_index(begin_index, len);
    let mut end = clamp_index(end_index, len);
    if end < start {
        std::mem::swap(&mut start, &mut end);
    }

    let apply_rules = options.map(|o| o.apply_input_rules).unwrap_or(false);
    let value = if apply_rules {
        apply_text_input_restriction(source, text, end - start)
    } else {
        text.to_string()
    };
    let value_len = char_len(&value);
    if value_len == 0 && start == end {
        return;
    }

    let prefix = char_slice(&source.data.text, 0, start);
    let suffix = char_slice(&source.data.text, end, len);
    source.data.text = format!("{prefix}{value}{suffix}");

    let default_format = source.data.default_text_format.clone();
    adjust_text_format_ranges(
        &mut source.data.text_format_ranges,
        &default_format,
        start,
        end,
        value_len,
    );
    set_text_input_selection(source, start + value_len, start + value_len);
    invalidate_appearance(source);
}

/// Selects all text in the field.
pub fn select_all_text_input(source: &mut RichText) {
    let len = char_len(&source.data.text);
    set_text_input_selection(source, 0, len);
}

/// Selects the entire line containing `index`.
pub fn select_line_at_text_input_index(source: &mut RichText, index: usize) {
    let chars: Vec<char> = source.data.text.chars().collect();
    let clamped = index.min(chars.len());
    let mut start = clamped;
    let mut end = clamped;
    while start > 0 && chars[start - 1] != '\n' {
        start -= 1;
    }
    while end < chars.len() && chars[end] != '\n' {
        end += 1;
    }
    set_text_input_selection(source, start, end);
}

/// Selects the word (or delimiter run) containing `index`.
pub fn select_word_at_text_input_index(source: &mut RichText, index: usize) {
    let chars: Vec<char> = source.data.text.chars().collect();
    let clamped = index.min(chars.len());
    let mut start = clamped;
    let mut end = clamped;
    while start > 0 && is_word_char(chars[start - 1]) {
        start -= 1;
    }
    while end < chars.len() && is_word_char(chars[end]) {
        end += 1;
    }
    if start == end {
        while start > 0 && !is_word_char(chars[start - 1]) {
            start -= 1;
        }
        while end < chars.len() && !is_word_char(chars[end]) {
            end += 1;
        }
    }
    set_text_input_selection(source, start, end);
}

/// Sets the selection to `[begin_index, end_index)`, clamped to the text
/// length. The caret is placed at `end_index`.
pub fn set_text_input_selection(source: &mut RichText, begin_index: usize, end_index: usize) {
    let len = char_len(&source.data.text);
    let begin = clamp_index(begin_index, len);
    let end = clamp_index(end_index, len);
    let state = get_input_state_mut(source);
    state.selection_index = begin;
    state.caret_index = end;
    invalidate_appearance(source);
}

fn adjust_text_format_ranges(
    ranges: &mut Vec<TextFormatRange>,
    default_format: &TextFormat,
    begin_index: usize,
    end_index: usize,
    insert_length: usize,
) {
    let remove_length = end_index - begin_index;
    // Signed offset; insert may shrink or grow the run space.
    let offset = insert_length as isize - remove_length as isize;
    let shift = |value: usize| -> usize { (value as isize + offset).max(0) as usize };

    let mut i = 0;
    while i < ranges.len() {
        let range = &mut ranges[i];
        if begin_index == end_index {
            if range.end < begin_index {
                // unchanged
            } else if range.start >= begin_index {
                range.start = shift(range.start);
                range.end = shift(range.end);
            } else if range.start < begin_index && range.end >= begin_index {
                range.end = shift(range.end);
            }
        } else if range.end <= begin_index {
            // unchanged
        } else if range.start > end_index {
            range.start = shift(range.start);
            range.end = shift(range.end);
        } else if range.start <= begin_index && range.end > end_index {
            range.end = shift(range.end);
        } else if range.start >= begin_index && range.end <= end_index {
            ranges.remove(i);
            continue;
        } else if range.end > end_index && range.start > begin_index && range.start <= end_index {
            range.start = begin_index;
            range.end = shift(range.end);
        } else if range.start < begin_index && range.end > begin_index && range.end <= end_index {
            range.end = begin_index;
        }
        i += 1;
    }

    ranges.retain(|range| range.start < range.end);
    if ranges.is_empty() && insert_length > 0 {
        ranges.push(TextFormatRange {
            end: begin_index + insert_length,
            format: default_format.clone(),
            start: begin_index,
        });
    }
}

fn char_len(text: &str) -> usize {
    text.chars().count()
}

// Char-index substring `[start, end)`.
fn char_slice(text: &str, start: usize, end: usize) -> String {
    text.chars()
        .skip(start)
        .take(end.saturating_sub(start))
        .collect()
}

fn clamp_index(value: usize, length: usize) -> usize {
    value.min(length)
}

fn get_fallback_line_height(layout: &TextLayoutResult) -> f32 {
    *layout.line_heights.first().unwrap_or(&12.0)
}

// Editing operates on the editable-input slot `enable_text_input` attaches;
// calling an editing function on a `RichText` that never enabled input is API
// misuse, so this panics rather than returning a sentinel.
fn get_input_state(source: &RichText) -> &flighthq_types::TextInputState {
    get_text_input_state(source)
        .expect("text input is not enabled on this RichText; call enable_text_input first")
}

fn get_input_state_mut(source: &mut RichText) -> &mut flighthq_types::TextInputState {
    flighthq_text::get_rich_text_input_mut(source)
        .expect("text input is not enabled on this RichText; call enable_text_input first")
}

fn get_keyboard_command(data: &KeyboardEventData) -> KeyboardCommand {
    if data.ctrl_key || data.meta_key {
        let key = data.key.to_ascii_lowercase();
        if key == "a" || data.key_code == key_code::A {
            return KeyboardCommand::SelectAll;
        }
        if key == "c" || data.key_code == key_code::C {
            return KeyboardCommand::Copy;
        }
        if key == "v" || data.key_code == key_code::V {
            return KeyboardCommand::Paste;
        }
        if key == "x" || data.key_code == key_code::X {
            return KeyboardCommand::Cut;
        }
        return KeyboardCommand::None;
    }
    if data.key_code == key_code::BACKSPACE || data.key == "Backspace" {
        return KeyboardCommand::Backspace;
    }
    if data.key_code == key_code::DELETE || data.key == "Delete" {
        return KeyboardCommand::Delete;
    }
    if data.key_code == key_code::END || data.key == "End" {
        return KeyboardCommand::End;
    }
    if data.key_code == key_code::HOME || data.key == "Home" {
        return KeyboardCommand::Home;
    }
    if data.key_code == key_code::LEFT || data.key == "ArrowLeft" {
        return KeyboardCommand::Left;
    }
    if data.key_code == key_code::RETURN || data.key == "Enter" {
        return KeyboardCommand::Return;
    }
    if data.key_code == key_code::RIGHT || data.key == "ArrowRight" {
        return KeyboardCommand::Right;
    }
    KeyboardCommand::None
}

fn get_line_offset_y(layout: &TextLayoutResult, line_index: usize) -> f32 {
    for group in &layout.groups {
        if group.line_index == line_index {
            return group.offset_y;
        }
    }
    let mut y = TEXT_BOUNDS_GUTTER;
    for i in 0..line_index {
        y += layout.line_heights.get(i).copied().unwrap_or(0.0);
    }
    y
}

fn get_text_layout_group_at_index(
    layout: &TextLayoutResult,
    index: usize,
) -> Option<&TextLayoutGroup> {
    for group in &layout.groups {
        if index >= group.start_index && index <= group.end_index {
            return Some(group);
        }
    }
    layout.groups.last()
}

fn get_text_layout_group_caret_x(group: &TextLayoutGroup, index: usize) -> f32 {
    let mut x = group.offset_x;
    let limit = index.min(group.end_index).saturating_sub(group.start_index);
    for i in 0..limit {
        x += group.positions.get(i).copied().unwrap_or(0.0);
    }
    x
}

fn get_text_layout_group_character_index_at_x(group: &TextLayoutGroup, x: f32) -> usize {
    let mut current_x = group.offset_x;
    for (i, advance) in group.positions.iter().enumerate() {
        if x < current_x + advance / 2.0 {
            return group.start_index + i;
        }
        current_x += advance;
    }
    group.end_index
}

// A selection/caret change recomposites the field without changing its content
// or bounds. Mirrors TS `invalidateNodeAppearance(source)`, routed through the
// text crate's public appearance seam since the `RichText` runtime is private.
fn invalidate_appearance(source: &mut RichText) {
    flighthq_text::invalidate_rich_text_appearance(source);
}

fn is_word_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

fn matches_restrict_ranges(c: char, ranges: &[char]) -> bool {
    let mut i = 0;
    while i < ranges.len() {
        let current = ranges[i];
        if current == '\\' && i + 1 < ranges.len() {
            if c == ranges[i + 1] {
                return true;
            }
            i += 1;
        } else if i + 2 < ranges.len() && ranges[i + 1] == '-' {
            let end = ranges[i + 2];
            if c as u32 >= current as u32 && c as u32 <= end as u32 {
                return true;
            }
            i += 2;
        } else if c == current {
            return true;
        }
        i += 1;
    }
    false
}

fn restrict_text_input(text: &str, restrict: &str) -> String {
    if restrict.is_empty() || text.is_empty() {
        return text.to_string();
    }

    let (accepted, declined) = split_restrict_ranges(restrict);
    let mut out = String::new();
    for c in text.chars() {
        let accepted_match = accepted.is_empty() || matches_restrict_ranges(c, &accepted);
        let declined_match = !declined.is_empty() && matches_restrict_ranges(c, &declined);
        if accepted_match && !declined_match {
            out.push(c);
        }
    }
    out
}

fn split_restrict_ranges(restrict: &str) -> (Vec<char>, Vec<char>) {
    let chars: Vec<char> = restrict.chars().collect();
    let mut accepted: Vec<char> = Vec::new();
    let mut declined: Vec<char> = Vec::new();
    let mut declining = false;

    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c == '\\' && i + 1 < chars.len() {
            let target = if declining {
                &mut declined
            } else {
                &mut accepted
            };
            target.push(c);
            target.push(chars[i + 1]);
            i += 1;
        } else if c == '^' {
            declining = !declining;
        } else if declining {
            declined.push(c);
        } else {
            accepted.push(c);
        }
        i += 1;
    }

    (accepted, declined)
}

enum KeyboardCommand {
    Backspace,
    Copy,
    Cut,
    Delete,
    End,
    Home,
    Left,
    None,
    Paste,
    Return,
    Right,
    SelectAll,
}

const TEXT_BOUNDS_GUTTER: f32 = 2.0;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::text_input::enable_text_input;
    use flighthq_text::{
        create_rich_text, create_rich_text_data, get_rich_text_appearance_revision,
        set_rich_text_format_range,
    };
    use flighthq_types::{RichTextData, TextInputOptions};

    // Mirrors the TS `createRichText({ data })` partial-override: unset fields
    // take the RichText create defaults, not the all-zero struct default.
    fn create_input(data: RichTextData, options: TextInputOptions) -> RichText {
        let merged = RichTextData {
            max_chars: data.max_chars,
            multiline: data.multiline,
            text: data.text,
            ..create_rich_text_data(None)
        };
        let mut text = create_rich_text(Some(&merged));
        enable_text_input(&mut text, Some(&options));
        text
    }

    fn keyboard(key: &str, key_code_value: u32) -> KeyboardEventData {
        KeyboardEventData {
            key: key.to_string(),
            key_code: key_code_value,
            ..Default::default()
        }
    }

    fn layout() -> TextLayoutResult {
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
                    offset_x: 2.0,
                    offset_y: 2.0,
                    positions: vec![10.0, 10.0, 10.0],
                    start_index: 0,
                    width: 30.0,
                },
                TextLayoutGroup {
                    ascent: 10.0,
                    descent: 2.0,
                    end_index: 7,
                    format: TextFormat::default(),
                    height: 12.0,
                    leading: 0.0,
                    line_index: 1,
                    offset_x: 2.0,
                    offset_y: 14.0,
                    positions: vec![10.0, 10.0, 10.0, 10.0],
                    start_index: 3,
                    width: 40.0,
                },
            ],
            line_ascents: vec![10.0, 10.0],
            line_descents: vec![2.0, 2.0],
            line_heights: vec![12.0, 12.0],
            line_leadings: vec![0.0, 0.0],
            line_widths: vec![30.0, 40.0],
            num_lines: 2,
            text_height: 24.0,
            text_width: 40.0,
        }
    }

    fn with_text(text: &str) -> RichText {
        create_input(
            RichTextData {
                text: text.to_string(),
                ..Default::default()
            },
            TextInputOptions::default(),
        )
    }

    #[test]
    fn append_text_input_appends_without_restrictions() {
        let mut text = create_input(
            RichTextData {
                max_chars: 3,
                text: "abc".to_string(),
                ..Default::default()
            },
            TextInputOptions::default(),
        );
        append_text_input(&mut text, "def");
        assert_eq!(text.data.text, "abcdef");
        assert_eq!(get_text_input_caret_index(&text), 6);
    }

    #[test]
    fn apply_text_input_restriction_accepted_and_declined() {
        let allow = create_input(
            RichTextData::default(),
            TextInputOptions {
                restrict: Some("A-Z 0-9".to_string()),
                ..Default::default()
            },
        );
        assert_eq!(apply_text_input_restriction(&allow, "A1a!", 0), "A1");

        let deny = create_input(
            RichTextData::default(),
            TextInputOptions {
                restrict: Some("^a-z".to_string()),
                ..Default::default()
            },
        );
        assert_eq!(apply_text_input_restriction(&deny, "Abc1", 0), "A1");

        let escaped = create_input(
            RichTextData::default(),
            TextInputOptions {
                restrict: Some("\\-\\^".to_string()),
                ..Default::default()
            },
        );
        assert_eq!(apply_text_input_restriction(&escaped, "-^A", 0), "-^");
    }

    #[test]
    fn apply_text_input_restriction_max_chars() {
        let text = create_input(
            RichTextData {
                max_chars: 5,
                text: "abc".to_string(),
                ..Default::default()
            },
            TextInputOptions::default(),
        );
        assert_eq!(apply_text_input_restriction(&text, "def", 0), "de");
    }

    #[test]
    fn apply_text_input_restriction_removes_line_breaks() {
        let text = create_input(
            RichTextData {
                multiline: false,
                ..Default::default()
            },
            TextInputOptions::default(),
        );
        assert_eq!(apply_text_input_restriction(&text, "a\nb\rc", 0), "abc");
    }

    #[test]
    fn delete_text_input_backward_no_selection() {
        let mut text = with_text("abc");
        set_text_input_selection(&mut text, 2, 2);
        delete_text_input_backward(&mut text);
        assert_eq!(text.data.text, "ac");
        assert_eq!(get_text_input_caret_index(&text), 1);
    }

    #[test]
    fn delete_text_input_backward_with_selection() {
        let mut text = with_text("abcd");
        set_text_input_selection(&mut text, 1, 3);
        delete_text_input_backward(&mut text);
        assert_eq!(text.data.text, "ad");
    }

    #[test]
    fn delete_text_input_forward_no_selection() {
        let mut text = with_text("abc");
        set_text_input_selection(&mut text, 1, 1);
        delete_text_input_forward(&mut text);
        assert_eq!(text.data.text, "ac");
    }

    #[test]
    fn get_text_input_caret_index_clamped() {
        let mut text = with_text("abc");
        set_text_input_selection(&mut text, 0, 99);
        assert_eq!(get_text_input_caret_index(&text), 3);
    }

    #[test]
    fn get_text_input_caret_rectangle_from_group() {
        let mut text = with_text("abcdefg");
        set_text_input_selection(&mut text, 2, 2);
        let mut out = TextSelectionRectangle::default();
        get_text_input_caret_rectangle(&mut out, &text, &layout());
        assert_eq!(out.height, 12.0);
        assert_eq!(out.line_index, 0);
        assert_eq!(out.width, 1.0);
        assert_eq!(out.x, 22.0);
        assert_eq!(out.y, 2.0);
    }

    #[test]
    fn get_text_input_character_index_at_point_nearest() {
        let text = with_text("abcdefg");
        assert_eq!(
            get_text_input_character_index_at_point(&text, &layout(), 27.0, 3.0),
            3
        );
        assert_eq!(
            get_text_input_character_index_at_point(&text, &layout(), 2.0, 20.0),
            3
        );
    }

    #[test]
    fn get_text_input_display_text_password() {
        let plain = with_text("secret");
        assert_eq!(get_text_input_display_text(&plain), "secret");

        let masked = create_input(
            RichTextData {
                text: "secret".to_string(),
                ..Default::default()
            },
            TextInputOptions {
                display_as_password: Some(true),
                password_character: Some('*'),
                ..Default::default()
            },
        );
        assert_eq!(get_text_input_display_text(&masked), "******");
    }

    #[test]
    fn get_text_input_selection_begin_index_returns_lower() {
        let mut text = with_text("abcd");
        set_text_input_selection(&mut text, 3, 1);
        assert_eq!(get_text_input_selection_begin_index(&text), 1);
    }

    #[test]
    fn get_text_input_selection_end_index_returns_higher() {
        let mut text = with_text("abcd");
        set_text_input_selection(&mut text, 3, 1);
        assert_eq!(get_text_input_selection_end_index(&text), 3);
    }

    #[test]
    fn get_text_input_selection_rectangles_per_group() {
        let mut text = with_text("abcdefg");
        set_text_input_selection(&mut text, 1, 5);
        let mut out = Vec::new();
        get_text_input_selection_rectangles(&mut out, &text, &layout());
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].x, 12.0);
        assert_eq!(out[0].width, 20.0);
        assert_eq!(out[0].line_index, 0);
        assert_eq!(out[1].x, 2.0);
        assert_eq!(out[1].width, 20.0);
        assert_eq!(out[1].line_index, 1);
    }

    #[test]
    fn get_text_input_selection_text_slice_and_empty() {
        let mut text = with_text("hello world");
        set_text_input_selection(&mut text, 6, 11);
        assert_eq!(get_text_input_selection_text(&text), "world");

        let mut collapsed = with_text("hello");
        set_text_input_selection(&mut collapsed, 2, 2);
        assert_eq!(get_text_input_selection_text(&collapsed), "");
    }

    #[test]
    fn handle_text_input_keyboard_arrows_backspace_selectall_paste_return() {
        let mut text = with_text("abc");
        set_text_input_selection(&mut text, 2, 2);
        assert!(handle_text_input_keyboard(
            &mut text,
            &keyboard("ArrowLeft", key_code::LEFT),
            None
        ));
        assert_eq!(get_text_input_caret_index(&text), 1);

        let mut shifted = with_text("abc");
        set_text_input_selection(&mut shifted, 1, 1);
        handle_text_input_keyboard(
            &mut shifted,
            &KeyboardEventData {
                key: "ArrowRight".to_string(),
                key_code: key_code::RIGHT,
                shift_key: true,
                ..Default::default()
            },
            None,
        );
        assert_eq!(get_text_input_selection_begin_index(&shifted), 1);
        assert_eq!(get_text_input_selection_end_index(&shifted), 2);

        let mut back = with_text("abc");
        set_text_input_selection(&mut back, 2, 2);
        handle_text_input_keyboard(&mut back, &keyboard("Backspace", key_code::BACKSPACE), None);
        assert_eq!(back.data.text, "ac");

        let mut all = with_text("abc");
        handle_text_input_keyboard(
            &mut all,
            &KeyboardEventData {
                ctrl_key: true,
                key: "a".to_string(),
                key_code: key_code::A,
                ..Default::default()
            },
            None,
        );
        assert_eq!(get_text_input_selection_begin_index(&all), 0);
        assert_eq!(get_text_input_selection_end_index(&all), 3);

        let mut paste = create_input(
            RichTextData {
                text: "a".to_string(),
                ..Default::default()
            },
            TextInputOptions {
                restrict: Some("0-9".to_string()),
                ..Default::default()
            },
        );
        set_text_input_selection(&mut paste, 1, 1);
        handle_text_input_keyboard(
            &mut paste,
            &KeyboardEventData {
                ctrl_key: true,
                key: "v".to_string(),
                key_code: key_code::V,
                ..Default::default()
            },
            Some(&HandleTextInputKeyboardOptions {
                clipboard_text: Some("b23".to_string()),
                on_copy: None,
            }),
        );
        assert_eq!(paste.data.text, "a23");

        let mut multiline = create_input(
            RichTextData {
                multiline: true,
                text: "a".to_string(),
                ..Default::default()
            },
            TextInputOptions::default(),
        );
        set_text_input_selection(&mut multiline, 1, 1);
        assert!(handle_text_input_keyboard(
            &mut multiline,
            &keyboard("Enter", key_code::RETURN),
            None
        ));
        assert_eq!(multiline.data.text, "a\n");
    }

    #[test]
    fn insert_text_input_applies_restrictions() {
        let mut text = create_input(
            RichTextData {
                text: "ab".to_string(),
                ..Default::default()
            },
            TextInputOptions {
                restrict: Some("0-9".to_string()),
                ..Default::default()
            },
        );
        set_text_input_selection(&mut text, 1, 1);
        insert_text_input(&mut text, "c3");
        assert_eq!(text.data.text, "a3b");
    }

    #[test]
    fn move_text_input_caret_collapse_and_extend() {
        let mut text = with_text("abc");
        move_text_input_caret(&mut text, 2, false);
        assert_eq!(get_text_input_selection_begin_index(&text), 2);
        assert_eq!(get_text_input_selection_end_index(&text), 2);

        let mut ext = with_text("abc");
        set_text_input_selection(&mut ext, 1, 1);
        move_text_input_caret(&mut ext, 3, true);
        assert_eq!(get_text_input_selection_begin_index(&ext), 1);
        assert_eq!(get_text_input_selection_end_index(&ext), 3);
    }

    #[test]
    fn replace_selected_text_input_default_no_rules() {
        let mut text = create_input(
            RichTextData {
                max_chars: 3,
                text: "abc".to_string(),
                ..Default::default()
            },
            TextInputOptions {
                restrict: Some("0-9".to_string()),
                ..Default::default()
            },
        );
        set_text_input_selection(&mut text, 1, 2);
        replace_selected_text_input(&mut text, "XYZ", None);
        assert_eq!(text.data.text, "aXYZc");
    }

    #[test]
    fn replace_selected_text_input_can_apply_rules() {
        let mut text = create_input(
            RichTextData {
                max_chars: 4,
                text: "ab".to_string(),
                ..Default::default()
            },
            TextInputOptions {
                restrict: Some("0-9".to_string()),
                ..Default::default()
            },
        );
        set_text_input_selection(&mut text, 1, 1);
        replace_selected_text_input(
            &mut text,
            "c345",
            Some(&ReplaceTextInputOptions {
                apply_input_rules: true,
            }),
        );
        assert_eq!(text.data.text, "a34b");
    }

    #[test]
    fn replace_text_input_basic_and_caret() {
        let mut text = with_text("hello world");
        let before = get_rich_text_appearance_revision(&text);
        replace_text_input(&mut text, 6, 11, "Flight", None);
        assert_eq!(text.data.text, "hello Flight");
        assert_eq!(get_text_input_selection_begin_index(&text), 12);
        assert_eq!(get_text_input_selection_end_index(&text), 12);
        assert_ne!(get_rich_text_appearance_revision(&text), before);
    }

    #[test]
    fn replace_text_input_format_ranges_after_insertion() {
        let mut text = with_text("abcd");
        set_rich_text_format_range(
            &mut text,
            TextFormat {
                bold: Some(true),
                ..Default::default()
            },
            0,
            4,
        );
        replace_text_input(&mut text, 2, 2, "XY", None);
        assert_eq!(text.data.text_format_ranges.len(), 1);
        assert_eq!(text.data.text_format_ranges[0].start, 0);
        assert_eq!(text.data.text_format_ranges[0].end, 6);
        assert_eq!(text.data.text_format_ranges[0].format.bold, Some(true));
    }

    #[test]
    fn replace_text_input_format_ranges_after_replacement() {
        let mut text = with_text("abcd");
        set_rich_text_format_range(
            &mut text,
            TextFormat {
                bold: Some(true),
                ..Default::default()
            },
            0,
            2,
        );
        set_rich_text_format_range(
            &mut text,
            TextFormat {
                italic: Some(true),
                ..Default::default()
            },
            2,
            4,
        );
        replace_text_input(&mut text, 1, 3, "Z", None);
        assert_eq!(text.data.text_format_ranges.len(), 2);
        assert_eq!(text.data.text_format_ranges[0].start, 0);
        assert_eq!(text.data.text_format_ranges[0].end, 1);
        assert_eq!(text.data.text_format_ranges[0].format.bold, Some(true));
        assert_eq!(text.data.text_format_ranges[1].start, 1);
        assert_eq!(text.data.text_format_ranges[1].end, 3);
        assert_eq!(text.data.text_format_ranges[1].format.italic, Some(true));
    }

    #[test]
    fn select_all_text_input_full_range() {
        let mut text = with_text("abc");
        select_all_text_input(&mut text);
        assert_eq!(get_text_input_selection_begin_index(&text), 0);
        assert_eq!(get_text_input_selection_end_index(&text), 3);
    }

    #[test]
    fn select_line_at_text_input_index_line() {
        let mut text = with_text("hello\nworld");
        select_line_at_text_input_index(&mut text, 8);
        assert_eq!(get_text_input_selection_begin_index(&text), 6);
        assert_eq!(get_text_input_selection_end_index(&text), 11);
    }

    #[test]
    fn select_word_at_text_input_index_word() {
        let mut text = with_text("hello world");
        select_word_at_text_input_index(&mut text, 1);
        assert_eq!(get_text_input_selection_begin_index(&text), 0);
        assert_eq!(get_text_input_selection_end_index(&text), 5);
    }

    #[test]
    fn set_text_input_selection_clamped() {
        let mut text = with_text("abc");
        set_text_input_selection(&mut text, 0, 10);
        assert_eq!(get_text_input_selection_begin_index(&text), 0);
        assert_eq!(get_text_input_selection_end_index(&text), 3);
    }
}
