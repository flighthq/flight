//! flight-compiler: root-only blurSelectableRichText createSelectableRichTextManager dispatchSelectableRichTextKeyDown dispatchSelectableRichTextPointerDown dispatchSelectableRichTextPointerMove dispatchSelectableRichTextWheel focusSelectableRichText getSelectableRichTextSelectionText

use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_input::InputKeyboardData;
use flight_input::{KEY_CODE_A, KEY_CODE_C};
use flight_node::NodeRef;
use flight_text::contract::RichTextRuntime;
use flight_text::contract::{get_rich_text_runtime, set_rich_text_scroll_v};
use flight_text::{RichText, get_text_layout};
use flight_textlayout::compute_rich_text_char_index_at_point;

use crate::text_units::{js_round, utf16_len, utf16_slice};
use crate::types::{SelectableRichTextManager, TextInputCopyCallback};

pub fn create_selectable_rich_text_manager() -> Ref<SelectableRichTextManager> {
    let mut out: SelectableRichTextManager = allocate_entity();
    initialize_selectable_rich_text_manager(&mut out);
    return Arc::new(RwLock::new(out));
}

pub fn initialize_selectable_rich_text_manager(out: &mut SelectableRichTextManager) {
    out.focused = None;
}

pub fn blur_selectable_rich_text(manager: &Ref<SelectableRichTextManager>) {
    let target = manager.read().unwrap().focused.clone();
    if let Some(target) = target {
        let runtime = get_mutable_runtime(&target);
        let mut runtime = runtime.write().unwrap();
        runtime.selection_begin_index = 0;
        runtime.selection_end_index = 0;
    }
    manager.write().unwrap().focused = None;
}

pub fn dispatch_selectable_rich_text_key_down(
    manager: &Ref<SelectableRichTextManager>,
    data: &InputKeyboardData,
    on_copy: Option<TextInputCopyCallback>,
) -> bool {
    let Some(target) = manager.read().unwrap().focused.clone() else {
        return false;
    };
    let command = data.ctrl_key || data.meta_key;
    let key: String = data.key.clone();
    if command && (key.to_ascii_lowercase() == "a" || data.key_code == KEY_CODE_A) {
        let text_length = utf16_len(&target.read().unwrap().data.text);
        let runtime = get_mutable_runtime(&target);
        let mut runtime_guard = runtime.write().unwrap();
        runtime_guard.selection_begin_index = 0;
        runtime_guard.selection_end_index = text_length;
        return true;
    }
    if command && (key.to_ascii_lowercase() == "c" || data.key_code == KEY_CODE_C) {
        let runtime = get_mutable_runtime(&target);
        let (start, end) = {
            let runtime_guard = runtime.read().unwrap();
            (
                runtime_guard
                    .selection_begin_index
                    .min(runtime_guard.selection_end_index),
                runtime_guard
                    .selection_begin_index
                    .max(runtime_guard.selection_end_index),
            )
        };
        let selected = utf16_slice(&target.read().unwrap().data.text, start, end);
        if !selected.is_empty() {
            if let Some(on_copy) = on_copy {
                on_copy(&selected);
            }
        }
        return true;
    }
    return false;
}

pub fn dispatch_selectable_rich_text_pointer_down(
    manager: &Ref<SelectableRichTextManager>,
    target: &Ref<RichText>,
    x: f32,
    y: f32,
    extend: bool,
) {
    manager.write().unwrap().focused = Some(target.clone());
    let runtime = get_mutable_runtime(target);
    let node: NodeRef = target.clone();
    let layout = get_text_layout(&node);
    let Some(layout) = layout else {
        if !extend {
            let mut runtime = runtime.write().unwrap();
            runtime.selection_begin_index = 0;
            runtime.selection_end_index = 0;
        }
        return;
    };
    let index = compute_rich_text_char_index_at_point(&layout.read().unwrap(), x, y);
    let mut runtime = runtime.write().unwrap();
    if extend {
        runtime.selection_end_index = index;
    } else {
        runtime.selection_begin_index = index;
        runtime.selection_end_index = index;
    }
}

pub fn dispatch_selectable_rich_text_pointer_move(
    manager: &Ref<SelectableRichTextManager>,
    x: f32,
    y: f32,
) {
    let Some(target) = manager.read().unwrap().focused.clone() else {
        return;
    };
    let runtime = get_mutable_runtime(&target);
    let node: NodeRef = target.clone();
    let layout = get_text_layout(&node);
    let Some(layout) = layout else {
        return;
    };
    let index = compute_rich_text_char_index_at_point(&layout.read().unwrap(), x, y);
    runtime.write().unwrap().selection_end_index = index;
}

pub fn dispatch_selectable_rich_text_wheel(
    manager: &Ref<SelectableRichTextManager>,
    delta_lines: f32,
) {
    let Some(target) = manager.read().unwrap().focused.clone() else {
        return;
    };
    let scroll_v = target.read().unwrap().data.scroll_v;
    set_rich_text_scroll_v(&target, scroll_v + js_round(delta_lines), None);
}

pub fn focus_selectable_rich_text(
    manager: &Ref<SelectableRichTextManager>,
    target: &Ref<RichText>,
) {
    manager.write().unwrap().focused = Some(target.clone());
}

fn get_mutable_runtime(source: &Ref<RichText>) -> Ref<RichTextRuntime> {
    let source = source.read().unwrap();
    return get_rich_text_runtime(&source);
}

pub fn get_selectable_rich_text_selection_text(manager: &Ref<SelectableRichTextManager>) -> String {
    let Some(target) = manager.read().unwrap().focused.clone() else {
        return String::new();
    };
    let runtime = get_mutable_runtime(&target);
    let runtime = runtime.read().unwrap();
    let start = runtime
        .selection_begin_index
        .min(runtime.selection_end_index);
    let end = runtime
        .selection_begin_index
        .max(runtime.selection_end_index);
    return utf16_slice(&target.read().unwrap().data.text, start, end);
}
