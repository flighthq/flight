use flighthq_types::{
    HandleTextInputKeyboardOptions, KeyboardEventData, ReplaceTextInputOptions, TextFormat,
    TextFormatRange, TextInputHistoryEntry, TextInputState, TextLayoutGroup, TextLayoutResult,
    TextSelectionRectangle, key_code,
};

use flighthq_text::{RichText, set_rich_text_scroll_h, set_rich_text_scroll_v};
use flighthq_textlayout::{TEXT_BOUNDS_GUTTER, get_rich_text_selection_rectangles};

use crate::text_input::get_text_input_state;

// Horizontal navigation resets the desired-x column so the next vertical motion
// anchors to the new caret position. Vertical navigation reads (and on first
// use, sets) `desired_caret_x`.
const DESIRED_CARET_X_UNSET: f32 = -1.0;

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

/// Returns `true` if there is an edit record available to redo (the history
/// cursor is not at the most-recent record).
pub fn can_redo_text_input(source: &RichText) -> bool {
    let state = get_input_state(source);
    state.history_index < state.history.len() as i64 - 1
}

/// Returns `true` if there is an edit record available to undo (at least one
/// edit has been recorded and the cursor is not before the first record).
pub fn can_undo_text_input(source: &RichText) -> bool {
    get_input_state(source).history_index >= 0
}

/// Clears the undo/redo history for this field. Does not change the text or
/// selection.
pub fn clear_text_input_history(source: &mut RichText) {
    let state = get_input_state_mut(source);
    state.history.clear();
    state.history_index = -1;
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

/// Deletes backward by one word — from the caret to the beginning of the
/// previous word (or the beginning of the text). If a range is selected, deletes
/// the selection instead, matching typical Ctrl/Alt+Backspace behavior.
pub fn delete_text_input_word_backward(source: &mut RichText) {
    let start = get_text_input_selection_begin_index(source);
    let end = get_text_input_selection_end_index(source);
    if start != end {
        replace_text_input(source, start, end, "", None);
        return;
    }
    let word_start = find_word_start_before(&source.data.text, start);
    if word_start < start {
        replace_text_input(source, word_start, start, "", None);
    }
}

/// Deletes forward by one word — from the caret to the end of the next word (or
/// the end of the text). If a range is selected, deletes the selection instead,
/// matching typical Ctrl/Alt+Delete behavior.
pub fn delete_text_input_word_forward(source: &mut RichText) {
    let start = get_text_input_selection_begin_index(source);
    let end = get_text_input_selection_end_index(source);
    if start != end {
        replace_text_input(source, start, end, "", None);
        return;
    }
    let word_end = find_word_end_after(&source.data.text, start);
    if word_end > start {
        replace_text_input(source, start, word_end, "", None);
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
    std::iter::repeat_n(password_character, char_len(&source.data.text)).collect()
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
            if !copy_text.is_empty()
                && let Some(on_copy) = options.and_then(|o| o.on_copy.as_ref())
            {
                on_copy(copy_text);
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
        KeyboardCommand::DeleteWordBackward => {
            delete_text_input_word_backward(source);
            true
        }
        KeyboardCommand::DeleteWordForward => {
            delete_text_input_word_forward(source);
            true
        }
        KeyboardCommand::Down => {
            let layout = options.and_then(|o| o.layout.as_ref());
            move_text_input_caret_down(source, layout, data.shift_key);
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
        KeyboardCommand::Up => {
            let layout = options.and_then(|o| o.layout.as_ref());
            move_text_input_caret_up(source, layout, data.shift_key);
            true
        }
        KeyboardCommand::WordLeft => {
            move_text_input_caret_by_word(source, -1, data.shift_key);
            true
        }
        KeyboardCommand::WordRight => {
            move_text_input_caret_by_word(source, 1, data.shift_key);
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
            ..Default::default()
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
    // Horizontal motion resets the desired-x column so subsequent vertical
    // navigation re-anchors.
    state.desired_caret_x = DESIRED_CARET_X_UNSET;
    invalidate_appearance(source);
}

/// Moves the caret by one word in the given direction (negative = backward/left,
/// positive = forward/right). When `extend_selection` is `false`, the anchor
/// collapses to the new caret; when `true`, the anchor stays and the selection
/// extends.
pub fn move_text_input_caret_by_word(
    source: &mut RichText,
    direction: i32,
    extend_selection: bool,
) {
    let caret_index = get_text_input_caret_index(source);
    let target = if direction < 0 {
        find_word_start_before(&source.data.text, caret_index)
    } else {
        find_word_end_after(&source.data.text, caret_index)
    };
    move_text_input_caret(source, target, extend_selection);
}

/// Moves the caret down one line, preserving the desired-x column for continuous
/// vertical navigation. When `layout` is absent, falls back to moving to the end
/// of the text.
pub fn move_text_input_caret_down(
    source: &mut RichText,
    layout: Option<&TextLayoutResult>,
    extend_selection: bool,
) {
    let Some(layout) = layout else {
        let len = char_len(&source.data.text);
        move_text_input_caret(source, len, extend_selection);
        return;
    };
    let mut out = TextSelectionRectangle::default();
    get_text_input_caret_rectangle(&mut out, source, layout);
    if get_input_state(source).desired_caret_x == DESIRED_CARET_X_UNSET {
        get_input_state_mut(source).desired_caret_x = out.x;
    }
    let target_line_index = out.line_index as usize + 1;
    if target_line_index >= layout.num_lines as usize {
        let len = char_len(&source.data.text);
        move_text_input_caret(source, len, extend_selection);
        return;
    }
    let target_y = get_line_offset_y(layout, target_line_index)
        + layout
            .line_heights
            .get(target_line_index)
            .copied()
            .unwrap_or(0.0)
            / 2.0;
    let desired_x = get_input_state(source).desired_caret_x;
    let target_index = get_text_input_character_index_at_point(source, layout, desired_x, target_y);
    let new_caret = clamp_index(target_index, char_len(&source.data.text));
    let state = get_input_state_mut(source);
    state.caret_index = new_caret;
    if !extend_selection {
        state.selection_index = new_caret;
    }
    // Preserve desired_caret_x across vertical steps (do not reset it).
    invalidate_appearance(source);
}

/// Moves the caret to the end of the current line using `layout`. Falls back to
/// the end of the text when `layout` is absent.
pub fn move_text_input_caret_to_line_end(
    source: &mut RichText,
    layout: Option<&TextLayoutResult>,
    extend_selection: bool,
) {
    let Some(layout) = layout else {
        let len = char_len(&source.data.text);
        move_text_input_caret(source, len, extend_selection);
        return;
    };
    let line_index = get_caret_line_index(source, layout);
    let line_end = get_line_end_index(layout, line_index, char_len(&source.data.text));
    move_text_input_caret(source, line_end, extend_selection);
}

/// Moves the caret to the start of the current line using `layout`. Falls back
/// to the start of the text when `layout` is absent.
pub fn move_text_input_caret_to_line_start(
    source: &mut RichText,
    layout: Option<&TextLayoutResult>,
    extend_selection: bool,
) {
    let Some(layout) = layout else {
        move_text_input_caret(source, 0, extend_selection);
        return;
    };
    let line_index = get_caret_line_index(source, layout);
    let line_start = get_line_start_index(layout, line_index);
    move_text_input_caret(source, line_start, extend_selection);
}

/// Moves the caret up one line, preserving the desired-x column for continuous
/// vertical navigation. When `layout` is absent, falls back to moving to the
/// beginning of the text.
pub fn move_text_input_caret_up(
    source: &mut RichText,
    layout: Option<&TextLayoutResult>,
    extend_selection: bool,
) {
    let Some(layout) = layout else {
        move_text_input_caret(source, 0, extend_selection);
        return;
    };
    let mut out = TextSelectionRectangle::default();
    get_text_input_caret_rectangle(&mut out, source, layout);
    if get_input_state(source).desired_caret_x == DESIRED_CARET_X_UNSET {
        get_input_state_mut(source).desired_caret_x = out.x;
    }
    if out.line_index == 0 {
        move_text_input_caret(source, 0, extend_selection);
        return;
    }
    let target_line_index = out.line_index as usize - 1;
    let target_y = get_line_offset_y(layout, target_line_index)
        + layout
            .line_heights
            .get(target_line_index)
            .copied()
            .unwrap_or(0.0)
            / 2.0;
    let desired_x = get_input_state(source).desired_caret_x;
    let target_index = get_text_input_character_index_at_point(source, layout, desired_x, target_y);
    let new_caret = clamp_index(target_index, char_len(&source.data.text));
    let state = get_input_state_mut(source);
    state.caret_index = new_caret;
    if !extend_selection {
        state.selection_index = new_caret;
    }
    // Preserve desired_caret_x across vertical steps (do not reset it).
    invalidate_appearance(source);
}

/// Reapplies the next edit record in the history, moving the cursor forward.
/// Does nothing when there is nothing to redo.
pub fn redo_text_input(source: &mut RichText) {
    if !can_redo_text_input(source) {
        return;
    }
    let state = get_input_state_mut(source);
    state.history_index += 1;
    let record = state.history[state.history_index as usize].clone();
    apply_history_record(
        source,
        record.text_after,
        record.caret_index_after,
        record.selection_index_after,
    );
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

    let text_before = source.data.text.clone();
    let before_len = char_len(&text_before);
    let caret_before = clamp_index(get_input_state(source).caret_index, before_len);
    let selection_before = clamp_index(get_input_state(source).selection_index, before_len);

    let prefix = char_slice(&text_before, 0, start);
    let suffix = char_slice(&text_before, end, len);
    source.data.text = format!("{prefix}{value}{suffix}");

    let default_format = source.data.default_text_format.clone();
    adjust_text_format_ranges(
        &mut source.data.text_format_ranges,
        &default_format,
        start,
        end,
        value_len,
    );
    // An edit changes the caret position, so any stored desired-x column is no
    // longer valid.
    get_input_state_mut(source).desired_caret_x = DESIRED_CARET_X_UNSET;
    set_text_input_selection(source, start + value_len, start + value_len);

    let skip_history = options.map(|o| o.skip_history).unwrap_or(false);
    if !skip_history && get_input_state(source).history_limit > 0 {
        let text_after = source.data.text.clone();
        let merge_kind = options.and_then(|o| o.merge_kind.clone());
        let state = get_input_state_mut(source);
        record_text_input_edit(
            state,
            text_before,
            text_after,
            caret_before,
            selection_before,
            merge_kind,
        );
    }

    invalidate_appearance(source);
}

/// Scrolls the field so the caret is visible within the given viewport
/// dimensions. Uses `layout` to locate the caret rectangle, then adjusts
/// `scroll_v` (vertical, 1-based line) and `scroll_h` (horizontal, pixels).
pub fn scroll_text_input_caret_into_view(
    source: &mut RichText,
    layout: &TextLayoutResult,
    viewport_width: f32,
    viewport_height: f32,
) {
    let mut out = TextSelectionRectangle::default();
    get_text_input_caret_rectangle(&mut out, source, layout);

    // Vertical scroll (line-based: scroll_v is the 1-based line number).
    let caret_top = out.y;
    let caret_bottom = out.y + out.height;
    // Pixel offset of the current scroll_v (0-based line index = scroll_v - 1).
    let scroll_v_line = (source.data.scroll_v as i64 - 1).max(0) as usize;
    let mut view_top = 0.0;
    for i in 0..scroll_v_line {
        view_top += layout.line_heights.get(i).copied().unwrap_or(0.0);
    }
    let view_bottom = view_top + viewport_height;

    if caret_top < view_top {
        // Caret is above the viewport: scroll to the line containing the caret.
        set_rich_text_scroll_v(source, out.line_index + 1, Some(layout));
    } else if caret_bottom > view_bottom {
        // Caret is below the viewport: scroll down so the caret line is visible.
        let mut pixel_offset = 0.0;
        let mut first_visible_line = 0usize;
        for i in 0..layout.num_lines as usize {
            let height = layout.line_heights.get(i).copied().unwrap_or(0.0);
            if pixel_offset + height > caret_bottom - viewport_height {
                first_visible_line = i;
                break;
            }
            pixel_offset += height;
        }
        set_rich_text_scroll_v(source, first_visible_line as u32 + 1, Some(layout));
    }

    // Horizontal scroll (pixel-based). Add a small margin so the caret is not
    // right at the edge.
    const CARET_SCROLL_MARGIN: f32 = 8.0;
    let scroll_h = source.data.scroll_h;
    let caret_left = out.x - scroll_h;
    let caret_right = caret_left + out.width;
    if caret_left < 0.0 {
        set_rich_text_scroll_h(source, (out.x - CARET_SCROLL_MARGIN).max(0.0), Some(layout));
    } else if caret_right + CARET_SCROLL_MARGIN > viewport_width {
        set_rich_text_scroll_h(
            source,
            out.x + out.width + CARET_SCROLL_MARGIN - viewport_width,
            Some(layout),
        );
    }
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

/// Restores the most-recent edit, moving the cursor backward. Does nothing when
/// there is nothing to undo.
pub fn undo_text_input(source: &mut RichText) {
    if !can_undo_text_input(source) {
        return;
    }
    let state = get_input_state_mut(source);
    let record = state.history[state.history_index as usize].clone();
    state.history_index -= 1;
    apply_history_record(
        source,
        record.text_before,
        record.caret_index_before,
        record.selection_index_before,
    );
}

// Restores a recorded text/caret/selection snapshot onto the field. Used by
// undo_text_input and redo_text_input, which differ only in which side of the
// record they restore. Sets the text directly without recording a new history
// entry, resets desired_caret_x, and invalidates.
fn apply_history_record(
    source: &mut RichText,
    text: String,
    caret_index: usize,
    selection_index: usize,
) {
    let len = char_len(&text);
    source.data.text = text;
    let state = get_input_state_mut(source);
    state.caret_index = clamp_index(caret_index, len);
    state.selection_index = clamp_index(selection_index, len);
    state.desired_caret_x = DESIRED_CARET_X_UNSET;
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

// Returns the layout line index the caret currently sits on. Reads the caret
// rectangle (which resolves the caret's layout group) and returns its
// line_index. Falls back to 0 for an empty layout.
fn get_caret_line_index(source: &RichText, layout: &TextLayoutResult) -> usize {
    let mut out = TextSelectionRectangle::default();
    get_text_input_caret_rectangle(&mut out, source, layout);
    out.line_index as usize
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
        // Word-motion: Ctrl+Left / Ctrl+Right (Windows/Linux).
        if data.key_code == key_code::LEFT || data.key == "ArrowLeft" {
            return KeyboardCommand::WordLeft;
        }
        if data.key_code == key_code::RIGHT || data.key == "ArrowRight" {
            return KeyboardCommand::WordRight;
        }
        // Word-delete: Ctrl+Backspace / Ctrl+Delete.
        if data.key_code == key_code::BACKSPACE || data.key == "Backspace" {
            return KeyboardCommand::DeleteWordBackward;
        }
        if data.key_code == key_code::DELETE || data.key == "Delete" {
            return KeyboardCommand::DeleteWordForward;
        }
        return KeyboardCommand::None;
    }
    // Alt+Left / Alt+Right: word motion on macOS.
    if data.alt_key {
        if data.key_code == key_code::LEFT || data.key == "ArrowLeft" {
            return KeyboardCommand::WordLeft;
        }
        if data.key_code == key_code::RIGHT || data.key == "ArrowRight" {
            return KeyboardCommand::WordRight;
        }
        if data.key_code == key_code::BACKSPACE || data.key == "Backspace" {
            return KeyboardCommand::DeleteWordBackward;
        }
        if data.key_code == key_code::DELETE || data.key == "Delete" {
            return KeyboardCommand::DeleteWordForward;
        }
    }
    if data.key_code == key_code::BACKSPACE || data.key == "Backspace" {
        return KeyboardCommand::Backspace;
    }
    if data.key_code == key_code::DELETE || data.key == "Delete" {
        return KeyboardCommand::Delete;
    }
    if data.key_code == key_code::DOWN || data.key == "ArrowDown" {
        return KeyboardCommand::Down;
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
    if data.key_code == key_code::UP || data.key == "ArrowUp" {
        return KeyboardCommand::Up;
    }
    KeyboardCommand::None
}

// Returns the character index at the end of `line_index` — the largest
// end_index among the line's groups. Falls back to text_length for an empty
// line.
fn get_line_end_index(layout: &TextLayoutResult, line_index: usize, text_length: usize) -> usize {
    let mut end: isize = -1;
    for group in &layout.groups {
        if group.line_index == line_index && group.end_index as isize > end {
            end = group.end_index as isize;
        }
    }
    if end < 0 { text_length } else { end as usize }
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

// Returns the character index at the start of `line_index` — the smallest
// start_index among the line's groups. Falls back to 0 for an empty line.
fn get_line_start_index(layout: &TextLayoutResult, line_index: usize) -> usize {
    let mut start: isize = -1;
    for group in &layout.groups {
        if group.line_index == line_index && (start < 0 || (group.start_index as isize) < start) {
            start = group.start_index as isize;
        }
    }
    if start < 0 { 0 } else { start as usize }
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

// Returns the index of the start of the word preceding `index`. Skips non-word
// chars first (to step out of whitespace/punctuation), then scans backward
// through word chars. Returns 0 if already at the beginning.
fn find_word_start_before(text: &str, index: usize) -> usize {
    let chars: Vec<char> = text.chars().collect();
    let mut i = index.min(chars.len());
    while i > 0 && !is_word_char(chars[i - 1]) {
        i -= 1;
    }
    while i > 0 && is_word_char(chars[i - 1]) {
        i -= 1;
    }
    i
}

// Returns the index of the end of the word following `index`. Skips non-word
// chars first, then scans forward through word chars. Returns text length if
// already at the end.
fn find_word_end_after(text: &str, index: usize) -> usize {
    let chars: Vec<char> = text.chars().collect();
    let mut i = index.min(chars.len());
    while i < chars.len() && !is_word_char(chars[i]) {
        i += 1;
    }
    while i < chars.len() && is_word_char(chars[i]) {
        i += 1;
    }
    i
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

// Appends an edit record to the history. When the new edit shares a non-`None`
// merge_kind with the record the cursor currently points at, the two are
// coalesced (before from the existing record, after from the new one) so a run
// of same-kind keystrokes collapses into one undo step. Any records ahead of the
// cursor (the redo tail) are discarded first, then the history is trimmed to
// history_limit.
fn record_text_input_edit(
    state: &mut TextInputState,
    text_before: String,
    text_after: String,
    caret_index_before: usize,
    selection_index_before: usize,
    merge_kind: Option<String>,
) {
    // Drop any redo tail: a fresh edit makes previously-undone records
    // unreachable.
    if state.history_index < state.history.len() as i64 - 1 {
        state
            .history
            .truncate((state.history_index + 1).max(0) as usize);
    }

    if state.history_index >= 0 {
        let caret_after = state.caret_index;
        let selection_after = state.selection_index;
        let previous = &mut state.history[state.history_index as usize];
        if merge_kind.is_some() && previous.merge_kind == merge_kind {
            previous.text_after = text_after;
            previous.caret_index_after = caret_after;
            previous.selection_index_after = selection_after;
            return;
        }
    }

    state.history.push(TextInputHistoryEntry {
        caret_index_after: state.caret_index,
        caret_index_before,
        merge_kind,
        selection_index_after: state.selection_index,
        selection_index_before,
        text_after,
        text_before,
    });
    state.history_index = state.history.len() as i64 - 1;

    // Trim the oldest records past the limit, keeping the cursor on the newest.
    if state.history.len() > state.history_limit {
        let overflow = state.history.len() - state.history_limit;
        state.history.drain(0..overflow);
        state.history_index = state.history.len() as i64 - 1;
    }
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
    Up,
    WordLeft,
    WordRight,
    DeleteWordBackward,
    DeleteWordForward,
    Down,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::text_input::enable_text_input;
    use flighthq_text::{
        create_rich_text, create_rich_text_data, get_rich_text_appearance_revision,
        set_rich_text_format_range,
    };
    use flighthq_types::{RichTextData, TextAutoSize, TextInputOptions};

    // Mirrors the TS `createRichText({ data })` partial-override: unset fields
    // take the RichText create defaults, not the all-zero struct default.
    fn create_input(data: RichTextData, options: TextInputOptions) -> RichText {
        let merged = RichTextData {
            auto_size: data.auto_size,
            height: if data.height != 0.0 {
                data.height
            } else {
                create_rich_text_data(None).height
            },
            max_chars: data.max_chars,
            multiline: data.multiline,
            text: data.text,
            width: if data.width != 0.0 {
                data.width
            } else {
                create_rich_text_data(None).width
            },
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

    // A 4-line layout (12px per line, one char per line) used by the vertical
    // scroll tests.
    fn tall_layout() -> TextLayoutResult {
        let mut groups = Vec::new();
        for line in 0..4usize {
            groups.push(TextLayoutGroup {
                ascent: 10.0,
                descent: 2.0,
                end_index: line + 1,
                format: TextFormat::default(),
                height: 12.0,
                leading: 0.0,
                line_index: line,
                offset_x: 2.0,
                offset_y: 2.0 + line as f32 * 12.0,
                positions: vec![10.0],
                start_index: line,
                width: 10.0,
            });
        }
        TextLayoutResult {
            groups,
            line_ascents: vec![10.0, 10.0, 10.0, 10.0],
            line_descents: vec![2.0, 2.0, 2.0, 2.0],
            line_heights: vec![12.0, 12.0, 12.0, 12.0],
            line_leadings: vec![0.0, 0.0, 0.0, 0.0],
            line_widths: vec![10.0, 10.0, 10.0, 10.0],
            num_lines: 4,
            text_height: 48.0,
            text_width: 10.0,
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
                layout: None,
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
                ..Default::default()
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

    #[test]
    fn can_redo_text_input_states() {
        let mut none = with_text("abc");
        insert_text_input(&mut none, "X");
        assert!(!can_redo_text_input(&none));

        let mut undone = with_text("abc");
        insert_text_input(&mut undone, "X");
        undo_text_input(&mut undone);
        assert!(can_redo_text_input(&undone));
    }

    #[test]
    fn can_undo_text_input_states() {
        let fresh = with_text("abc");
        assert!(!can_undo_text_input(&fresh));

        let mut edited = with_text("abc");
        insert_text_input(&mut edited, "X");
        assert!(can_undo_text_input(&edited));
    }

    #[test]
    fn clear_text_input_history_resets_without_changing_text() {
        let mut text = with_text("abc");
        insert_text_input(&mut text, "X");
        assert!(can_undo_text_input(&text));
        clear_text_input_history(&mut text);
        assert!(!can_undo_text_input(&text));
        assert!(!can_redo_text_input(&text));
        assert_eq!(text.data.text, "Xabc");
    }

    #[test]
    fn delete_text_input_word_backward_deletes_word() {
        let mut text = with_text("hello world");
        set_text_input_selection(&mut text, 11, 11);
        delete_text_input_word_backward(&mut text);
        assert_eq!(text.data.text, "hello ");
        assert_eq!(get_text_input_caret_index(&text), 6);
    }

    #[test]
    fn delete_text_input_word_backward_crosses_whitespace() {
        let mut text = with_text("hello world");
        set_text_input_selection(&mut text, 6, 6);
        delete_text_input_word_backward(&mut text);
        assert_eq!(text.data.text, "world");
        assert_eq!(get_text_input_caret_index(&text), 0);
    }

    #[test]
    fn delete_text_input_word_backward_deletes_selection() {
        let mut text = with_text("hello world");
        set_text_input_selection(&mut text, 0, 5);
        delete_text_input_word_backward(&mut text);
        assert_eq!(text.data.text, " world");
    }

    #[test]
    fn delete_text_input_word_backward_noop_at_beginning() {
        let mut text = with_text("abc");
        set_text_input_selection(&mut text, 0, 0);
        delete_text_input_word_backward(&mut text);
        assert_eq!(text.data.text, "abc");
    }

    #[test]
    fn delete_text_input_word_forward_deletes_word() {
        let mut text = with_text("hello world");
        set_text_input_selection(&mut text, 6, 6);
        delete_text_input_word_forward(&mut text);
        assert_eq!(text.data.text, "hello ");
        assert_eq!(get_text_input_caret_index(&text), 6);
    }

    #[test]
    fn delete_text_input_word_forward_deletes_selection() {
        let mut text = with_text("hello world");
        set_text_input_selection(&mut text, 6, 11);
        delete_text_input_word_forward(&mut text);
        assert_eq!(text.data.text, "hello ");
    }

    #[test]
    fn delete_text_input_word_forward_noop_at_end() {
        let mut text = with_text("abc");
        set_text_input_selection(&mut text, 3, 3);
        delete_text_input_word_forward(&mut text);
        assert_eq!(text.data.text, "abc");
    }

    #[test]
    fn handle_text_input_keyboard_word_and_vertical() {
        let mut left = with_text("hello world");
        set_text_input_selection(&mut left, 11, 11);
        handle_text_input_keyboard(
            &mut left,
            &KeyboardEventData {
                ctrl_key: true,
                key: "ArrowLeft".to_string(),
                key_code: key_code::LEFT,
                ..Default::default()
            },
            None,
        );
        assert_eq!(get_text_input_caret_index(&left), 6);

        let mut right = with_text("hello world");
        set_text_input_selection(&mut right, 0, 0);
        handle_text_input_keyboard(
            &mut right,
            &KeyboardEventData {
                ctrl_key: true,
                key: "ArrowRight".to_string(),
                key_code: key_code::RIGHT,
                ..Default::default()
            },
            None,
        );
        assert_eq!(get_text_input_caret_index(&right), 5);

        let mut back = with_text("hello world");
        set_text_input_selection(&mut back, 11, 11);
        handle_text_input_keyboard(
            &mut back,
            &KeyboardEventData {
                ctrl_key: true,
                key: "Backspace".to_string(),
                key_code: key_code::BACKSPACE,
                ..Default::default()
            },
            None,
        );
        assert_eq!(back.data.text, "hello ");

        let mut del = with_text("hello world");
        set_text_input_selection(&mut del, 6, 6);
        handle_text_input_keyboard(
            &mut del,
            &KeyboardEventData {
                ctrl_key: true,
                key: "Delete".to_string(),
                key_code: key_code::DELETE,
                ..Default::default()
            },
            None,
        );
        assert_eq!(del.data.text, "hello ");
    }

    #[test]
    fn handle_text_input_keyboard_down_and_up_with_layout() {
        let mut down = create_input(
            RichTextData {
                multiline: true,
                text: "abcdefg".to_string(),
                ..Default::default()
            },
            TextInputOptions::default(),
        );
        set_text_input_selection(&mut down, 1, 1);
        handle_text_input_keyboard(
            &mut down,
            &keyboard("ArrowDown", key_code::DOWN),
            Some(&HandleTextInputKeyboardOptions {
                layout: Some(layout()),
                ..Default::default()
            }),
        );
        assert!(get_text_input_caret_index(&down) >= 3);

        let mut up = create_input(
            RichTextData {
                multiline: true,
                text: "abcdefg".to_string(),
                ..Default::default()
            },
            TextInputOptions::default(),
        );
        set_text_input_selection(&mut up, 5, 5);
        handle_text_input_keyboard(
            &mut up,
            &keyboard("ArrowUp", key_code::UP),
            Some(&HandleTextInputKeyboardOptions {
                layout: Some(layout()),
                ..Default::default()
            }),
        );
        assert!(get_text_input_caret_index(&up) <= 3);

        let mut down_last = with_text("abcdefg");
        set_text_input_selection(&mut down_last, 5, 5);
        handle_text_input_keyboard(
            &mut down_last,
            &keyboard("ArrowDown", key_code::DOWN),
            Some(&HandleTextInputKeyboardOptions {
                layout: Some(layout()),
                ..Default::default()
            }),
        );
        assert_eq!(get_text_input_caret_index(&down_last), 7);

        let mut up_first = with_text("abcdefg");
        set_text_input_selection(&mut up_first, 1, 1);
        handle_text_input_keyboard(
            &mut up_first,
            &keyboard("ArrowUp", key_code::UP),
            Some(&HandleTextInputKeyboardOptions {
                layout: Some(layout()),
                ..Default::default()
            }),
        );
        assert_eq!(get_text_input_caret_index(&up_first), 0);
    }

    #[test]
    fn handle_text_input_keyboard_unhandled_returns_false() {
        let mut text = with_text("abc");
        assert!(!handle_text_input_keyboard(
            &mut text,
            &keyboard("F1", 112),
            None
        ));
    }

    #[test]
    fn move_text_input_caret_resets_desired_caret_x() {
        let mut text = with_text("abc");
        get_input_state_mut(&mut text).desired_caret_x = 50.0;
        move_text_input_caret(&mut text, 1, false);
        assert_eq!(get_input_state(&text).desired_caret_x, -1.0);
    }

    #[test]
    fn move_text_input_caret_by_word_motion() {
        let mut back = with_text("hello world");
        set_text_input_selection(&mut back, 11, 11);
        move_text_input_caret_by_word(&mut back, -1, false);
        assert_eq!(get_text_input_caret_index(&back), 6);

        let mut fwd = with_text("hello world");
        set_text_input_selection(&mut fwd, 0, 0);
        move_text_input_caret_by_word(&mut fwd, 1, false);
        assert_eq!(get_text_input_caret_index(&fwd), 5);

        let mut ext = with_text("hello world");
        set_text_input_selection(&mut ext, 0, 0);
        move_text_input_caret_by_word(&mut ext, 1, true);
        assert_eq!(get_text_input_selection_begin_index(&ext), 0);
        assert_eq!(get_text_input_selection_end_index(&ext), 5);

        let mut clamp_start = with_text("hi");
        set_text_input_selection(&mut clamp_start, 1, 1);
        move_text_input_caret_by_word(&mut clamp_start, -1, false);
        assert_eq!(get_text_input_caret_index(&clamp_start), 0);

        let mut clamp_end = with_text("hi");
        set_text_input_selection(&mut clamp_end, 2, 2);
        move_text_input_caret_by_word(&mut clamp_end, 1, false);
        assert_eq!(get_text_input_caret_index(&clamp_end), 2);
    }

    #[test]
    fn move_text_input_caret_down_motion() {
        let mut next = create_input(
            RichTextData {
                multiline: true,
                text: "abcdefg".to_string(),
                ..Default::default()
            },
            TextInputOptions::default(),
        );
        set_text_input_selection(&mut next, 1, 1);
        move_text_input_caret_down(&mut next, Some(&layout()), false);
        assert!(get_text_input_caret_index(&next) >= 3);

        let mut last = with_text("abcdefg");
        set_text_input_selection(&mut last, 5, 5);
        move_text_input_caret_down(&mut last, Some(&layout()), false);
        assert_eq!(get_text_input_caret_index(&last), 7);

        let mut no_layout = with_text("abc");
        set_text_input_selection(&mut no_layout, 1, 1);
        move_text_input_caret_down(&mut no_layout, None, false);
        assert_eq!(get_text_input_caret_index(&no_layout), 3);

        let mut preserve = create_input(
            RichTextData {
                multiline: true,
                text: "abcdefg".to_string(),
                ..Default::default()
            },
            TextInputOptions::default(),
        );
        set_text_input_selection(&mut preserve, 1, 1);
        move_text_input_caret_down(&mut preserve, Some(&layout()), false);
        assert_ne!(get_input_state(&preserve).desired_caret_x, -1.0);

        let mut ext = create_input(
            RichTextData {
                multiline: true,
                text: "abcdefg".to_string(),
                ..Default::default()
            },
            TextInputOptions::default(),
        );
        set_text_input_selection(&mut ext, 1, 1);
        move_text_input_caret_down(&mut ext, Some(&layout()), true);
        assert_eq!(get_text_input_selection_begin_index(&ext), 1);
        assert!(get_text_input_selection_end_index(&ext) > 1);
    }

    #[test]
    fn move_text_input_caret_to_line_end_motion() {
        let mut text = create_input(
            RichTextData {
                multiline: true,
                text: "abcdefg".to_string(),
                ..Default::default()
            },
            TextInputOptions::default(),
        );
        set_text_input_selection(&mut text, 1, 1);
        move_text_input_caret_to_line_end(&mut text, Some(&layout()), false);
        assert_eq!(get_text_input_caret_index(&text), 3);

        let mut no_layout = with_text("abc");
        set_text_input_selection(&mut no_layout, 1, 1);
        move_text_input_caret_to_line_end(&mut no_layout, None, false);
        assert_eq!(get_text_input_caret_index(&no_layout), 3);

        let mut ext = create_input(
            RichTextData {
                multiline: true,
                text: "abcdefg".to_string(),
                ..Default::default()
            },
            TextInputOptions::default(),
        );
        set_text_input_selection(&mut ext, 1, 1);
        move_text_input_caret_to_line_end(&mut ext, Some(&layout()), true);
        assert_eq!(get_text_input_selection_begin_index(&ext), 1);
        assert_eq!(get_text_input_selection_end_index(&ext), 3);
    }

    #[test]
    fn move_text_input_caret_to_line_start_motion() {
        let mut text = create_input(
            RichTextData {
                multiline: true,
                text: "abcdefg".to_string(),
                ..Default::default()
            },
            TextInputOptions::default(),
        );
        set_text_input_selection(&mut text, 6, 6);
        move_text_input_caret_to_line_start(&mut text, Some(&layout()), false);
        assert_eq!(get_text_input_caret_index(&text), 3);

        let mut no_layout = with_text("abc");
        set_text_input_selection(&mut no_layout, 2, 2);
        move_text_input_caret_to_line_start(&mut no_layout, None, false);
        assert_eq!(get_text_input_caret_index(&no_layout), 0);

        let mut ext = create_input(
            RichTextData {
                multiline: true,
                text: "abcdefg".to_string(),
                ..Default::default()
            },
            TextInputOptions::default(),
        );
        set_text_input_selection(&mut ext, 6, 6);
        move_text_input_caret_to_line_start(&mut ext, Some(&layout()), true);
        assert_eq!(get_text_input_selection_begin_index(&ext), 3);
        assert_eq!(get_text_input_selection_end_index(&ext), 6);
    }

    #[test]
    fn move_text_input_caret_up_motion() {
        let mut prev = create_input(
            RichTextData {
                multiline: true,
                text: "abcdefg".to_string(),
                ..Default::default()
            },
            TextInputOptions::default(),
        );
        set_text_input_selection(&mut prev, 5, 5);
        move_text_input_caret_up(&mut prev, Some(&layout()), false);
        assert!(get_text_input_caret_index(&prev) <= 3);

        let mut first = with_text("abcdefg");
        set_text_input_selection(&mut first, 1, 1);
        move_text_input_caret_up(&mut first, Some(&layout()), false);
        assert_eq!(get_text_input_caret_index(&first), 0);

        let mut no_layout = with_text("abc");
        set_text_input_selection(&mut no_layout, 2, 2);
        move_text_input_caret_up(&mut no_layout, None, false);
        assert_eq!(get_text_input_caret_index(&no_layout), 0);
    }

    #[test]
    fn redo_text_input_reapplies() {
        let mut text = with_text("abc");
        insert_text_input(&mut text, "X");
        assert_eq!(text.data.text, "Xabc");
        undo_text_input(&mut text);
        assert_eq!(text.data.text, "abc");
        redo_text_input(&mut text);
        assert_eq!(text.data.text, "Xabc");

        let mut nothing = with_text("abc");
        insert_text_input(&mut nothing, "X");
        redo_text_input(&mut nothing);
        assert_eq!(nothing.data.text, "Xabc");

        let mut caret = with_text("abc");
        set_text_input_selection(&mut caret, 0, 0);
        insert_text_input(&mut caret, "X");
        undo_text_input(&mut caret);
        redo_text_input(&mut caret);
        assert_eq!(get_text_input_caret_index(&caret), 1);
    }

    #[test]
    fn scroll_text_input_caret_into_view_motion() {
        let mut down = create_input(
            RichTextData {
                auto_size: TextAutoSize::None,
                height: 28.0,
                multiline: true,
                text: "abcd".to_string(),
                width: 100.0,
                ..Default::default()
            },
            TextInputOptions::default(),
        );
        set_text_input_selection(&mut down, 4, 4);
        scroll_text_input_caret_into_view(&mut down, &tall_layout(), 100.0, 24.0);
        assert!(down.data.scroll_v > 1.0);

        let mut visible = create_input(
            RichTextData {
                auto_size: TextAutoSize::None,
                height: 60.0,
                multiline: true,
                text: "abcd".to_string(),
                width: 100.0,
                ..Default::default()
            },
            TextInputOptions::default(),
        );
        set_text_input_selection(&mut visible, 0, 0);
        scroll_text_input_caret_into_view(&mut visible, &tall_layout(), 100.0, 60.0);
        assert_eq!(visible.data.scroll_v, 1.0);
        assert_eq!(visible.data.scroll_h, 0.0);

        let mut horizontal = create_input(
            RichTextData {
                auto_size: TextAutoSize::None,
                height: 40.0,
                text: "abcdefg".to_string(),
                width: 20.0,
                ..Default::default()
            },
            TextInputOptions::default(),
        );
        set_text_input_selection(&mut horizontal, 7, 7);
        scroll_text_input_caret_into_view(&mut horizontal, &layout(), 20.0, 40.0);
        assert!(horizontal.data.scroll_h > 0.0);
    }

    #[test]
    fn undo_text_input_restores() {
        let mut basic = with_text("abc");
        insert_text_input(&mut basic, "X");
        assert_eq!(basic.data.text, "Xabc");
        undo_text_input(&mut basic);
        assert_eq!(basic.data.text, "abc");

        let mut nothing = with_text("abc");
        undo_text_input(&mut nothing);
        assert_eq!(nothing.data.text, "abc");

        let mut multi = with_text("");
        replace_text_input(
            &mut multi,
            0,
            0,
            "a",
            Some(&ReplaceTextInputOptions {
                merge_kind: None,
                ..Default::default()
            }),
        );
        replace_text_input(
            &mut multi,
            1,
            1,
            "b",
            Some(&ReplaceTextInputOptions {
                merge_kind: None,
                ..Default::default()
            }),
        );
        assert_eq!(multi.data.text, "ab");
        undo_text_input(&mut multi);
        assert_eq!(multi.data.text, "a");
        undo_text_input(&mut multi);
        assert_eq!(multi.data.text, "");

        let mut merged = with_text("");
        replace_text_input(
            &mut merged,
            0,
            0,
            "a",
            Some(&ReplaceTextInputOptions {
                merge_kind: Some("type".to_string()),
                ..Default::default()
            }),
        );
        replace_text_input(
            &mut merged,
            1,
            1,
            "b",
            Some(&ReplaceTextInputOptions {
                merge_kind: Some("type".to_string()),
                ..Default::default()
            }),
        );
        assert_eq!(merged.data.text, "ab");
        undo_text_input(&mut merged);
        assert_eq!(merged.data.text, "");

        let mut zero = create_input(
            RichTextData {
                text: "abc".to_string(),
                ..Default::default()
            },
            TextInputOptions {
                history_limit: Some(0),
                ..Default::default()
            },
        );
        insert_text_input(&mut zero, "X");
        assert!(!can_undo_text_input(&zero));
        undo_text_input(&mut zero);
        assert_eq!(zero.data.text, "Xabc");

        let mut caret = with_text("abc");
        set_text_input_selection(&mut caret, 1, 1);
        insert_text_input(&mut caret, "X");
        assert_eq!(get_text_input_caret_index(&caret), 2);
        undo_text_input(&mut caret);
        assert_eq!(get_text_input_caret_index(&caret), 1);
    }
}
