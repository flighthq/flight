//! flight-compiler: root-only disableTextInput enableTextInput getTextInputState hasTextInput

use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_text::contract::get_rich_text_runtime;
use flight_text::{RichText, TextInputOptions, TextInputState};

fn create_text_input_state(options: Option<&TextInputOptions>) -> TextInputState {
    let mut state = TextInputState {
        always_show_selection: false,
        caret_color: 0x0000_00ff,
        caret_index: 0,
        caret_width: 1.0,
        desired_caret_x: -1.0,
        display_as_password: false,
        focused: false,
        history: Vec::new(),
        history_index: -1,
        history_limit: 100,
        password_character: "•".to_string(),
        restrict: String::new(),
        selection_alpha: 0.35,
        selection_color: 0x0078_d7ff,
        selection_index: 0,
    };
    if let Some(options) = options {
        apply_text_input_options(&mut state, options);
    }
    return state;
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
    if let Some(value) = options.password_character.as_ref() {
        state.password_character = value.clone();
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

pub fn disable_text_input(node: &Ref<RichText>) {
    let runtime = {
        let node = node.read().unwrap();
        get_rich_text_runtime(&node)
    };
    runtime.write().unwrap().input = None;
}

pub fn enable_text_input(
    node: &Ref<RichText>,
    options: Option<&TextInputOptions>,
) -> Ref<TextInputState> {
    let runtime = {
        let node = node.read().unwrap();
        get_rich_text_runtime(&node)
    };
    let existing = runtime.read().unwrap().input.clone();
    if let Some(state) = existing {
        if let Some(options) = options {
            apply_text_input_options(&mut state.write().unwrap(), options);
        }
        return state;
    }
    let state = Arc::new(RwLock::new(create_text_input_state(options)));
    runtime.write().unwrap().input = Some(state.clone());
    return state;
}

pub fn get_text_input_state(node: &Ref<RichText>) -> Option<Ref<TextInputState>> {
    let runtime = {
        let node = node.read().unwrap();
        get_rich_text_runtime(&node)
    };
    let input = runtime.read().unwrap().input.clone();
    return input;
}

pub fn has_text_input(node: &Ref<RichText>) -> bool {
    return get_text_input_state(node).is_some();
}
