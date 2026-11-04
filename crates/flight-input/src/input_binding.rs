use std::sync::Arc;

use flight_entity::Ref;
use flight_host::InputIngressSource;
use flight_signals::emit_signal;

use crate::types::*;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum InputBindingKind {
    Gamepad,
    Keyboard,
    Pointer,
    RelativePointer,
    Text,
    Wheel,
}

#[derive(Clone)]
pub(crate) struct InputBinding {
    pub(crate) source: InputIngressSource,
    pub(crate) kind: InputBindingKind,
    pub(crate) release: InputIngressRelease,
}

#[derive(Clone, Default)]
pub(crate) struct InputManagerRuntime {
    pub(crate) sink: Option<InputIngressSink>,
    pub(crate) bindings: Vec<InputBinding>,
}

/// Attaches gamepad ingress (TS `attachGamepadInput`). The release is origin-pinned per manager,
/// source identity and input kind.
pub fn attach_gamepad_input(
    host_input_ingress: &HostInputIngressCapability,
    manager: &Ref<InputManager>,
    source: &InputIngressSource,
    options: Option<&AttachInputOptions>,
) {
    let sink = get_or_create_sink(manager);
    let release = (host_input_ingress.attach_gamepad)(source, sink, options);
    set_input_binding(manager, source, InputBindingKind::Gamepad, release);
}

/// Attaches keyboard ingress (TS `attachKeyboardInput`).
pub fn attach_keyboard_input(
    host_input_ingress: &HostInputIngressCapability,
    manager: &Ref<InputManager>,
    source: &InputIngressSource,
    options: Option<&AttachInputOptions>,
) {
    let sink = get_or_create_sink(manager);
    let release = (host_input_ingress.attach_keyboard)(source, sink, options);
    set_input_binding(manager, source, InputBindingKind::Keyboard, release);
}

/// Attaches pointer ingress (TS `attachPointerInput`).
pub fn attach_pointer_input(
    host_input_ingress: &HostInputIngressCapability,
    manager: &Ref<InputManager>,
    source: &InputIngressSource,
    options: Option<&AttachInputOptions>,
) {
    let sink = get_or_create_sink(manager);
    let release = (host_input_ingress.attach_pointer)(source, sink, options);
    set_input_binding(manager, source, InputBindingKind::Pointer, release);
}

/// Attaches relative-pointer ingress (TS `attachRelativePointerInput`).
pub fn attach_relative_pointer_input(
    host_input_ingress: &HostInputIngressCapability,
    manager: &Ref<InputManager>,
    source: &InputIngressSource,
    options: Option<&AttachInputOptions>,
) {
    let sink = get_or_create_sink(manager);
    let release = (host_input_ingress.attach_relative_pointer)(source, sink, options);
    set_input_binding(manager, source, InputBindingKind::RelativePointer, release);
}

/// Attaches text ingress (TS `attachTextInput`).
pub fn attach_text_input(
    host_input_ingress: &HostInputIngressCapability,
    manager: &Ref<InputManager>,
    source: &InputIngressSource,
    options: Option<&AttachInputOptions>,
) {
    let sink = get_or_create_sink(manager);
    let release = (host_input_ingress.attach_text)(source, sink, options);
    set_input_binding(manager, source, InputBindingKind::Text, release);
}

/// Attaches wheel ingress (TS `attachWheelInput`).
pub fn attach_wheel_input(
    host_input_ingress: &HostInputIngressCapability,
    manager: &Ref<InputManager>,
    source: &InputIngressSource,
    options: Option<&AttachInputOptions>,
) {
    let sink = get_or_create_sink(manager);
    let release = (host_input_ingress.attach_wheel)(source, sink, options);
    set_input_binding(manager, source, InputBindingKind::Wheel, release);
}

fn build_input_ingress_sink(manager: &Ref<InputManager>) -> InputIngressSink {
    let captured = manager.clone();
    let gamepad_axis_move: Arc<dyn Fn(&InputGamepadAxisData) + Send + Sync> = {
        let manager = captured.clone();
        Arc::new(move |data: &InputGamepadAxisData| emit_gamepad_axis_move(&manager, data))
    };
    let gamepad_button_down: Arc<dyn Fn(&InputGamepadButtonData) + Send + Sync> = {
        let manager = captured.clone();
        Arc::new(move |data: &InputGamepadButtonData| emit_gamepad_button_down(&manager, data))
    };
    let gamepad_button_up: Arc<dyn Fn(&InputGamepadButtonData) + Send + Sync> = {
        let manager = captured.clone();
        Arc::new(move |data: &InputGamepadButtonData| emit_gamepad_button_up(&manager, data))
    };
    let gamepad_connect: Arc<dyn Fn(&InputGamepadConnectData) + Send + Sync> = {
        let manager = captured.clone();
        Arc::new(move |data: &InputGamepadConnectData| emit_gamepad_connect(&manager, data))
    };
    let gamepad_disconnect: Arc<dyn Fn(&InputGamepadConnectData) + Send + Sync> = {
        let manager = captured.clone();
        Arc::new(move |data: &InputGamepadConnectData| emit_gamepad_disconnect(&manager, data))
    };
    let key_down: Arc<dyn Fn(&InputKeyboardData) + Send + Sync> = {
        let manager = captured.clone();
        Arc::new(move |data: &InputKeyboardData| emit_key_down(&manager, data))
    };
    let key_up: Arc<dyn Fn(&InputKeyboardData) + Send + Sync> = {
        let manager = captured.clone();
        Arc::new(move |data: &InputKeyboardData| emit_key_up(&manager, data))
    };
    let pointer_cancel: Arc<dyn Fn(&InputPointerData) + Send + Sync> = {
        let manager = captured.clone();
        Arc::new(move |data: &InputPointerData| emit_pointer_cancel(&manager, data))
    };
    let pointer_down: Arc<dyn Fn(&InputPointerData) + Send + Sync> = {
        let manager = captured.clone();
        Arc::new(move |data: &InputPointerData| emit_pointer_down(&manager, data))
    };
    let pointer_move: Arc<dyn Fn(&InputPointerData) + Send + Sync> = {
        let manager = captured.clone();
        Arc::new(move |data: &InputPointerData| emit_pointer_move(&manager, data))
    };
    let pointer_move_relative: Arc<dyn Fn(&InputPointerData) + Send + Sync> = {
        let manager = captured.clone();
        Arc::new(move |data: &InputPointerData| emit_pointer_move_relative(&manager, data))
    };
    let pointer_up: Arc<dyn Fn(&InputPointerData) + Send + Sync> = {
        let manager = captured.clone();
        Arc::new(move |data: &InputPointerData| emit_pointer_up(&manager, data))
    };
    let text_edit: Arc<dyn Fn(&InputTextData) + Send + Sync> = {
        let manager = captured.clone();
        Arc::new(move |data: &InputTextData| emit_text_edit(&manager, data))
    };
    let text_input: Arc<dyn Fn(&InputTextData) + Send + Sync> = {
        let manager = captured.clone();
        Arc::new(move |data: &InputTextData| emit_text_input(&manager, data))
    };
    let wheel: Arc<dyn Fn(&InputPointerData) + Send + Sync> = {
        let manager = captured.clone();
        Arc::new(move |data: &InputPointerData| emit_wheel(&manager, data))
    };
    let is_enabled: Arc<dyn Fn() -> bool + Send + Sync> = {
        let manager = captured.clone();
        Arc::new(move || is_manager_enabled(&manager))
    };
    return InputIngressSink {
        gamepad_axis_move,
        gamepad_button_down,
        gamepad_button_up,
        gamepad_connect,
        gamepad_disconnect,
        is_enabled,
        key_down,
        key_up,
        pointer_cancel,
        pointer_down,
        pointer_move,
        pointer_move_relative,
        pointer_up,
        text_edit,
        text_input,
        wheel,
    };
}

fn clear_input_binding(
    manager: &Ref<InputManager>,
    source: &InputIngressSource,
    kind: InputBindingKind,
) {
    if let Some(release) = take_input_binding_release(manager, source, kind) {
        release();
    }
}

/// Detaches gamepad ingress for exactly that manager/source binding (TS `detachGamepadInput`).
pub fn detach_gamepad_input(manager: &Ref<InputManager>, source: &InputIngressSource) {
    clear_input_binding(manager, source, InputBindingKind::Gamepad);
}

/// Detaches keyboard ingress (TS `detachKeyboardInput`).
pub fn detach_keyboard_input(manager: &Ref<InputManager>, source: &InputIngressSource) {
    clear_input_binding(manager, source, InputBindingKind::Keyboard);
}

/// Detaches pointer ingress (TS `detachPointerInput`).
pub fn detach_pointer_input(manager: &Ref<InputManager>, source: &InputIngressSource) {
    clear_input_binding(manager, source, InputBindingKind::Pointer);
}

/// Detaches relative-pointer ingress (TS `detachRelativePointerInput`).
pub fn detach_relative_pointer_input(manager: &Ref<InputManager>, source: &InputIngressSource) {
    clear_input_binding(manager, source, InputBindingKind::RelativePointer);
}

/// Detaches text ingress (TS `detachTextInput`).
pub fn detach_text_input(manager: &Ref<InputManager>, source: &InputIngressSource) {
    clear_input_binding(manager, source, InputBindingKind::Text);
}

/// Detaches wheel ingress (TS `detachWheelInput`).
pub fn detach_wheel_input(manager: &Ref<InputManager>, source: &InputIngressSource) {
    clear_input_binding(manager, source, InputBindingKind::Wheel);
}

fn emit_gamepad_axis_move(manager: &Ref<InputManager>, data: &InputGamepadAxisData) {
    if !is_manager_enabled(manager) {
        return;
    }
    let signal = manager.read().unwrap().on_gamepad_axis_move.clone();
    emit_signal(&signal, data);
}

fn emit_gamepad_button_down(manager: &Ref<InputManager>, data: &InputGamepadButtonData) {
    if !is_manager_enabled(manager) {
        return;
    }
    let signal = manager.read().unwrap().on_gamepad_button_down.clone();
    emit_signal(&signal, data);
}

fn emit_gamepad_button_up(manager: &Ref<InputManager>, data: &InputGamepadButtonData) {
    if !is_manager_enabled(manager) {
        return;
    }
    let signal = manager.read().unwrap().on_gamepad_button_up.clone();
    emit_signal(&signal, data);
}

fn emit_gamepad_connect(manager: &Ref<InputManager>, data: &InputGamepadConnectData) {
    if !is_manager_enabled(manager) {
        return;
    }
    let signal = manager.read().unwrap().on_gamepad_connect.clone();
    emit_signal(&signal, data);
}

fn emit_gamepad_disconnect(manager: &Ref<InputManager>, data: &InputGamepadConnectData) {
    if !is_manager_enabled(manager) {
        return;
    }
    let signal = manager.read().unwrap().on_gamepad_disconnect.clone();
    emit_signal(&signal, data);
}

fn emit_key_down(manager: &Ref<InputManager>, data: &InputKeyboardData) {
    if !is_manager_enabled(manager) {
        return;
    }
    let signal = manager.read().unwrap().on_key_down.clone();
    emit_signal(&signal, data);
}

fn emit_key_up(manager: &Ref<InputManager>, data: &InputKeyboardData) {
    if !is_manager_enabled(manager) {
        return;
    }
    let signal = manager.read().unwrap().on_key_up.clone();
    emit_signal(&signal, data);
}

fn emit_pointer_cancel(manager: &Ref<InputManager>, data: &InputPointerData) {
    if !is_manager_enabled(manager) {
        return;
    }
    let signal = manager.read().unwrap().on_pointer_cancel.clone();
    emit_signal(&signal, data);
}

fn emit_pointer_down(manager: &Ref<InputManager>, data: &InputPointerData) {
    if !is_manager_enabled(manager) {
        return;
    }
    let signal = manager.read().unwrap().on_pointer_down.clone();
    emit_signal(&signal, data);
}

fn emit_pointer_move(manager: &Ref<InputManager>, data: &InputPointerData) {
    if !is_manager_enabled(manager) {
        return;
    }
    let signal = manager.read().unwrap().on_pointer_move.clone();
    emit_signal(&signal, data);
}

fn emit_pointer_move_relative(manager: &Ref<InputManager>, data: &InputPointerData) {
    if !is_manager_enabled(manager) {
        return;
    }
    let signal = manager.read().unwrap().on_pointer_move_relative.clone();
    emit_signal(&signal, data);
}

fn emit_pointer_up(manager: &Ref<InputManager>, data: &InputPointerData) {
    if !is_manager_enabled(manager) {
        return;
    }
    let signal = manager.read().unwrap().on_pointer_up.clone();
    emit_signal(&signal, data);
}

fn emit_text_edit(manager: &Ref<InputManager>, data: &InputTextData) {
    if !is_manager_enabled(manager) {
        return;
    }
    let signal = manager.read().unwrap().on_text_edit.clone();
    emit_signal(&signal, data);
}

fn emit_text_input(manager: &Ref<InputManager>, data: &InputTextData) {
    if !is_manager_enabled(manager) {
        return;
    }
    let signal = manager.read().unwrap().on_text_input.clone();
    emit_signal(&signal, data);
}

fn emit_wheel(manager: &Ref<InputManager>, data: &InputPointerData) {
    if !is_manager_enabled(manager) {
        return;
    }
    let signal = manager.read().unwrap().on_wheel.clone();
    emit_signal(&signal, data);
}

// The designated runtime state of `manager`, reached through a typed entity reference.
fn get_input_manager_registry(manager: &mut InputManager) -> &mut InputManagerRuntime {
    return &mut manager.registry;
}

fn get_or_create_sink(manager: &Ref<InputManager>) -> InputIngressSink {
    let candidate = build_input_ingress_sink(manager);
    let mut locked = manager.write().unwrap();
    let registry = get_input_manager_registry(&mut locked);
    if let Some(sink) = registry.sink.as_ref() {
        return sink.clone();
    }
    registry.sink = Some(candidate.clone());
    return candidate;
}

// Whether `binding` attaches `kind` for `source`. Sources are the same when their handles are the same
// allocation; the provider does not take part.
fn is_input_binding_for(
    binding: &InputBinding,
    source: &InputIngressSource,
    kind: InputBindingKind,
) -> bool {
    return binding.kind == kind && Arc::ptr_eq(&binding.source.handle, &source.handle);
}

fn is_manager_enabled(manager: &Ref<InputManager>) -> bool {
    return manager.read().unwrap().enabled;
}

fn set_input_binding(
    manager: &Ref<InputManager>,
    source: &InputIngressSource,
    kind: InputBindingKind,
    release: InputIngressRelease,
) {
    if let Some(previous) = take_input_binding_release(manager, source, kind) {
        previous();
    }
    let mut locked = manager.write().unwrap();
    let registry = get_input_manager_registry(&mut locked);
    registry.bindings.push(InputBinding {
        source: source.clone(),
        kind,
        release,
    });
}

// Removes the binding of `kind` for `source` and returns its release, which the caller runs after the
// manager's lock is released. A manager holds at most one binding per kind and source
// (`set_input_binding` removes the previous one first).
fn take_input_binding_release(
    manager: &Ref<InputManager>,
    source: &InputIngressSource,
    kind: InputBindingKind,
) -> Option<InputIngressRelease> {
    let mut locked = manager.write().unwrap();
    let registry = get_input_manager_registry(&mut locked);
    let mut release = None;
    for binding in registry.bindings.iter() {
        if is_input_binding_for(binding, source, kind) {
            release = Some(binding.release.clone());
            break;
        }
    }
    registry.bindings.retain(|binding| {
        return !is_input_binding_for(binding, source, kind);
    });
    return release;
}
