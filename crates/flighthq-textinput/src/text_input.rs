use flighthq_types::{TextInputOptions, TextInputState};

use flighthq_text::{RichText, get_rich_text_input, get_rich_text_input_mut, set_rich_text_input};

/// Detaches the editable-field slot from `node`, returning it to a static
/// `RichText`. The field's text and rich content are preserved; only the input
/// mode (caret/focus/selection style) is released.
pub fn disable_text_input(node: &mut RichText) {
    set_rich_text_input(node, None);
}

/// Allocates (or returns) the editable-field slot on `node`. Idempotent: a
/// second call with `options` applies them to the existing state.
pub fn enable_text_input<'node>(
    node: &'node mut RichText,
    options: Option<&TextInputOptions>,
) -> &'node mut TextInputState {
    if get_rich_text_input(node).is_none() {
        set_rich_text_input(node, Some(create_text_input_state(options)));
    } else if let Some(options) = options {
        apply_text_input_options(get_rich_text_input_mut(node).unwrap(), options);
    }
    get_rich_text_input_mut(node).unwrap()
}

/// Returns a shared reference to the editable-field state, or `None` when the
/// field is not in editing mode.
pub fn get_text_input_state(node: &RichText) -> Option<&TextInputState> {
    get_rich_text_input(node)
}

/// Returns `true` when the node has an editable-field slot.
pub fn has_text_input(node: &RichText) -> bool {
    get_rich_text_input(node).is_some()
}

fn apply_text_input_options(state: &mut TextInputState, options: &TextInputOptions) {
    if let Some(value) = options.always_show_selection {
        state.always_show_selection = value;
    }
    if let Some(value) = options.caret_color {
        state.caret_color = value;
    }
    if let Some(value) = options.caret_width {
        state.caret_width = value;
    }
    if let Some(value) = options.display_as_password {
        state.display_as_password = value;
    }
    if let Some(value) = options.history_limit {
        state.history_limit = value;
    }
    if let Some(value) = options.password_character {
        state.password_character = value;
    }
    if let Some(value) = options.restrict.as_ref() {
        state.restrict = value.clone();
    }
    if let Some(value) = options.selection_alpha {
        state.selection_alpha = value;
    }
    if let Some(value) = options.selection_color {
        state.selection_color = value;
    }
}

// Defaults match OpenFL's TextField input conventions (bullet password char,
// light selection tint, opaque black caret 1px wide). `desired_caret_x` starts
// unset (`-1`) so vertical navigation anchors to the actual caret position on
// the first up/down keystroke. `history_limit` defaults to 100 entries.
fn create_text_input_state(options: Option<&TextInputOptions>) -> TextInputState {
    TextInputState {
        always_show_selection: options
            .and_then(|o| o.always_show_selection)
            .unwrap_or(false),
        caret_color: options.and_then(|o| o.caret_color).unwrap_or(0x000000),
        caret_index: 0,
        caret_width: options.and_then(|o| o.caret_width).unwrap_or(1.0),
        desired_caret_x: -1.0,
        display_as_password: options.and_then(|o| o.display_as_password).unwrap_or(false),
        focused: false,
        history: Vec::new(),
        history_index: -1,
        history_limit: options.and_then(|o| o.history_limit).unwrap_or(100),
        password_character: options
            .and_then(|o| o.password_character)
            .unwrap_or('\u{2022}'),
        restrict: options.and_then(|o| o.restrict.clone()).unwrap_or_default(),
        selection_alpha: options.and_then(|o| o.selection_alpha).unwrap_or(0.35),
        selection_color: options.and_then(|o| o.selection_color).unwrap_or(0x0078d7),
        selection_index: 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_text::create_rich_text;

    #[test]
    fn disable_text_input_removes_state() {
        let mut node = create_rich_text(None);
        enable_text_input(&mut node, None);
        disable_text_input(&mut node);
        assert!(!has_text_input(&node));
        assert!(get_text_input_state(&node).is_none());
    }

    #[test]
    fn enable_text_input_applies_options() {
        let mut node = create_rich_text(None);
        let options = TextInputOptions {
            display_as_password: Some(true),
            selection_color: Some(0xff0000),
            ..Default::default()
        };
        let state = enable_text_input(&mut node, Some(&options));
        assert!(state.display_as_password);
        assert_eq!(state.selection_color, 0xff0000);
    }

    #[test]
    fn enable_text_input_default_state() {
        let mut node = create_rich_text(None);
        let state = enable_text_input(&mut node, None);
        assert!(!state.focused);
        assert_eq!(state.caret_index, 0);
        assert!(!state.display_as_password);
        assert_eq!(state.selection_color, 0x0078d7);
    }

    #[test]
    fn enable_text_input_idempotent() {
        let mut node = create_rich_text(None);
        enable_text_input(&mut node, None);
        let options = TextInputOptions {
            display_as_password: Some(true),
            ..Default::default()
        };
        let second = enable_text_input(&mut node, Some(&options));
        assert!(second.display_as_password);
    }

    #[test]
    fn get_text_input_state_none_when_disabled() {
        let node = create_rich_text(None);
        assert!(get_text_input_state(&node).is_none());
    }

    #[test]
    fn has_text_input_initially_false() {
        let mut node = create_rich_text(None);
        assert!(!has_text_input(&node));
        enable_text_input(&mut node, None);
        assert!(has_text_input(&node));
    }
}
