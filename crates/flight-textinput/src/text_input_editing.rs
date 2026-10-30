//! flight-compiler: root-only appendTextInput applyTextInputRestriction canRedoTextInput canUndoTextInput clearTextInputHistory deleteTextInputBackward deleteTextInputForward deleteTextInputWordBackward deleteTextInputWordForward getTextInputCaretIndex getTextInputCaretRectangle getTextInputCharacterIndexAtPoint getTextInputDisplayText getTextInputSelectionBeginIndex getTextInputSelectionEndIndex getTextInputSelectionRectangles getTextInputSelectionText handleTextInputKeyboard insertTextInput moveTextInputCaret moveTextInputCaretByWord moveTextInputCaretDown moveTextInputCaretToLineEnd moveTextInputCaretToLineStart moveTextInputCaretUp redoTextInput replaceSelectedTextInput replaceTextInput scrollTextInputCaretIntoView selectAllTextInput selectLineAtTextInputIndex selectWordAtTextInputIndex setTextInputSelection undoTextInput

use std::sync::{Arc, RwLock};

use flight_entity::{Ref, throw_error};
use flight_input::InputKeyboardData;
use flight_input::{
    KEY_CODE_A, KEY_CODE_BACKSPACE, KEY_CODE_C, KEY_CODE_DELETE, KEY_CODE_DOWN, KEY_CODE_END,
    KEY_CODE_HOME, KEY_CODE_LEFT, KEY_CODE_RETURN, KEY_CODE_RIGHT, KEY_CODE_UP, KEY_CODE_V,
    KEY_CODE_X,
};
use flight_node::{NodeRef, invalidate_node_appearance, invalidate_node_local_content};
use flight_text::contract::{set_rich_text_scroll_h, set_rich_text_scroll_v};
use flight_text::{RichText, TextInputHistoryEntry, TextInputState};
use flight_textformat::create_text_format_range;
use flight_textformat::{TextFormat, TextFormatRange};
use flight_textlayout::{
    TEXT_BOUNDS_GUTTER, TextLayoutGroup, TextLayoutResult, TextSelectionRectangle,
    get_rich_text_selection_rectangles,
};
use flight_textsegment::{
    TextSegment, WEB_TEXT_SEGMENTER_BACKEND, get_next_grapheme_boundary,
    get_previous_grapheme_boundary, get_word_range_at, segment_words,
};

use crate::text_input::get_text_input_state;
use crate::text_units::{utf16_len, utf16_replace, utf16_slice};
use crate::types::{HandleTextInputKeyboardOptions, ReplaceTextInputOptions};

const DESIRED_CARET_X_UNSET: f32 = -1.0;

fn create_text_selection_rectangle() -> TextSelectionRectangle {
    return TextSelectionRectangle {
        height: 0.0,
        line_index: 0,
        width: 0.0,
        x: 0.0,
        y: 0.0,
    };
}

fn add_signed(value: usize, offset: isize) -> usize {
    return if offset < 0 {
        value.saturating_sub((-offset) as usize)
    } else {
        value + offset as usize
    };
}

fn adjust_text_format_ranges(
    ranges: &mut Vec<TextFormatRange>,
    default_format: &Ref<TextFormat>,
    begin_index: usize,
    end_index: usize,
    insert_length: usize,
) {
    let remove_length = end_index - begin_index;
    let offset = insert_length as isize - remove_length as isize;
    let mut index = 0;
    while index < ranges.len() {
        let range = &mut ranges[index];
        let mut remove = false;
        if begin_index == end_index {
            if range.end < begin_index {
            } else if range.start >= begin_index {
                range.start = add_signed(range.start, offset);
                range.end = add_signed(range.end, offset);
            } else if range.start < begin_index && range.end >= begin_index {
                range.end = add_signed(range.end, offset);
            }
        } else if range.end <= begin_index {
        } else if range.start > end_index {
            range.start = add_signed(range.start, offset);
            range.end = add_signed(range.end, offset);
        } else if range.start <= begin_index && range.end > end_index {
            range.end = add_signed(range.end, offset);
        } else if range.start >= begin_index && range.end <= end_index {
            remove = true;
        } else if range.end > end_index && range.start > begin_index && range.start <= end_index {
            range.start = begin_index;
            range.end = add_signed(range.end, offset);
        } else if range.start < begin_index && range.end > begin_index && range.end <= end_index {
            range.end = begin_index;
        }
        if remove {
            ranges.remove(index);
        } else {
            index += 1;
        }
    }
    ranges.retain(|range| range.start < range.end);
    if ranges.is_empty() && insert_length > 0 {
        let format = Arc::new(RwLock::new(default_format.read().unwrap().clone()));
        ranges.push(create_text_format_range(
            format,
            begin_index,
            begin_index + insert_length,
        ));
    }
}

pub fn append_text_input(source: &Ref<RichText>, text: &str) {
    let length = utf16_len(&source.read().unwrap().data.text);
    replace_text_input(source, length as i32, length as i32, text, None);
}

fn apply_history_record(
    source: &Ref<RichText>,
    state: &Ref<TextInputState>,
    text: &str,
    caret_index: usize,
    selection_index: usize,
) {
    source.write().unwrap().data.text = text.to_string();
    let length = utf16_len(text);
    let mut state = state.write().unwrap();
    state.caret_index = caret_index.min(length);
    state.selection_index = selection_index.min(length);
    state.desired_caret_x = DESIRED_CARET_X_UNSET;
    drop(state);
    invalidate_local_content(source);
}

pub fn apply_text_input_restriction(
    source: &Ref<RichText>,
    text: &str,
    replace_length: usize,
) -> String {
    let (multiline, max_chars, current_length) = {
        let source = source.read().unwrap();
        (
            source.data.multiline,
            source.data.max_chars,
            utf16_len(&source.data.text),
        )
    };
    let mut value = if multiline {
        text.to_string()
    } else {
        text.chars()
            .filter(|character| *character != '\n' && *character != '\r')
            .collect::<String>()
    };
    let restrict = get_input_state(source).read().unwrap().restrict.clone();
    value = restrict_text_input(&value, &restrict);
    if max_chars > 0 {
        let max_length = max_chars as isize - current_length as isize + replace_length as isize;
        if max_length <= 0 {
            return String::new();
        }
        if utf16_len(&value) > max_length as usize {
            value = utf16_slice(&value, 0, max_length as usize);
        }
    }
    return value;
}

pub fn can_redo_text_input(source: &Ref<RichText>) -> bool {
    let state = get_input_state(source);
    let state = state.read().unwrap();
    return state.history_index < state.history.len() as i32 - 1;
}

pub fn can_undo_text_input(source: &Ref<RichText>) -> bool {
    return get_input_state(source).read().unwrap().history_index >= 0;
}

fn clamp_index(value: i32, length: usize) -> usize {
    if value <= 0 {
        return 0;
    }
    return (value as usize).min(length);
}

pub fn clear_text_input_history(source: &Ref<RichText>) {
    let state = get_input_state(source);
    let mut state = state.write().unwrap();
    state.history = Vec::new();
    state.history_index = -1;
}

pub fn delete_text_input_backward(source: &Ref<RichText>) {
    let start = get_text_input_selection_begin_index(source);
    let end = get_text_input_selection_end_index(source);
    if start != end {
        replace_text_input(source, start as i32, end as i32, "", None);
    } else if start > 0 {
        let text = source.read().unwrap().data.text.clone();
        let previous = get_previous_grapheme_boundary(
            &WEB_TEXT_SEGMENTER_BACKEND,
            &text,
            usize_to_i32(start),
            None,
        );
        replace_text_input(source, previous as i32, start as i32, "", None);
    }
    let state = get_input_state(source);
    let caret = state.read().unwrap().caret_index;
    state.write().unwrap().selection_index = caret;
}

pub fn delete_text_input_forward(source: &Ref<RichText>) {
    let start = get_text_input_selection_begin_index(source);
    let end = get_text_input_selection_end_index(source);
    if start != end {
        replace_text_input(source, start as i32, end as i32, "", None);
    } else {
        let text = source.read().unwrap().data.text.clone();
        if start < utf16_len(&text) {
            let next = get_next_grapheme_boundary(
                &WEB_TEXT_SEGMENTER_BACKEND,
                &text,
                usize_to_i32(start),
                None,
            );
            replace_text_input(source, start as i32, next as i32, "", None);
        }
    }
}

pub fn delete_text_input_word_backward(source: &Ref<RichText>) {
    let start = get_text_input_selection_begin_index(source);
    let end = get_text_input_selection_end_index(source);
    if start != end {
        replace_text_input(source, start as i32, end as i32, "", None);
        return;
    }
    let text = source.read().unwrap().data.text.clone();
    let word_start = find_word_start_before(&text, start);
    if word_start < start {
        replace_text_input(source, word_start as i32, start as i32, "", None);
    }
}

pub fn delete_text_input_word_forward(source: &Ref<RichText>) {
    let start = get_text_input_selection_begin_index(source);
    let end = get_text_input_selection_end_index(source);
    if start != end {
        replace_text_input(source, start as i32, end as i32, "", None);
        return;
    }
    let text = source.read().unwrap().data.text.clone();
    let word_end = find_word_end_after(&text, start);
    if word_end > start {
        replace_text_input(source, start as i32, word_end as i32, "", None);
    }
}

fn find_word_end_after(text: &str, index: usize) -> usize {
    let length = utf16_len(text);
    let clamped = index.min(length);
    let mut segments: Vec<TextSegment> = Vec::new();
    segment_words(&mut segments, &WEB_TEXT_SEGMENTER_BACKEND, text, None);
    for segment in segments {
        if segment.is_word_like == Some(true) && segment.end > clamped {
            return segment.end;
        }
    }
    return length;
}

fn find_word_start_before(text: &str, index: usize) -> usize {
    let clamped = index.min(utf16_len(text));
    let mut segments: Vec<TextSegment> = Vec::new();
    segment_words(&mut segments, &WEB_TEXT_SEGMENTER_BACKEND, text, None);
    for segment in segments.iter().rev() {
        if segment.is_word_like == Some(true) && segment.start < clamped {
            return segment.start;
        }
    }
    return 0;
}

fn get_caret_line_index(source: &Ref<RichText>, layout: &TextLayoutResult) -> usize {
    let mut out = create_text_selection_rectangle();
    get_text_input_caret_rectangle(&mut out, source, layout);
    return out.line_index;
}

fn get_fallback_line_height(layout: &TextLayoutResult) -> f32 {
    let line_heights: &Vec<f32> = &layout.line_heights;
    return line_heights.first().copied().unwrap_or(12.0);
}

fn get_input_state(source: &Ref<RichText>) -> Ref<TextInputState> {
    if let Some(state) = get_text_input_state(source) {
        return state;
    }
    throw_error("text input is not enabled on this RichText; call enableTextInput first")
}

fn get_keyboard_command(data: &InputKeyboardData) -> KeyboardCommand {
    if data.ctrl_key || data.meta_key {
        let key: String = data.key.clone();
        let key = key.to_ascii_lowercase();
        if key == "a" || data.key_code == KEY_CODE_A {
            return KeyboardCommand::SelectAll;
        }
        if key == "c" || data.key_code == KEY_CODE_C {
            return KeyboardCommand::Copy;
        }
        if key == "v" || data.key_code == KEY_CODE_V {
            return KeyboardCommand::Paste;
        }
        if key == "x" || data.key_code == KEY_CODE_X {
            return KeyboardCommand::Cut;
        }
        if data.key_code == KEY_CODE_LEFT || data.key == "ArrowLeft" {
            return KeyboardCommand::WordLeft;
        }
        if data.key_code == KEY_CODE_RIGHT || data.key == "ArrowRight" {
            return KeyboardCommand::WordRight;
        }
        if data.key_code == KEY_CODE_BACKSPACE || data.key == "Backspace" {
            return KeyboardCommand::DeleteWordBackward;
        }
        if data.key_code == KEY_CODE_DELETE || data.key == "Delete" {
            return KeyboardCommand::DeleteWordForward;
        }
        if data.key_code == KEY_CODE_HOME || data.key == "Home" {
            return KeyboardCommand::DocumentStart;
        }
        if data.key_code == KEY_CODE_END || data.key == "End" {
            return KeyboardCommand::DocumentEnd;
        }
        return KeyboardCommand::None;
    }
    if data.alt_key {
        if data.key_code == KEY_CODE_LEFT || data.key == "ArrowLeft" {
            return KeyboardCommand::WordLeft;
        }
        if data.key_code == KEY_CODE_RIGHT || data.key == "ArrowRight" {
            return KeyboardCommand::WordRight;
        }
        if data.key_code == KEY_CODE_BACKSPACE || data.key == "Backspace" {
            return KeyboardCommand::DeleteWordBackward;
        }
        if data.key_code == KEY_CODE_DELETE || data.key == "Delete" {
            return KeyboardCommand::DeleteWordForward;
        }
    }
    if data.key_code == KEY_CODE_BACKSPACE || data.key == "Backspace" {
        return KeyboardCommand::Backspace;
    }
    if data.key_code == KEY_CODE_DELETE || data.key == "Delete" {
        return KeyboardCommand::Delete;
    }
    if data.key_code == KEY_CODE_DOWN || data.key == "ArrowDown" {
        return KeyboardCommand::Down;
    }
    if data.key_code == KEY_CODE_END || data.key == "End" {
        return KeyboardCommand::End;
    }
    if data.key_code == KEY_CODE_HOME || data.key == "Home" {
        return KeyboardCommand::Home;
    }
    if data.key_code == KEY_CODE_LEFT || data.key == "ArrowLeft" {
        return KeyboardCommand::Left;
    }
    if data.key_code == KEY_CODE_RETURN || data.key == "Enter" {
        return KeyboardCommand::Return;
    }
    if data.key_code == KEY_CODE_RIGHT || data.key == "ArrowRight" {
        return KeyboardCommand::Right;
    }
    if data.key_code == KEY_CODE_UP || data.key == "ArrowUp" {
        return KeyboardCommand::Up;
    }
    return KeyboardCommand::None;
}

fn get_line_end_index(layout: &TextLayoutResult, line_index: usize, text_length: usize) -> usize {
    let mut end = None;
    for group in &layout.groups {
        if group.line_index == line_index {
            end = Some(end.unwrap_or(0).max(group.end_index));
        }
    }
    return end.unwrap_or(text_length);
}

fn get_line_offset_y(layout: &TextLayoutResult, line_index: usize) -> f32 {
    for group in &layout.groups {
        if group.line_index == line_index {
            return group.offset_y;
        }
    }
    let mut y = TEXT_BOUNDS_GUTTER;
    let line_heights: &Vec<f32> = &layout.line_heights;
    for index in 0..line_index {
        y += line_heights.get(index).copied().unwrap_or(0.0);
    }
    return y;
}

fn get_line_start_index(layout: &TextLayoutResult, line_index: usize) -> usize {
    let mut start: Option<usize> = None;
    for group in &layout.groups {
        if group.line_index == line_index {
            if let Some(previous_start) = start {
                start = Some(previous_start.min(group.start_index));
            } else {
                start = Some(group.start_index);
            }
        }
    }
    return start.unwrap_or(0);
}

pub fn get_text_input_caret_index(source: &Ref<RichText>) -> usize {
    let length = utf16_len(&source.read().unwrap().data.text);
    return get_input_state(source)
        .read()
        .unwrap()
        .caret_index
        .min(length);
}

pub fn get_text_input_caret_rectangle(
    out: &mut TextSelectionRectangle,
    source: &Ref<RichText>,
    layout: &TextLayoutResult,
) {
    let caret_index = get_text_input_caret_index(source);
    let Some(group) = get_text_layout_group_at_index(layout, caret_index) else {
        out.x = TEXT_BOUNDS_GUTTER;
        out.y = TEXT_BOUNDS_GUTTER;
        out.width = 1.0;
        out.height = get_fallback_line_height(layout);
        out.line_index = 0;
        return;
    };
    out.x = get_text_layout_group_caret_x(group, caret_index);
    out.y = group.offset_y;
    out.width = 1.0;
    out.height = group.height;
    out.line_index = group.line_index;
}

pub fn get_text_input_character_index_at_point(
    source: &Ref<RichText>,
    layout: &TextLayoutResult,
    x: f32,
    y: f32,
) -> usize {
    if layout.groups.is_empty() {
        return 0;
    }
    let mut closest_line_index = 0;
    let mut closest_line_distance = f32::INFINITY;
    for index in 0..layout.line_heights.len() {
        let line_top = get_line_offset_y(layout, index);
        let line_bottom = line_top + layout.line_heights[index];
        let distance = if y < line_top {
            line_top - y
        } else if y > line_bottom {
            y - line_bottom
        } else {
            0.0
        };
        if distance < closest_line_distance {
            closest_line_distance = distance;
            closest_line_index = index;
        }
    }
    let mut line_start = utf16_len(&source.read().unwrap().data.text);
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
    return if line_end > 0 { line_end } else { line_start };
}

pub fn get_text_input_display_text(source: &Ref<RichText>) -> String {
    let state = get_input_state(source);
    let state = state.read().unwrap();
    let text = source.read().unwrap().data.text.clone();
    if !state.display_as_password {
        return text;
    }
    let password_character: String = if state.password_character.is_empty() {
        "•".to_string()
    } else {
        utf16_slice(&state.password_character, 0, 1)
    };
    return password_character.repeat(utf16_len(&text));
}

pub fn get_text_input_selection_begin_index(source: &Ref<RichText>) -> usize {
    let length = utf16_len(&source.read().unwrap().data.text);
    let state = get_input_state(source);
    let state = state.read().unwrap();
    return state
        .caret_index
        .min(length)
        .min(state.selection_index.min(length));
}

pub fn get_text_input_selection_end_index(source: &Ref<RichText>) -> usize {
    let length = utf16_len(&source.read().unwrap().data.text);
    let state = get_input_state(source);
    let state = state.read().unwrap();
    return state
        .caret_index
        .min(length)
        .max(state.selection_index.min(length));
}

pub fn get_text_input_selection_rectangles(
    out: &mut Vec<TextSelectionRectangle>,
    source: &Ref<RichText>,
    layout: &TextLayoutResult,
) {
    get_rich_text_selection_rectangles(
        out,
        get_text_input_selection_begin_index(source),
        get_text_input_selection_end_index(source),
        layout,
    );
}

pub fn get_text_input_selection_text(source: &Ref<RichText>) -> String {
    let text = source.read().unwrap().data.text.clone();
    return utf16_slice(
        &text,
        get_text_input_selection_begin_index(source),
        get_text_input_selection_end_index(source),
    );
}

fn get_text_layout_group_at_index(
    layout: &TextLayoutResult,
    index: usize,
) -> Option<&TextLayoutGroup> {
    let groups: &Vec<TextLayoutGroup> = &layout.groups;
    for group in groups {
        if index >= group.start_index && index <= group.end_index {
            return Some(group);
        }
    }
    return groups.last();
}

fn get_text_layout_group_caret_x(group: &TextLayoutGroup, index: usize) -> f32 {
    let mut x = group.offset_x;
    let limit = index.min(group.end_index).saturating_sub(group.start_index);
    let positions: &Vec<f32> = &group.positions;
    for position_index in 0..limit {
        x += positions.get(position_index).copied().unwrap_or(0.0);
    }
    return x;
}

fn get_text_layout_group_character_index_at_x(group: &TextLayoutGroup, x: f32) -> usize {
    let mut current_x = group.offset_x;
    for (index, advance) in group.positions.iter().enumerate() {
        if x < current_x + *advance / 2.0 {
            return group.start_index + index;
        }
        current_x += *advance;
    }
    return group.end_index;
}

pub fn handle_text_input_keyboard(
    source: &Ref<RichText>,
    data: &InputKeyboardData,
    options: Option<&HandleTextInputKeyboardOptions>,
) -> bool {
    let command = get_keyboard_command(data);
    match command {
        KeyboardCommand::None => {}
        KeyboardCommand::Backspace => delete_text_input_backward(source),
        KeyboardCommand::Copy => {
            let copy_text = get_text_input_selection_text(source);
            if !copy_text.is_empty() {
                if let Some(on_copy) = options.and_then(|options| options.on_copy.as_ref()) {
                    on_copy(&copy_text);
                }
            }
        }
        KeyboardCommand::Cut => {
            let cut_text = get_text_input_selection_text(source);
            if !cut_text.is_empty() {
                if let Some(on_copy) = options.and_then(|options| options.on_copy.as_ref()) {
                    on_copy(&cut_text);
                }
                replace_selected_text_input(source, "", None);
            }
        }
        KeyboardCommand::Delete => delete_text_input_forward(source),
        KeyboardCommand::DeleteWordBackward => delete_text_input_word_backward(source),
        KeyboardCommand::DeleteWordForward => delete_text_input_word_forward(source),
        KeyboardCommand::DocumentEnd => {
            let length = utf16_len(&source.read().unwrap().data.text);
            move_text_input_caret(source, length as i32, data.shift_key);
        }
        KeyboardCommand::DocumentStart => move_text_input_caret(source, 0, data.shift_key),
        KeyboardCommand::Down => {
            let down_layout = options.and_then(|options| options.layout.as_ref());
            if let Some(down_layout) = down_layout {
                move_text_input_caret_down(
                    source,
                    Some(&down_layout.read().unwrap()),
                    data.shift_key,
                );
            } else {
                move_text_input_caret_down(source, None, data.shift_key);
            }
        }
        KeyboardCommand::End => {
            let end_layout = options.and_then(|options| options.layout.as_ref());
            if let Some(end_layout) = end_layout {
                move_text_input_caret_to_line_end(
                    source,
                    Some(&end_layout.read().unwrap()),
                    data.shift_key,
                );
            } else {
                move_text_input_caret_to_line_end(source, None, data.shift_key);
            }
        }
        KeyboardCommand::Home => {
            let home_layout = options.and_then(|options| options.layout.as_ref());
            if let Some(home_layout) = home_layout {
                move_text_input_caret_to_line_start(
                    source,
                    Some(&home_layout.read().unwrap()),
                    data.shift_key,
                );
            } else {
                move_text_input_caret_to_line_start(source, None, data.shift_key);
            }
        }
        KeyboardCommand::Left => {
            let left_text = source.read().unwrap().data.text.clone();
            let left_caret = get_text_input_caret_index(source);
            let previous = get_previous_grapheme_boundary(
                &WEB_TEXT_SEGMENTER_BACKEND,
                &left_text,
                usize_to_i32(left_caret),
                None,
            );
            move_text_input_caret(source, previous as i32, data.shift_key);
        }
        KeyboardCommand::Paste => insert_text_input(
            source,
            options
                .and_then(|options| options.clipboard_text.as_deref())
                .unwrap_or(""),
        ),
        KeyboardCommand::Return => {
            if !source.read().unwrap().data.multiline {
                return false;
            }
            insert_text_input(source, "\n");
        }
        KeyboardCommand::Right => {
            let right_text = source.read().unwrap().data.text.clone();
            let right_caret = get_text_input_caret_index(source);
            let next = get_next_grapheme_boundary(
                &WEB_TEXT_SEGMENTER_BACKEND,
                &right_text,
                usize_to_i32(right_caret),
                None,
            );
            move_text_input_caret(source, next as i32, data.shift_key);
        }
        KeyboardCommand::SelectAll => select_all_text_input(source),
        KeyboardCommand::Up => {
            let up_layout = options.and_then(|options| options.layout.as_ref());
            if let Some(up_layout) = up_layout {
                move_text_input_caret_up(source, Some(&up_layout.read().unwrap()), data.shift_key);
            } else {
                move_text_input_caret_up(source, None, data.shift_key);
            }
        }
        KeyboardCommand::WordLeft => move_text_input_caret_by_word(source, -1, data.shift_key),
        KeyboardCommand::WordRight => move_text_input_caret_by_word(source, 1, data.shift_key),
    }
    return command != KeyboardCommand::None;
}

pub fn insert_text_input(source: &Ref<RichText>, text: &str) {
    let options = ReplaceTextInputOptions {
        apply_input_rules: Some(true),
        merge_kind: None,
        skip_history: None,
    };
    replace_selected_text_input(source, text, Some(&options));
}

fn invalidate_appearance(source: &Ref<RichText>) {
    let node: NodeRef = source.clone();
    invalidate_node_appearance(&node);
}

fn invalidate_local_content(source: &Ref<RichText>) {
    let node: NodeRef = source.clone();
    invalidate_node_local_content(&node);
}

fn matches_restrict_ranges(character: char, ranges: &str) -> bool {
    let range_characters: Vec<char> = ranges.chars().collect();
    let mut index = 0;
    while index < range_characters.len() {
        let current = range_characters[index];
        if current == '\\' && index + 1 < range_characters.len() {
            if character == range_characters[index + 1] {
                return true;
            }
            index += 2;
            continue;
        }
        if index + 2 < range_characters.len() && range_characters[index + 1] == '-' {
            let end = range_characters[index + 2];
            if character >= current && character <= end {
                return true;
            }
            index += 3;
            continue;
        }
        if character == current {
            return true;
        }
        index += 1;
    }
    return false;
}

pub fn move_text_input_caret(source: &Ref<RichText>, index: i32, extend_selection: bool) {
    let length = utf16_len(&source.read().unwrap().data.text);
    let caret = clamp_index(index, length);
    let state = get_input_state(source);
    let mut state = state.write().unwrap();
    state.caret_index = caret;
    if !extend_selection {
        state.selection_index = caret;
    }
    state.desired_caret_x = DESIRED_CARET_X_UNSET;
    drop(state);
    invalidate_appearance(source);
}

pub fn move_text_input_caret_by_word(
    source: &Ref<RichText>,
    direction: i32,
    extend_selection: bool,
) {
    let caret_index = get_text_input_caret_index(source);
    let text = source.read().unwrap().data.text.clone();
    let target = if direction < 0 {
        find_word_start_before(&text, caret_index)
    } else {
        find_word_end_after(&text, caret_index)
    };
    move_text_input_caret(source, target as i32, extend_selection);
}

pub fn move_text_input_caret_down(
    source: &Ref<RichText>,
    layout: Option<&TextLayoutResult>,
    extend_selection: bool,
) {
    let Some(layout) = layout else {
        let length = utf16_len(&source.read().unwrap().data.text);
        move_text_input_caret(source, length as i32, extend_selection);
        return;
    };
    let state = get_input_state(source);
    let mut out = create_text_selection_rectangle();
    get_text_input_caret_rectangle(&mut out, source, layout);
    let desired_x = {
        let mut state = state.write().unwrap();
        if state.desired_caret_x == DESIRED_CARET_X_UNSET {
            state.desired_caret_x = out.x;
        }
        state.desired_caret_x
    };
    let target_line_index = out.line_index + 1;
    if target_line_index >= layout.num_lines {
        let length = utf16_len(&source.read().unwrap().data.text);
        move_text_input_caret(source, length as i32, extend_selection);
        return;
    }
    let target_y =
        get_line_offset_y(layout, target_line_index) + layout.line_heights[target_line_index] / 2.0;
    let target_index = get_text_input_character_index_at_point(source, layout, desired_x, target_y);
    let length = utf16_len(&source.read().unwrap().data.text);
    let new_caret = target_index.min(length);
    let mut state = state.write().unwrap();
    state.caret_index = new_caret;
    if !extend_selection {
        state.selection_index = new_caret;
    }
    drop(state);
    invalidate_appearance(source);
}

pub fn move_text_input_caret_to_line_end(
    source: &Ref<RichText>,
    layout: Option<&TextLayoutResult>,
    extend_selection: bool,
) {
    let text_length = utf16_len(&source.read().unwrap().data.text);
    let Some(layout) = layout else {
        move_text_input_caret(source, text_length as i32, extend_selection);
        return;
    };
    let line_index = get_caret_line_index(source, layout);
    move_text_input_caret(
        source,
        get_line_end_index(layout, line_index, text_length) as i32,
        extend_selection,
    );
}

pub fn move_text_input_caret_to_line_start(
    source: &Ref<RichText>,
    layout: Option<&TextLayoutResult>,
    extend_selection: bool,
) {
    let Some(layout) = layout else {
        move_text_input_caret(source, 0, extend_selection);
        return;
    };
    let line_index = get_caret_line_index(source, layout);
    move_text_input_caret(
        source,
        get_line_start_index(layout, line_index) as i32,
        extend_selection,
    );
}

pub fn move_text_input_caret_up(
    source: &Ref<RichText>,
    layout: Option<&TextLayoutResult>,
    extend_selection: bool,
) {
    let Some(layout) = layout else {
        move_text_input_caret(source, 0, extend_selection);
        return;
    };
    let state = get_input_state(source);
    let mut out = create_text_selection_rectangle();
    get_text_input_caret_rectangle(&mut out, source, layout);
    let desired_x = {
        let mut state = state.write().unwrap();
        if state.desired_caret_x == DESIRED_CARET_X_UNSET {
            state.desired_caret_x = out.x;
        }
        state.desired_caret_x
    };
    if out.line_index == 0 {
        move_text_input_caret(source, 0, extend_selection);
        return;
    }
    let target_line_index = out.line_index - 1;
    let target_y =
        get_line_offset_y(layout, target_line_index) + layout.line_heights[target_line_index] / 2.0;
    let target_index = get_text_input_character_index_at_point(source, layout, desired_x, target_y);
    let length = utf16_len(&source.read().unwrap().data.text);
    let new_caret = target_index.min(length);
    let mut state = state.write().unwrap();
    state.caret_index = new_caret;
    if !extend_selection {
        state.selection_index = new_caret;
    }
    drop(state);
    invalidate_appearance(source);
}

fn record_text_input_edit(
    state: &mut TextInputState,
    text_before: &str,
    text_after: &str,
    caret_index_before: usize,
    selection_index_before: usize,
    merge_kind: Option<&str>,
) {
    if state.history_index < state.history.len() as i32 - 1 {
        let history_index = (state.history_index + 1).max(0) as usize;
        let history: &mut Vec<TextInputHistoryEntry> = &mut state.history;
        history.truncate(history_index);
    }
    if state.history_index >= 0 {
        let previous = &mut state.history[state.history_index as usize];
        if merge_kind.is_some() && previous.merge_kind.as_deref() == merge_kind {
            previous.text_after = text_after.to_string();
            previous.caret_index_after = state.caret_index;
            previous.selection_index_after = state.selection_index;
            return;
        }
    }
    state.history.push(TextInputHistoryEntry {
        caret_index_after: state.caret_index,
        caret_index_before,
        merge_kind: merge_kind.map(|value| value.to_string()),
        selection_index_after: state.selection_index,
        selection_index_before,
        text_after: text_after.to_string(),
        text_before: text_before.to_string(),
    });
    state.history_index = state.history.len() as i32 - 1;
    if state.history.len() > state.history_limit {
        let overflow = state.history.len() - state.history_limit;
        let history: &mut Vec<TextInputHistoryEntry> = &mut state.history;
        history.drain(0..overflow);
        state.history_index = history.len() as i32 - 1;
    }
}

pub fn redo_text_input(source: &Ref<RichText>) {
    let state = get_input_state(source);
    let mut state_guard = state.write().unwrap();
    if state_guard.history_index >= state_guard.history.len() as i32 - 1 {
        return;
    }
    state_guard.history_index += 1;
    let record = state_guard.history[state_guard.history_index as usize].clone();
    drop(state_guard);
    apply_history_record(
        source,
        &state,
        &record.text_after,
        record.caret_index_after,
        record.selection_index_after,
    );
}

pub fn replace_selected_text_input(
    source: &Ref<RichText>,
    text: &str,
    options: Option<&ReplaceTextInputOptions>,
) {
    replace_text_input(
        source,
        get_text_input_selection_begin_index(source) as i32,
        get_text_input_selection_end_index(source) as i32,
        text,
        options,
    );
}

pub fn replace_text_input(
    source: &Ref<RichText>,
    begin_index: i32,
    end_index: i32,
    text: &str,
    options: Option<&ReplaceTextInputOptions>,
) {
    let text_before = source.read().unwrap().data.text.clone();
    let length = utf16_len(&text_before);
    let mut start = clamp_index(begin_index, length);
    let mut end = clamp_index(end_index, length);
    if end < start {
        let previous_start = start;
        start = end;
        end = previous_start;
    }
    let value = if options
        .and_then(|options| options.apply_input_rules)
        .unwrap_or(false)
    {
        apply_text_input_restriction(source, text, end - start)
    } else {
        text.to_string()
    };
    if value.is_empty() && start == end {
        return;
    }
    let state = get_input_state(source);
    let (caret_before, selection_before) = {
        let state_guard = state.read().unwrap();
        (
            state_guard.caret_index.min(length),
            state_guard.selection_index.min(length),
        )
    };
    let text_after = utf16_replace(&text_before, start, end, &value);
    let insert_length = utf16_len(&value);
    let mut source_state = source.write().unwrap();
    source_state.data.text = text_after.clone();
    let default_format = source_state.data.default_text_format.clone();
    adjust_text_format_ranges(
        &mut source_state.data.text_format_ranges,
        &default_format,
        start,
        end,
        insert_length,
    );
    drop(source_state);
    let mut input_state = state.write().unwrap();
    input_state.desired_caret_x = DESIRED_CARET_X_UNSET;
    input_state.selection_index = start + insert_length;
    input_state.caret_index = start + insert_length;
    drop(input_state);
    invalidate_appearance(source);
    let mut history_state = state.write().unwrap();
    if !options
        .and_then(|options| options.skip_history)
        .unwrap_or(false)
        && history_state.history_limit > 0
    {
        record_text_input_edit(
            &mut history_state,
            &text_before,
            &text_after,
            caret_before,
            selection_before,
            options.and_then(|options| options.merge_kind.as_deref()),
        );
    }
    drop(history_state);
    invalidate_local_content(source);
}

fn restrict_text_input(text: &str, restrict: &str) -> String {
    if restrict.is_empty() || text.is_empty() {
        return text.to_string();
    }
    let (accepted, declined) = split_restrict_ranges(restrict);
    let mut out = String::new();
    for character in text.chars() {
        let accepted_match = accepted.is_empty() || matches_restrict_ranges(character, &accepted);
        let declined_match = !declined.is_empty() && matches_restrict_ranges(character, &declined);
        if accepted_match && !declined_match {
            out.push(character);
        }
    }
    return out;
}

pub fn scroll_text_input_caret_into_view(
    source: &Ref<RichText>,
    layout: &TextLayoutResult,
    viewport_width: f32,
    viewport_height: f32,
) {
    let mut out = create_text_selection_rectangle();
    get_text_input_caret_rectangle(&mut out, source, layout);
    let caret_top = out.y;
    let caret_bottom = out.y + out.height;
    let (scroll_v, scroll_h) = {
        let source = source.read().unwrap();
        (source.data.scroll_v, source.data.scroll_h)
    };
    let scroll_v_line = (scroll_v as i32 - 1).max(0) as usize;
    let mut view_top = 0.0;
    let line_heights: &Vec<f32> = &layout.line_heights;
    for index in 0..scroll_v_line {
        view_top += line_heights.get(index).copied().unwrap_or(0.0);
    }
    let view_bottom = view_top + viewport_height;
    if caret_top < view_top {
        set_rich_text_scroll_v(source, (out.line_index + 1) as f32, Some(layout));
    } else if caret_bottom > view_bottom {
        let mut pixel_offset = 0.0;
        let mut first_visible_line = 0;
        for index in 0..layout.num_lines {
            if pixel_offset + layout.line_heights[index] > caret_bottom - viewport_height {
                first_visible_line = index;
                break;
            }
            pixel_offset += layout.line_heights[index];
        }
        set_rich_text_scroll_v(source, (first_visible_line + 1) as f32, Some(layout));
    }
    let caret_left = out.x - scroll_h;
    let caret_right = caret_left + out.width;
    if caret_left < 0.0 {
        set_rich_text_scroll_h(source, (out.x - 8.0).max(0.0), Some(layout));
    } else if caret_right + 8.0 > viewport_width {
        set_rich_text_scroll_h(
            source,
            out.x + out.width + 8.0 - viewport_width,
            Some(layout),
        );
    }
}

pub fn select_all_text_input(source: &Ref<RichText>) {
    let length = utf16_len(&source.read().unwrap().data.text);
    set_text_input_selection(source, 0, length as i32);
}

pub fn select_line_at_text_input_index(source: &Ref<RichText>, index: i32) {
    let text = source.read().unwrap().data.text.clone();
    let units: Vec<u16> = text.encode_utf16().collect();
    let clamped = clamp_index(index, units.len());
    let mut start = clamped;
    let mut end = clamped;
    while start > 0 && units[start - 1] != b'\n' as u16 {
        start -= 1;
    }
    while end < units.len() && units[end] != b'\n' as u16 {
        end += 1;
    }
    set_text_input_selection(source, start as i32, end as i32);
}

pub fn select_word_at_text_input_index(source: &Ref<RichText>, index: i32) {
    let text = source.read().unwrap().data.text.clone();
    let length = utf16_len(&text);
    let clamped = clamp_index(index, length);
    let mut segments: Vec<TextSegment> = Vec::new();
    segment_words(&mut segments, &WEB_TEXT_SEGMENTER_BACKEND, &text, None);
    if clamped > 0 {
        if let Some(segment) = segments
            .iter()
            .find(|segment| segment.end == clamped && segment.is_word_like == Some(true))
        {
            set_text_input_selection(source, segment.start as i32, segment.end as i32);
            return;
        }
    }
    if let Some(range) = get_word_range_at(
        &WEB_TEXT_SEGMENTER_BACKEND,
        &text,
        usize_to_i32(clamped),
        None,
    ) {
        set_text_input_selection(source, range.start as i32, range.end as i32);
        return;
    }
    if text.is_empty() {
        set_text_input_selection(source, 0, 0);
        return;
    }
    let lookup = if clamped == length {
        clamped.saturating_sub(1)
    } else {
        clamped
    };
    let Some(mut segment_index) = segments
        .iter()
        .position(|segment| lookup >= segment.start && lookup < segment.end)
    else {
        set_text_input_selection(source, clamped as i32, clamped as i32);
        return;
    };
    let mut start = segments[segment_index].start;
    let mut end = segments[segment_index].end;
    while segment_index > 0 && segments[segment_index - 1].is_word_like != Some(true) {
        segment_index -= 1;
        start = segments[segment_index].start;
    }
    segment_index = segments
        .iter()
        .position(|segment| segment.start == start)
        .unwrap_or(0);
    while segment_index + 1 < segments.len()
        && segments[segment_index + 1].is_word_like != Some(true)
    {
        segment_index += 1;
        end = segments[segment_index].end;
    }
    set_text_input_selection(source, start as i32, end as i32);
}

pub fn set_text_input_selection(source: &Ref<RichText>, begin_index: i32, end_index: i32) {
    let length = utf16_len(&source.read().unwrap().data.text);
    let state = get_input_state(source);
    let mut state = state.write().unwrap();
    state.selection_index = clamp_index(begin_index, length);
    state.caret_index = clamp_index(end_index, length);
    drop(state);
    invalidate_appearance(source);
}

fn split_restrict_ranges(restrict: &str) -> (String, String) {
    let characters: Vec<char> = restrict.chars().collect();
    let mut accepted = String::new();
    let mut declined = String::new();
    let mut declining = false;
    let mut index = 0;
    while index < characters.len() {
        let character = characters[index];
        if character == '\\' && index + 1 < characters.len() {
            if declining {
                declined.push(character);
                declined.push(characters[index + 1]);
            } else {
                accepted.push(character);
                accepted.push(characters[index + 1]);
            }
            index += 2;
            continue;
        }
        if character == '^' {
            declining = !declining;
        } else if declining {
            declined.push(character);
        } else {
            accepted.push(character);
        }
        index += 1;
    }
    return (accepted, declined);
}

pub fn undo_text_input(source: &Ref<RichText>) {
    let state = get_input_state(source);
    let mut state_guard = state.write().unwrap();
    if state_guard.history_index < 0 {
        return;
    }
    let record = state_guard.history[state_guard.history_index as usize].clone();
    state_guard.history_index -= 1;
    drop(state_guard);
    apply_history_record(
        source,
        &state,
        &record.text_before,
        record.caret_index_before,
        record.selection_index_before,
    );
}

fn usize_to_i32(value: usize) -> i32 {
    return value.min(2_147_483_647) as i32;
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum KeyboardCommand {
    Backspace,
    Copy,
    Cut,
    Delete,
    DeleteWordBackward,
    DeleteWordForward,
    DocumentEnd,
    DocumentStart,
    Down,
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
}
