use crate::gui_controller::*;
use flight_entity::{Ref, allocate_entity, throw_type_error};
use flight_input::InputKeyboardData;
use flight_interaction::contract::{InteractionSignalName, KeyboardEventData};
use flight_scene2d::Node2DRef;
use flight_signals::{Signal, connect_signal, create_signal, disconnect_signal};
use flight_text::contract::get_rich_text_runtime;
use flight_text::{RichText, enable_text_field_signals};
use flight_textinput::contract::*;
use flight_textlayout::TextSelectionRectangle;
use std::sync::{Arc, RwLock};
pub type TextInputController = GuiController<TextInputControllerFields>;
pub type TextInputControllerKeyboardData = InputKeyboardData;
pub struct TextInputControllerOptions {
    pub background: Option<Node2DRef>,
    pub caret: Option<Node2DRef>,
    pub input: Option<Ref<TextInputSource>>,
    pub manager: Option<Ref<TextInputManager>>,
    pub text_field: Ref<RichText>,
    pub transition: Option<Arc<GuiTransitionDescriptor>>,
}
pub struct TextInputControllerSignals {
    pub on_change: Ref<Signal<String>>,
    pub on_submit: Ref<Signal<String>>,
}
pub struct TextInputControllerFields {
    pub background: Option<Node2DRef>,
    pub caret: Option<Node2DRef>,
    pub manager: Ref<TextInputManager>,
    pub owns_input: bool,
    pub signals: Ref<TextInputControllerSignals>,
    pub text_field: Option<Ref<RichText>>,
}
pub fn create_text_input_controller(options: &TextInputControllerOptions) -> TextInputController {
    let mut out: TextInputController = allocate_entity();
    initialize_text_input_controller(&mut out, options);
    return out;
}

// flight-lint: allow(conform-extra) D12 construction adopts or enables the actual text-input capability and derives source subscriptions and ownership from required RichText
pub fn initialize_text_input_controller(
    out: &mut TextInputController,
    options: &TextInputControllerOptions,
) {
    let owns_input = !has_text_input(&options.text_field);
    enable_text_input(&options.text_field, None);
    let runtime = create_gui_controller_runtime(
        TextInputControllerFields {
            background: options.background.clone(),
            caret: options.caret.clone(),
            manager: options
                .manager
                .clone()
                .unwrap_or_else(create_text_input_manager),
            owns_input,
            signals: Arc::new(RwLock::new(TextInputControllerSignals {
                on_change: Arc::new(RwLock::new(create_signal())),
                on_submit: Arc::new(RwLock::new(create_signal())),
            })),
            text_field: Some(options.text_field.clone()),
        },
        options.transition.clone(),
    );
    initialize_gui_controller(out, runtime.clone());
    let text_signals = enable_text_field_signals(&options.text_field);
    let r = runtime.clone();
    let id = connect_signal(
        &text_signals.read().unwrap().on_text_field_change,
        Arc::new(move |event| {
            update_caret(&r);
            emit_change(&r, &event.text);
        }),
        None,
    );
    runtime.write().unwrap().cleanups.push(Arc::new(move || {
        disconnect_signal(&text_signals.read().unwrap().on_text_field_change, id)
    }));
    let target: Node2DRef = options.text_field.clone();
    let r = runtime.clone();
    let field = options.text_field.clone();
    connect_gui_interaction(
        &runtime,
        &target,
        InteractionSignalName::OnPointerDown,
        GuiInteractionSlot::Pointer(GuiPointerSlot {
            callback: Arc::new(move |data| {
                let manager = r.read().unwrap().fields.manager.clone();
                dispatch_text_input_pointer_down(
                    &manager,
                    &field,
                    data.local_x,
                    data.local_y,
                    data.shift_key,
                    1,
                );
                update_caret(&r);
            }),
        }),
    );
    let r = runtime.clone();
    connect_gui_interaction(
        &runtime,
        &target,
        InteractionSignalName::OnPointerMove,
        GuiInteractionSlot::Pointer(GuiPointerSlot {
            callback: Arc::new(move |data| {
                if data.buttons != 0 {
                    let manager = r.read().unwrap().fields.manager.clone();
                    dispatch_text_input_pointer_move(&manager, data.local_x, data.local_y);
                    update_caret(&r);
                }
            }),
        }),
    );
    let r = runtime.clone();
    connect_gui_interaction(
        &runtime,
        &target,
        InteractionSignalName::OnWheel,
        GuiInteractionSlot::Pointer(GuiPointerSlot {
            callback: Arc::new(move |data| {
                let manager = r.read().unwrap().fields.manager.clone();
                dispatch_text_input_wheel(&manager, data.delta_y);
            }),
        }),
    );
    let r = runtime.clone();
    connect_gui_interaction(
        &runtime,
        &target,
        InteractionSignalName::OnFocusIn,
        GuiInteractionSlot::Focus(GuiFocusSlot {
            callback: Arc::new(move |_| focus_runtime(&r)),
        }),
    );
    let r = runtime.clone();
    connect_gui_interaction(
        &runtime,
        &target,
        InteractionSignalName::OnFocusOut,
        GuiInteractionSlot::Focus(GuiFocusSlot {
            callback: Arc::new(move |_| blur_runtime(&r)),
        }),
    );
    let r = runtime.clone();
    connect_gui_interaction(
        &runtime,
        &target,
        InteractionSignalName::OnKeyDown,
        GuiInteractionSlot::Keyboard(GuiKeyboardSlot {
            callback: Arc::new(move |data| {
                dispatch_key_runtime(&r, &keyboard_event_to_input(data));
            }),
        }),
    );
    if let Some(input) = &options.input {
        let r = runtime.clone();
        let id = connect_signal(
            &input.read().unwrap().on_key_down,
            Arc::new(move |data| {
                dispatch_key_runtime(&r, data);
            }),
            None,
        );
        let input = input.clone();
        runtime.write().unwrap().cleanups.push(Arc::new(move || {
            disconnect_signal(&input.read().unwrap().on_key_down, id)
        }));
        let input = options.input.as_ref().unwrap();
        let r = runtime.clone();
        let id = connect_signal(
            &input.read().unwrap().on_text_input,
            Arc::new(move |data| {
                dispatch_text_runtime(&r, &data.text);
            }),
            None,
        );
        let input = input.clone();
        runtime.write().unwrap().cleanups.push(Arc::new(move || {
            disconnect_signal(&input.read().unwrap().on_text_input, id)
        }));
    }
    let caret = runtime.read().unwrap().fields.caret.clone();
    set_gui_visible(&runtime, caret.as_ref(), false);
}

fn blur_runtime(r: &Ref<GuiControllerRuntime<TextInputControllerFields>>) {
    let manager = {
        let s = r.read().unwrap();
        if s.fields.text_field.is_none() {
            return;
        }
        s.fields.manager.clone()
    };
    blur_text_input(&manager);
    let caret = r.read().unwrap().fields.caret.clone();
    set_gui_visible(r, caret.as_ref(), false);
}

pub fn blur_text_input_controller(controller: &TextInputController) {
    blur_runtime(&get_gui_controller_runtime(controller));
}

fn current_text(r: &Ref<GuiControllerRuntime<TextInputControllerFields>>) -> String {
    let field = r
        .read()
        .unwrap()
        .fields
        .text_field
        .clone()
        .unwrap_or_else(|| throw_type_error("TextInputController textField is null"));
    return field.read().unwrap().data.text.clone();
}

fn dispatch_key_runtime(
    r: &Ref<GuiControllerRuntime<TextInputControllerFields>>,
    data: &InputKeyboardData,
) -> bool {
    if r.read().unwrap().fields.text_field.is_none() {
        return false;
    }
    if data.key == "Enter" {
        let signals = r.read().unwrap().fields.signals.clone();
        let signal = signals.read().unwrap().on_submit.clone();
        emit_gui_signal(&signal, &current_text(r));
    }
    let previous = current_text(r);
    let manager = r.read().unwrap().fields.manager.clone();
    let handled = dispatch_text_input_key_down(&manager, data, None, None);
    let text = current_text(r);
    if text != previous {
        emit_change(r, &text);
    }
    update_caret(r);
    return handled;
}

pub fn dispatch_text_input_controller_key_down(
    controller: &TextInputController,
    data: &InputKeyboardData,
) -> bool {
    return dispatch_key_runtime(&get_gui_controller_runtime(controller), data);
}

pub fn dispatch_text_input_controller_text(controller: &TextInputController, text: &str) -> bool {
    return dispatch_text_runtime(&get_gui_controller_runtime(controller), text);
}

fn dispatch_text_runtime(
    r: &Ref<GuiControllerRuntime<TextInputControllerFields>>,
    text: &str,
) -> bool {
    if r.read().unwrap().fields.text_field.is_none() {
        return false;
    }
    let previous = current_text(r);
    let manager = r.read().unwrap().fields.manager.clone();
    let handled = dispatch_text_input(&manager, text);
    let text = current_text(r);
    if text != previous {
        emit_change(r, &text);
    }
    update_caret(r);
    return handled;
}

pub fn dispose_text_input_controller(controller: &TextInputController) {
    let r = get_gui_controller_runtime(controller);
    dispose_gui_controller(controller, &|| {
        let (field, manager, owns_input) = {
            let s = r.read().unwrap();
            (
                s.fields.text_field.clone(),
                s.fields.manager.clone(),
                s.fields.owns_input,
            )
        };
        if let Some(field) = field {
            let focused = manager
                .read()
                .unwrap()
                .focused
                .as_ref()
                .map(|current| Arc::ptr_eq(current, &field))
                .unwrap_or(false);
            if focused {
                blur_text_input(&manager);
            }
            if owns_input {
                disable_text_input(&field);
            }
        }
        let mut s = r.write().unwrap();
        s.fields.background = None;
        s.fields.caret = None;
        s.fields.text_field = None;
    });
}

fn emit_change(r: &Ref<GuiControllerRuntime<TextInputControllerFields>>, text: &String) {
    let signals = r.read().unwrap().fields.signals.clone();
    let signal = signals.read().unwrap().on_change.clone();
    emit_gui_signal(&signal, text);
}

fn focus_runtime(r: &Ref<GuiControllerRuntime<TextInputControllerFields>>) {
    let (field, manager) = {
        let s = r.read().unwrap();
        (s.fields.text_field.clone(), s.fields.manager.clone())
    };
    let Some(field) = field else {
        return;
    };
    focus_text_input(&manager, &field);
    let caret = r.read().unwrap().fields.caret.clone();
    set_gui_visible(r, caret.as_ref(), true);
    update_caret(r);
}

pub fn focus_text_input_controller(controller: &TextInputController) {
    focus_runtime(&get_gui_controller_runtime(controller));
}

pub fn get_text_input_controller_signals(
    controller: &TextInputController,
) -> Ref<TextInputControllerSignals> {
    return get_gui_controller_runtime(controller)
        .read()
        .unwrap()
        .fields
        .signals
        .clone();
}

fn keyboard_event_to_input(data: &KeyboardEventData) -> InputKeyboardData {
    return InputKeyboardData {
        alt_key: data.alt_key,
        caps_lock: false,
        code: data.key.clone(),
        ctrl_key: data.ctrl_key,
        key: data.key.clone(),
        key_code: data.key_code,
        location: 0,
        meta_key: data.meta_key,
        modifier: 0,
        num_lock: false,
        repeat: false,
        shift_key: data.shift_key,
        time_stamp: 0.0,
    };
}

fn update_caret(r: &Ref<GuiControllerRuntime<TextInputControllerFields>>) {
    let (field, caret, manager) = {
        let s = r.read().unwrap();
        (
            s.fields.text_field.clone(),
            s.fields.caret.clone(),
            s.fields.manager.clone(),
        )
    };
    let (Some(field), Some(_)) = (field, caret) else {
        return;
    };
    let focused = manager
        .read()
        .unwrap()
        .focused
        .as_ref()
        .map(|current| Arc::ptr_eq(current, &field))
        .unwrap_or(false);
    if !focused {
        return;
    }
    let runtime = get_rich_text_runtime(&field.read().unwrap());
    let label = runtime.read().unwrap().text_label.clone();
    let layout = label.read().unwrap().text_layout.clone();
    let Some(layout) = layout else {
        return;
    };
    let mut rectangle = TextSelectionRectangle {
        height: 0.0,
        line_index: 0,
        width: 0.0,
        x: 0.0,
        y: 0.0,
    };
    get_text_input_caret_rectangle(&mut rectangle, &field, &layout.read().unwrap());
    let caret = r.read().unwrap().fields.caret.clone();
    set_gui_position(r, caret.as_ref(), GuiOrientation::Horizontal, rectangle.x);
    let caret = r.read().unwrap().fields.caret.clone();
    set_gui_position(r, caret.as_ref(), GuiOrientation::Vertical, rectangle.y);
}
impl TextInputController {
    pub fn new(options: &TextInputControllerOptions) -> Self {
        return create_text_input_controller(options);
    }
}
