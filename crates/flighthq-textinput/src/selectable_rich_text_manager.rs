use flighthq_types::{InputKeyboardData, SelectableRichTextManager, TextLayoutResult, key_code};

use flighthq_text::{
    RichText, get_rich_text_selection_begin_index, get_rich_text_selection_end_index,
    set_rich_text_scroll_v, set_rich_text_selection_indices,
};
use flighthq_textlayout::get_rich_text_char_index_at_point;

// Like `TextInputManager`, this manager records focus as a presence flag in
// `focused_id` and operates on the caller-supplied `source`; the scene graph
// owns the `RichText` value. Layout is passed explicitly for hit-testing.

/// Clears the selection on the focused field and removes focus from the manager.
pub fn blur_selectable_rich_text(manager: &mut SelectableRichTextManager, source: &mut RichText) {
    if manager.focused_id.is_some() {
        set_rich_text_selection_indices(source, 0, 0);
    }
    manager.focused_id = None;
}

/// Allocates a new `SelectableRichTextManager` with no focused field.
pub fn create_selectable_rich_text_manager() -> SelectableRichTextManager {
    SelectableRichTextManager { focused_id: None }
}

/// Handles a key-down event for selection-only rich text (select-all, copy).
/// Returns `true` when the event was consumed. Copy is reported through
/// `on_copy`, since this crate has no platform clipboard.
pub fn dispatch_selectable_rich_text_key_down(
    manager: &mut SelectableRichTextManager,
    source: &mut RichText,
    data: &InputKeyboardData,
    on_copy: Option<&dyn Fn(&str)>,
) -> bool {
    if manager.focused_id.is_none() {
        return false;
    }
    let is_meta = data.ctrl_key || data.meta_key;
    let key = data.key.to_ascii_lowercase();
    if is_meta && (key == "a" || data.key_code == key_code::A) {
        let len = source.data.text.chars().count();
        set_rich_text_selection_indices(source, 0, len);
        return true;
    }
    if is_meta && (key == "c" || data.key_code == key_code::C) {
        let selected = get_selection_text(source);
        if !selected.is_empty() {
            if let Some(on_copy) = on_copy {
                on_copy(&selected);
            }
        }
        return true;
    }
    false
}

/// Updates the selection start/end on pointer-down within `source`. Hit-testing
/// requires a precomputed `layout`; when absent, a non-extending press collapses
/// the selection.
pub fn dispatch_selectable_rich_text_pointer_down(
    manager: &mut SelectableRichTextManager,
    source: &mut RichText,
    layout: Option<&TextLayoutResult>,
    x: f32,
    y: f32,
    extend: bool,
) {
    manager.focused_id = Some(0);
    let Some(layout) = layout else {
        if !extend {
            set_rich_text_selection_indices(source, 0, 0);
        }
        return;
    };
    let index = get_rich_text_char_index_at_point(&source.data.text, layout, x, y);
    if extend {
        let begin = get_rich_text_selection_begin_index(source);
        set_rich_text_selection_indices(source, begin, index);
    } else {
        set_rich_text_selection_indices(source, index, index);
    }
}

/// Extends the selection end on pointer-move. Requires a precomputed `layout`.
pub fn dispatch_selectable_rich_text_pointer_move(
    manager: &mut SelectableRichTextManager,
    source: &mut RichText,
    layout: Option<&TextLayoutResult>,
    x: f32,
    y: f32,
) {
    if manager.focused_id.is_none() {
        return;
    }
    let Some(layout) = layout else {
        return;
    };
    let index = get_rich_text_char_index_at_point(&source.data.text, layout, x, y);
    let begin = get_rich_text_selection_begin_index(source);
    set_rich_text_selection_indices(source, begin, index);
}

/// Scrolls the focused field by `delta_lines` lines.
pub fn dispatch_selectable_rich_text_wheel(
    manager: &mut SelectableRichTextManager,
    source: &mut RichText,
    delta_lines: i32,
) {
    if manager.focused_id.is_none() {
        return;
    }
    let next = (source.data.scroll_v as i32 + delta_lines).max(0) as u32;
    set_rich_text_scroll_v(source, next, None);
}

/// Sets `source` as the focused field in `manager`.
pub fn focus_selectable_rich_text(manager: &mut SelectableRichTextManager, _source: &RichText) {
    manager.focused_id = Some(0);
}

/// Returns the currently selected text from the focused field, or an empty
/// string when nothing is focused or selected.
pub fn get_selectable_rich_text_selection_text(
    manager: &SelectableRichTextManager,
    source: &RichText,
) -> String {
    if manager.focused_id.is_none() {
        return String::new();
    }
    get_selection_text(source)
}

fn get_selection_text(source: &RichText) -> String {
    let a = get_rich_text_selection_begin_index(source);
    let b = get_rich_text_selection_end_index(source);
    let start = a.min(b);
    let end = a.max(b);
    source
        .data
        .text
        .chars()
        .skip(start)
        .take(end - start)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_text::{create_rich_text, create_rich_text_data};
    use flighthq_types::RichTextData;

    fn with_text(text: &str) -> RichText {
        create_rich_text(Some(&RichTextData {
            text: text.to_string(),
            ..create_rich_text_data(None)
        }))
    }

    #[test]
    fn blur_selectable_rich_text_clears_focus_and_selection() {
        let mut manager = create_selectable_rich_text_manager();
        let mut rich = with_text("hello");
        focus_selectable_rich_text(&mut manager, &rich);
        set_rich_text_selection_indices(&mut rich, 1, 4);
        blur_selectable_rich_text(&mut manager, &mut rich);
        assert!(manager.focused_id.is_none());
        assert_eq!(get_rich_text_selection_begin_index(&rich), 0);
        assert_eq!(get_rich_text_selection_end_index(&rich), 0);
    }

    #[test]
    fn create_selectable_rich_text_manager_no_focus() {
        let m = create_selectable_rich_text_manager();
        assert!(m.focused_id.is_none());
    }

    #[test]
    fn dispatch_selectable_rich_text_key_down_select_all() {
        let mut manager = create_selectable_rich_text_manager();
        let mut rich = with_text("hello");
        focus_selectable_rich_text(&mut manager, &rich);
        let result = dispatch_selectable_rich_text_key_down(
            &mut manager,
            &mut rich,
            &InputKeyboardData {
                ctrl_key: true,
                key: "a".to_string(),
                key_code: key_code::A,
                ..Default::default()
            },
            None,
        );
        assert!(result);
        assert_eq!(get_rich_text_selection_begin_index(&rich), 0);
        assert_eq!(get_rich_text_selection_end_index(&rich), 5);
    }

    #[test]
    fn dispatch_selectable_rich_text_key_down_unfocused_and_unhandled() {
        let mut manager = create_selectable_rich_text_manager();
        let mut rich = with_text("hello");
        assert!(!dispatch_selectable_rich_text_key_down(
            &mut manager,
            &mut rich,
            &InputKeyboardData::default(),
            None
        ));

        focus_selectable_rich_text(&mut manager, &rich);
        assert!(!dispatch_selectable_rich_text_key_down(
            &mut manager,
            &mut rich,
            &InputKeyboardData {
                key: "ArrowLeft".to_string(),
                ..Default::default()
            },
            None
        ));
    }

    #[test]
    fn dispatch_selectable_rich_text_pointer_down_collapses_when_no_layout() {
        let mut manager = create_selectable_rich_text_manager();
        let mut rich = with_text("hello");
        set_rich_text_selection_indices(&mut rich, 2, 2);
        dispatch_selectable_rich_text_pointer_down(&mut manager, &mut rich, None, 0.0, 0.0, false);
        assert!(manager.focused_id.is_some());
        assert_eq!(get_rich_text_selection_begin_index(&rich), 0);
        assert_eq!(get_rich_text_selection_end_index(&rich), 0);
    }

    #[test]
    fn dispatch_selectable_rich_text_pointer_down_extend_keeps_begin() {
        let mut manager = create_selectable_rich_text_manager();
        let mut rich = with_text("hello");
        set_rich_text_selection_indices(&mut rich, 1, 1);
        dispatch_selectable_rich_text_pointer_down(&mut manager, &mut rich, None, 0.0, 0.0, true);
        assert_eq!(get_rich_text_selection_begin_index(&rich), 1);
    }

    #[test]
    fn dispatch_selectable_rich_text_pointer_move_no_focus_noop() {
        let mut manager = create_selectable_rich_text_manager();
        let mut rich = with_text("hello");
        dispatch_selectable_rich_text_pointer_move(&mut manager, &mut rich, None, 0.0, 0.0);
        assert_eq!(get_rich_text_selection_end_index(&rich), 0);
    }

    #[test]
    fn dispatch_selectable_rich_text_wheel_advances_scroll_v() {
        let mut manager = create_selectable_rich_text_manager();
        let mut rich = with_text("hello");
        focus_selectable_rich_text(&mut manager, &rich);
        assert_eq!(rich.data.scroll_v, 1.0);
        dispatch_selectable_rich_text_wheel(&mut manager, &mut rich, 2);
        assert_eq!(rich.data.scroll_v, 3.0);
    }

    #[test]
    fn focus_selectable_rich_text_sets_focus() {
        let mut manager = create_selectable_rich_text_manager();
        let rich = with_text("hello");
        focus_selectable_rich_text(&mut manager, &rich);
        assert!(manager.focused_id.is_some());
    }

    #[test]
    fn get_selectable_rich_text_selection_text_empty_and_slice() {
        let manager = create_selectable_rich_text_manager();
        let rich = with_text("hello world");
        assert_eq!(get_selectable_rich_text_selection_text(&manager, &rich), "");

        let mut manager = create_selectable_rich_text_manager();
        let mut rich = with_text("hello world");
        focus_selectable_rich_text(&mut manager, &rich);
        set_rich_text_selection_indices(&mut rich, 6, 11);
        assert_eq!(
            get_selectable_rich_text_selection_text(&manager, &rich),
            "world"
        );
    }
}
