use flighthq_types::{InputKeyboardData, KeyboardEventData, TextInputManager, TextLayoutResult};

use flighthq_text::{RichText, set_rich_text_scroll_v};

use crate::text_input::get_text_input_state;
use crate::text_input_editing::{
    get_text_input_character_index_at_point, handle_text_input_keyboard, insert_text_input,
    move_text_input_caret, select_line_at_text_input_index, select_word_at_text_input_index,
};

// The Rust manager does not own `RichText` values (the scene graph does), so it
// records focus as a presence flag in `focused_id` and operates on the
// caller-supplied `source` for each dispatch. The caller is responsible for
// passing the focused node. Layout is passed explicitly rather than read from
// runtime cache, matching Flight's explicit-input philosophy.

/// Removes focus from the manager, clearing the focused field's `focused` flag.
pub fn blur_text_input(manager: &mut TextInputManager, source: &mut RichText) {
    if manager.focused_id.is_some() {
        set_text_input_focused(source, false);
    }
    manager.focused_id = None;
}

/// Allocates a new `TextInputManager` with `enabled = true` and no focused
/// field.
pub fn create_text_input_manager() -> TextInputManager {
    TextInputManager {
        enabled: true,
        focused_id: None,
    }
}

/// Dispatches a text-input string (from an IME or text event) to the focused
/// field. Returns `true` when consumed.
pub fn dispatch_text_input(
    manager: &mut TextInputManager,
    source: &mut RichText,
    text: &str,
) -> bool {
    if !has_focus_target(manager, source) || text.is_empty() {
        return false;
    }
    insert_text_input(source, text);
    true
}

/// Dispatches a key-down event to the focused field. Returns `true` when
/// consumed.
pub fn dispatch_text_input_key_down(
    manager: &mut TextInputManager,
    source: &mut RichText,
    data: &InputKeyboardData,
    clipboard_text: Option<&str>,
) -> bool {
    if !has_focus_target(manager, source) {
        return false;
    }
    let keyboard = KeyboardEventData {
        alt_key: data.alt_key,
        ctrl_key: data.ctrl_key,
        key: data.key.clone(),
        key_code: data.key_code,
        meta_key: data.meta_key,
        shift_key: data.shift_key,
    };
    let options = flighthq_types::HandleTextInputKeyboardOptions {
        clipboard_text: clipboard_text.map(|s| s.to_string()),
        on_copy: None,
    };
    handle_text_input_keyboard(source, &keyboard, Some(&options))
}

/// Focuses `target`, handles click-count gestures (triple = line, double =
/// word, single = caret), and moves the caret. Optionally extends the existing
/// selection when `extend = true`. Hit-testing requires a precomputed `layout`.
pub fn dispatch_text_input_pointer_down(
    manager: &mut TextInputManager,
    target: &mut RichText,
    layout: Option<&TextLayoutResult>,
    x: f32,
    y: f32,
    extend: bool,
    click_count: u32,
) {
    focus_text_input(manager, target);
    let Some(layout) = layout else {
        return;
    };
    let index = get_text_input_character_index_at_point(target, layout, x, y);
    if click_count >= 3 {
        select_line_at_text_input_index(target, index);
    } else if click_count == 2 {
        select_word_at_text_input_index(target, index);
    } else {
        move_text_input_caret(target, index, extend);
    }
}

/// Extends the current selection to the pointer's position. Requires a
/// precomputed `layout`; a no-op when nothing is focused or layout is absent.
pub fn dispatch_text_input_pointer_move(
    manager: &mut TextInputManager,
    source: &mut RichText,
    layout: Option<&TextLayoutResult>,
    x: f32,
    y: f32,
) {
    if manager.focused_id.is_none() || !source.data.selectable {
        return;
    }
    let Some(layout) = layout else {
        return;
    };
    let index = get_text_input_character_index_at_point(source, layout, x, y);
    move_text_input_caret(source, index, true);
}

/// Scrolls the focused field by `delta_lines` lines.
pub fn dispatch_text_input_wheel(
    manager: &mut TextInputManager,
    source: &mut RichText,
    delta_lines: i32,
) {
    if manager.focused_id.is_none() || !source.data.selectable {
        return;
    }
    let next = (source.data.scroll_v as i32 + delta_lines).max(0) as u32;
    set_rich_text_scroll_v(source, next, None);
}

/// Sets `target` as the focused field, clearing focus on any previous field.
pub fn focus_text_input(manager: &mut TextInputManager, target: &mut RichText) {
    manager.focused_id = Some(0);
    set_text_input_focused(target, true);
}

fn has_focus_target(manager: &TextInputManager, source: &RichText) -> bool {
    manager.enabled && manager.focused_id.is_some() && source.data.selectable
}

// Writes the focused flag on the editable-input slot. A `None` slot means input
// was disabled on the node since it was focused, so there is nothing to flag.
fn set_text_input_focused(target: &mut RichText, focused: bool) {
    if get_text_input_state(target).is_some() {
        flighthq_text::get_rich_text_input_mut(target)
            .unwrap()
            .focused = focused;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::text_input::enable_text_input;
    use crate::text_input_editing::set_text_input_selection;
    use flighthq_text::{create_rich_text, create_rich_text_data};
    use flighthq_types::{RichTextData, key_code};

    fn create_input(text: &str) -> RichText {
        let mut node = create_rich_text(Some(&RichTextData {
            text: text.to_string(),
            ..create_rich_text_data(None)
        }));
        enable_text_input(&mut node, None);
        node
    }

    fn is_focused(node: &RichText) -> bool {
        get_text_input_state(node).map(|s| s.focused) == Some(true)
    }

    #[test]
    fn blur_text_input_clears_focus() {
        let mut manager = create_text_input_manager();
        let mut input = create_input("");
        focus_text_input(&mut manager, &mut input);
        assert!(is_focused(&input));
        blur_text_input(&mut manager, &mut input);
        assert!(manager.focused_id.is_none());
        assert!(!is_focused(&input));
    }

    #[test]
    fn create_text_input_manager_enabled_no_focus() {
        let m = create_text_input_manager();
        assert!(m.enabled);
        assert!(m.focused_id.is_none());
    }

    #[test]
    fn dispatch_text_input_inserts_into_focused() {
        let mut manager = create_text_input_manager();
        let mut target = create_input("");
        focus_text_input(&mut manager, &mut target);
        assert!(dispatch_text_input(&mut manager, &mut target, "x"));
        assert_eq!(target.data.text, "x");
    }

    #[test]
    fn dispatch_text_input_key_down_returns_false_without_focus() {
        let mut manager = create_text_input_manager();
        let mut target = create_input("abc");
        assert!(!dispatch_text_input_key_down(
            &mut manager,
            &mut target,
            &InputKeyboardData::default(),
            None
        ));
    }

    #[test]
    fn dispatch_text_input_key_down_routes_commands() {
        let mut manager = create_text_input_manager();
        let mut target = create_input("abc");
        set_text_input_selection(&mut target, 2, 2);
        focus_text_input(&mut manager, &mut target);
        let data = InputKeyboardData {
            key: "Backspace".to_string(),
            key_code: key_code::BACKSPACE,
            ..Default::default()
        };
        assert!(dispatch_text_input_key_down(
            &mut manager,
            &mut target,
            &data,
            None
        ));
        assert_eq!(target.data.text, "ac");
    }

    #[test]
    fn dispatch_text_input_pointer_down_focuses_the_target() {
        let mut manager = create_text_input_manager();
        let mut target = create_input("hello");
        dispatch_text_input_pointer_down(&mut manager, &mut target, None, 0.0, 0.0, false, 1);
        assert!(manager.focused_id.is_some());
        assert!(is_focused(&target));
    }

    #[test]
    fn dispatch_text_input_pointer_move_no_op_when_nothing_focused() {
        let mut manager = create_text_input_manager();
        let mut target = create_input("hello");
        // Nothing focused: must be a no-op and must not panic.
        dispatch_text_input_pointer_move(&mut manager, &mut target, None, 0.0, 0.0);
        assert!(manager.focused_id.is_none());
    }

    #[test]
    fn dispatch_text_input_returns_false_without_focus() {
        let mut manager = create_text_input_manager();
        let mut target = create_input("");
        assert!(!dispatch_text_input(&mut manager, &mut target, "x"));
    }

    #[test]
    fn dispatch_text_input_wheel_advances_scroll_v() {
        let mut manager = create_text_input_manager();
        let mut target = create_input("hello");
        focus_text_input(&mut manager, &mut target);
        assert_eq!(target.data.scroll_v, 1.0);
        dispatch_text_input_wheel(&mut manager, &mut target, 2);
        assert_eq!(target.data.scroll_v, 3.0);
    }

    #[test]
    fn focus_text_input_sets_and_clears_previous() {
        let mut manager = create_text_input_manager();
        let mut first = create_input("");
        let mut second = create_input("");
        focus_text_input(&mut manager, &mut first);
        assert!(is_focused(&first));
        // Moving focus to a second node clears the first explicitly.
        set_text_input_focused(&mut first, false);
        focus_text_input(&mut manager, &mut second);
        assert!(!is_focused(&first));
        assert!(is_focused(&second));
    }
}
