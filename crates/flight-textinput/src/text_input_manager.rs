//! flight-compiler: root-only blurTextInput connectInputToTextInput createTextInputManager dispatchTextInput dispatchTextInputKeyDown dispatchTextInputPointerDown dispatchTextInputPointerMove dispatchTextInputWheel focusTextInput

use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_input::{InputKeyboardData, InputTextData};
use flight_node::NodeRef;
use flight_signals::{SignalSlot, connect_signal, disconnect_signal};
use flight_text::contract::set_rich_text_scroll_v;
use flight_text::{RichText, get_text_layout};
use flight_textlayout::TextLayoutResult;

use crate::text_input::get_text_input_state;
use crate::text_input_editing::{
    get_text_input_character_index_at_point, handle_text_input_keyboard, insert_text_input,
    move_text_input_caret, select_line_at_text_input_index, select_word_at_text_input_index,
};
use crate::text_units::js_round;
use crate::types::{
    HandleTextInputKeyboardOptions, TextInputCopyCallback, TextInputDisposer, TextInputManager,
    TextInputSource,
};

pub fn create_text_input_manager() -> Ref<TextInputManager> {
    let mut out: TextInputManager = allocate_entity();
    initialize_text_input_manager(&mut out);
    return Arc::new(RwLock::new(out));
}

pub fn initialize_text_input_manager(out: &mut TextInputManager) {
    out.enabled = true;
    out.focused = None;
}

pub fn blur_text_input(manager: &Ref<TextInputManager>) {
    let target = manager.read().unwrap().focused.clone();
    if let Some(target) = target {
        set_text_input_focused(&target, false);
    }
    manager.write().unwrap().focused = None;
}

pub fn connect_input_to_text_input(
    input: &TextInputSource,
    manager: &Ref<TextInputManager>,
) -> TextInputDisposer {
    let key_manager = manager.clone();
    let on_key_down: SignalSlot<InputKeyboardData> = Arc::new(move |data| {
        dispatch_text_input_key_down(&key_manager, data, None, None);
    });
    let text_manager = manager.clone();
    let on_text_input = Arc::new(move |data: &InputTextData| {
        dispatch_text_input(&text_manager, &data.text);
    });
    let key_id = connect_signal(&input.on_key_down, on_key_down, None);
    let text_id = connect_signal(&input.on_text_input, on_text_input, None);
    let key_signal = input.on_key_down.clone();
    let text_signal = input.on_text_input.clone();
    return Arc::new(move || {
        disconnect_signal(&key_signal, key_id);
        disconnect_signal(&text_signal, text_id);
    });
}

pub fn dispatch_text_input(manager: &Ref<TextInputManager>, text: &str) -> bool {
    let Some(target) = get_text_input_focus_target(manager) else {
        return false;
    };
    if text.is_empty() {
        return false;
    }
    insert_text_input(&target, text);
    return true;
}

pub fn dispatch_text_input_key_down(
    manager: &Ref<TextInputManager>,
    data: &InputKeyboardData,
    clipboard_text: Option<&str>,
    on_copy: Option<TextInputCopyCallback>,
) -> bool {
    let Some(target) = get_text_input_focus_target(manager) else {
        return false;
    };
    let options = HandleTextInputKeyboardOptions {
        clipboard_text: clipboard_text.map(|value| value.to_string()),
        layout: get_target_layout(&target),
        on_copy,
    };
    return handle_text_input_keyboard(&target, data, Some(&options));
}

pub fn dispatch_text_input_pointer_down(
    manager: &Ref<TextInputManager>,
    target: &Ref<RichText>,
    x: f32,
    y: f32,
    extend: bool,
    click_count: i32,
) {
    focus_text_input(manager, target);
    let Some(layout) = get_target_layout(target) else {
        return;
    };
    let index = get_text_input_character_index_at_point(target, &layout.read().unwrap(), x, y);
    if click_count >= 3 {
        select_line_at_text_input_index(target, index as i32);
    } else if click_count == 2 {
        select_word_at_text_input_index(target, index as i32);
    } else {
        move_text_input_caret(target, index as i32, extend);
    }
}

pub fn dispatch_text_input_pointer_move(manager: &Ref<TextInputManager>, x: f32, y: f32) {
    let target = manager.read().unwrap().focused.clone();
    let Some(target) = target else {
        return;
    };
    if !target.read().unwrap().enabled {
        return;
    }
    let Some(layout) = get_target_layout(&target) else {
        return;
    };
    let index = get_text_input_character_index_at_point(&target, &layout.read().unwrap(), x, y);
    move_text_input_caret(&target, index as i32, true);
}

pub fn dispatch_text_input_wheel(manager: &Ref<TextInputManager>, delta_lines: f32) {
    let target = manager.read().unwrap().focused.clone();
    let Some(target) = target else {
        return;
    };
    let target_guard = target.read().unwrap();
    if !target_guard.enabled {
        return;
    }
    let scroll_v = target_guard.data.scroll_v;
    drop(target_guard);
    set_rich_text_scroll_v(&target, scroll_v + js_round(delta_lines), None);
}

pub fn focus_text_input(manager: &Ref<TextInputManager>, target: &Ref<RichText>) {
    let previous = manager.read().unwrap().focused.clone();
    if let Some(previous) = previous {
        if !Arc::ptr_eq(&previous, target) {
            set_text_input_focused(&previous, false);
        }
    }
    manager.write().unwrap().focused = Some(target.clone());
    set_text_input_focused(target, true);
}

fn get_target_layout(target: &Ref<RichText>) -> Option<Ref<TextLayoutResult>> {
    let node: NodeRef = target.clone();
    return get_text_layout(&node);
}

fn get_text_input_focus_target(manager: &Ref<TextInputManager>) -> Option<Ref<RichText>> {
    let manager = manager.read().unwrap();
    if !manager.enabled {
        return None;
    }
    let Some(target) = manager.focused.clone() else {
        return None;
    };
    if !target.read().unwrap().enabled {
        return None;
    }
    return Some(target);
}

fn set_text_input_focused(target: &Ref<RichText>, focused: bool) {
    if let Some(state) = get_text_input_state(target) {
        state.write().unwrap().focused = focused;
    }
}
