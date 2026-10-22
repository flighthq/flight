use std::sync::Arc;

use flight_entity::{Entity, Ref, attach_entity_binding, get_entity_binding_as};
use flight_host::InputIngressSource;
use flight_signals::emit_signal;

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::input_signals::create_input_manager;
    use std::sync::Mutex;

    fn source() -> InputIngressSource {
        return InputIngressSource {
            provider: Arc::new(()),
            handle: Arc::new(()),
        };
    }

    fn recording_host(
        log: Arc<Mutex<Vec<String>>>,
        releases: Arc<Mutex<usize>>,
    ) -> HostInputIngressCapability {
        let attach = |kind: &'static str| -> InputIngressAttach {
            let log = log.clone();
            let releases = releases.clone();
            return Arc::new(
                move |_source: &InputIngressSource,
                      _sink: InputIngressSink,
                      _options: Option<&AttachInputOptions>| {
                    log.lock().unwrap().push(kind.to_string());
                    let releases = releases.clone();
                    let release: InputIngressRelease = Arc::new(move || {
                        *releases.lock().unwrap() += 1;
                    });
                    return release;
                },
            );
        };
        return HostInputIngressCapability {
            provider: Arc::new(()),
            attach_gamepad: attach("gamepad"),
            attach_keyboard: attach("keyboard"),
            attach_pointer: attach("pointer"),
            attach_relative_pointer: attach("relativePointer"),
            attach_text: attach("text"),
            attach_wheel: attach("wheel"),
        };
    }

    #[test]
    fn attach_gamepad_method_matches_attach_gamepad_input() {
        compare_attach(
            "gamepad",
            |host, manager, src| {
                host.attach_gamepad(&manager, &src, None);
            },
            attach_gamepad_input,
        );
    }

    #[test]
    fn attach_keyboard_method_matches_attach_keyboard_input() {
        compare_attach(
            "keyboard",
            |host, manager, src| {
                host.attach_keyboard(&manager, &src, None);
            },
            attach_keyboard_input,
        );
    }

    #[test]
    fn attach_pointer_method_matches_attach_pointer_input() {
        compare_attach(
            "pointer",
            |host, manager, src| {
                host.attach_pointer(&manager, &src, None);
            },
            attach_pointer_input,
        );
    }

    #[test]
    fn attach_relative_pointer_method_matches_attach_relative_pointer_input() {
        compare_attach(
            "relativePointer",
            |host, manager, src| {
                host.attach_relative_pointer(&manager, &src, None);
            },
            attach_relative_pointer_input,
        );
    }

    #[test]
    fn attach_text_method_matches_attach_text_input() {
        compare_attach(
            "text",
            |host, manager, src| {
                host.attach_text(&manager, &src, None);
            },
            attach_text_input,
        );
    }

    #[test]
    fn attach_wheel_method_matches_attach_wheel_input() {
        compare_attach(
            "wheel",
            |host, manager, src| {
                host.attach_wheel(&manager, &src, None);
            },
            attach_wheel_input,
        );
    }

    #[test]
    fn detach_gamepad_method_matches_detach_gamepad_input() {
        compare_detach(
            attach_gamepad_input,
            InputManagerMethods::detach_gamepad,
            detach_gamepad_input,
        );
    }

    #[test]
    fn detach_keyboard_method_matches_detach_keyboard_input() {
        compare_detach(
            attach_keyboard_input,
            InputManagerMethods::detach_keyboard,
            detach_keyboard_input,
        );
    }

    #[test]
    fn detach_pointer_method_matches_detach_pointer_input() {
        compare_detach(
            attach_pointer_input,
            InputManagerMethods::detach_pointer,
            detach_pointer_input,
        );
    }

    #[test]
    fn detach_relative_pointer_method_matches_detach_relative_pointer_input() {
        compare_detach(
            attach_relative_pointer_input,
            InputManagerMethods::detach_relative_pointer,
            detach_relative_pointer_input,
        );
    }

    #[test]
    fn detach_text_method_matches_detach_text_input() {
        compare_detach(
            attach_text_input,
            InputManagerMethods::detach_text,
            detach_text_input,
        );
    }

    #[test]
    fn detach_wheel_method_matches_detach_wheel_input() {
        compare_detach(
            attach_wheel_input,
            InputManagerMethods::detach_wheel,
            detach_wheel_input,
        );
    }

    fn compare_attach(
        kind: &str,
        run_method: impl Fn(&HostInputIngressCapability, Ref<InputManager>, InputIngressSource),
        run_free: impl Fn(
            &HostInputIngressCapability,
            &Ref<InputManager>,
            &InputIngressSource,
            Option<&AttachInputOptions>,
        ),
    ) {
        let method_log = Arc::new(Mutex::new(Vec::new()));
        let free_log = Arc::new(Mutex::new(Vec::new()));
        let method_host = recording_host(method_log.clone(), Arc::new(Mutex::new(0)));
        let free_host = recording_host(free_log.clone(), Arc::new(Mutex::new(0)));
        let method_manager = create_input_manager();
        let free_manager = create_input_manager();
        let method_source = source();
        let free_source = source();
        run_method(&method_host, method_manager, method_source);
        run_free(&free_host, &free_manager, &free_source, None);
        assert_eq!(*method_log.lock().unwrap(), vec![kind.to_string()]);
        assert_eq!(*method_log.lock().unwrap(), *free_log.lock().unwrap());
    }

    fn compare_detach(
        attach_free: impl Fn(
            &HostInputIngressCapability,
            &Ref<InputManager>,
            &InputIngressSource,
            Option<&AttachInputOptions>,
        ),
        run_method: impl Fn(&Ref<InputManager>, &InputIngressSource),
        run_free: impl Fn(&Ref<InputManager>, &InputIngressSource),
    ) {
        let method_releases = Arc::new(Mutex::new(0));
        let free_releases = Arc::new(Mutex::new(0));
        let method_host = recording_host(Arc::new(Mutex::new(Vec::new())), method_releases.clone());
        let free_host = recording_host(Arc::new(Mutex::new(Vec::new())), free_releases.clone());
        let method_manager = create_input_manager();
        let free_manager = create_input_manager();
        let method_source = source();
        let free_source = source();
        attach_free(&method_host, &method_manager, &method_source, None);
        attach_free(&free_host, &free_manager, &free_source, None);
        run_method(&method_manager, &method_source);
        run_free(&free_manager, &free_source);
        assert_eq!(
            *method_releases.lock().unwrap(),
            *free_releases.lock().unwrap()
        );
    }
}

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
    let removed = with_manager_runtime_mut(manager, |runtime| {
        let position = runtime.bindings.iter().position(|binding| {
            return binding.kind == kind && Arc::ptr_eq(&binding.source.handle, &source.handle);
        });
        return position.map(|index| runtime.bindings.remove(index).release);
    });
    if let Some(release) = removed {
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
    let signal = {
        let locked = manager.read().unwrap();
        if !locked.enabled {
            return;
        }
        locked.on_gamepad_axis_move.clone()
    };
    emit_signal(&signal, data);
}

fn emit_gamepad_button_down(manager: &Ref<InputManager>, data: &InputGamepadButtonData) {
    let signal = {
        let locked = manager.read().unwrap();
        if !locked.enabled {
            return;
        }
        locked.on_gamepad_button_down.clone()
    };
    emit_signal(&signal, data);
}

fn emit_gamepad_button_up(manager: &Ref<InputManager>, data: &InputGamepadButtonData) {
    let signal = {
        let locked = manager.read().unwrap();
        if !locked.enabled {
            return;
        }
        locked.on_gamepad_button_up.clone()
    };
    emit_signal(&signal, data);
}

fn emit_gamepad_connect(manager: &Ref<InputManager>, data: &InputGamepadConnectData) {
    let signal = {
        let locked = manager.read().unwrap();
        if !locked.enabled {
            return;
        }
        locked.on_gamepad_connect.clone()
    };
    emit_signal(&signal, data);
}

fn emit_gamepad_disconnect(manager: &Ref<InputManager>, data: &InputGamepadConnectData) {
    let signal = {
        let locked = manager.read().unwrap();
        if !locked.enabled {
            return;
        }
        locked.on_gamepad_disconnect.clone()
    };
    emit_signal(&signal, data);
}

fn emit_key_down(manager: &Ref<InputManager>, data: &InputKeyboardData) {
    let signal = {
        let locked = manager.read().unwrap();
        if !locked.enabled {
            return;
        }
        locked.on_key_down.clone()
    };
    emit_signal(&signal, data);
}

fn emit_key_up(manager: &Ref<InputManager>, data: &InputKeyboardData) {
    let signal = {
        let locked = manager.read().unwrap();
        if !locked.enabled {
            return;
        }
        locked.on_key_up.clone()
    };
    emit_signal(&signal, data);
}

fn emit_pointer_cancel(manager: &Ref<InputManager>, data: &InputPointerData) {
    let signal = {
        let locked = manager.read().unwrap();
        if !locked.enabled {
            return;
        }
        locked.on_pointer_cancel.clone()
    };
    emit_signal(&signal, data);
}

fn emit_pointer_down(manager: &Ref<InputManager>, data: &InputPointerData) {
    let signal = {
        let locked = manager.read().unwrap();
        if !locked.enabled {
            return;
        }
        locked.on_pointer_down.clone()
    };
    emit_signal(&signal, data);
}

fn emit_pointer_move(manager: &Ref<InputManager>, data: &InputPointerData) {
    let signal = {
        let locked = manager.read().unwrap();
        if !locked.enabled {
            return;
        }
        locked.on_pointer_move.clone()
    };
    emit_signal(&signal, data);
}

fn emit_pointer_move_relative(manager: &Ref<InputManager>, data: &InputPointerData) {
    let signal = {
        let locked = manager.read().unwrap();
        if !locked.enabled {
            return;
        }
        locked.on_pointer_move_relative.clone()
    };
    emit_signal(&signal, data);
}

fn emit_pointer_up(manager: &Ref<InputManager>, data: &InputPointerData) {
    let signal = {
        let locked = manager.read().unwrap();
        if !locked.enabled {
            return;
        }
        locked.on_pointer_up.clone()
    };
    emit_signal(&signal, data);
}

fn emit_text_edit(manager: &Ref<InputManager>, data: &InputTextData) {
    let signal = {
        let locked = manager.read().unwrap();
        if !locked.enabled {
            return;
        }
        locked.on_text_edit.clone()
    };
    emit_signal(&signal, data);
}

fn emit_text_input(manager: &Ref<InputManager>, data: &InputTextData) {
    let signal = {
        let locked = manager.read().unwrap();
        if !locked.enabled {
            return;
        }
        locked.on_text_input.clone()
    };
    emit_signal(&signal, data);
}

fn emit_wheel(manager: &Ref<InputManager>, data: &InputPointerData) {
    let signal = {
        let locked = manager.read().unwrap();
        if !locked.enabled {
            return;
        }
        locked.on_wheel.clone()
    };
    emit_signal(&signal, data);
}

fn ensure_manager_runtime(manager: &Ref<InputManager>) {
    let mut locked = manager.write().unwrap();
    if get_entity_binding_as::<InputManagerRuntime, InputManager>(&*locked).is_none() {
        attach_entity_binding(&mut *locked, Box::new(InputManagerRuntime::default()));
    }
}

fn get_or_create_sink(manager: &Ref<InputManager>) -> InputIngressSink {
    let candidate = build_input_ingress_sink(manager);
    return with_manager_runtime_mut(manager, |runtime| {
        if let Some(sink) = runtime.sink.as_ref() {
            return sink.clone();
        }
        runtime.sink = Some(candidate);
        return runtime.sink.as_ref().expect("inert sink").clone();
    });
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
    let previous = with_manager_runtime_mut(manager, |runtime| {
        let position = runtime.bindings.iter().position(|binding| {
            return binding.kind == kind && Arc::ptr_eq(&binding.source.handle, &source.handle);
        });
        return position.map(|index| runtime.bindings.remove(index).release);
    });
    if let Some(previous) = previous {
        previous();
    }
    with_manager_runtime_mut(manager, |runtime| {
        runtime.bindings.push(InputBinding {
            source: source.clone(),
            kind,
            release,
        });
    });
}

fn with_manager_runtime_mut<R>(
    manager: &Ref<InputManager>,
    run: impl FnOnce(&mut InputManagerRuntime) -> R,
) -> R {
    ensure_manager_runtime(manager);
    let mut locked = manager.write().unwrap();
    let runtime = locked
        .entity_runtime_mut()
        .data
        .as_mut()
        .expect("manager runtime")
        .binding
        .as_mut()
        .expect("manager runtime binding")
        .downcast_mut::<InputManagerRuntime>()
        .expect("manager runtime type");
    return run(runtime);
}

// ============================================================================
// D18 sugar: capability attach methods and manager detach methods delegate
// ============================================================================

impl HostInputIngressCapability {
    pub fn attach_gamepad(
        &self,
        manager: &Ref<InputManager>,
        source: &InputIngressSource,
        options: Option<&AttachInputOptions>,
    ) {
        return attach_gamepad_input(self, manager, source, options);
    }

    pub fn attach_keyboard(
        &self,
        manager: &Ref<InputManager>,
        source: &InputIngressSource,
        options: Option<&AttachInputOptions>,
    ) {
        return attach_keyboard_input(self, manager, source, options);
    }

    pub fn attach_pointer(
        &self,
        manager: &Ref<InputManager>,
        source: &InputIngressSource,
        options: Option<&AttachInputOptions>,
    ) {
        return attach_pointer_input(self, manager, source, options);
    }

    pub fn attach_relative_pointer(
        &self,
        manager: &Ref<InputManager>,
        source: &InputIngressSource,
        options: Option<&AttachInputOptions>,
    ) {
        return attach_relative_pointer_input(self, manager, source, options);
    }

    pub fn attach_text(
        &self,
        manager: &Ref<InputManager>,
        source: &InputIngressSource,
        options: Option<&AttachInputOptions>,
    ) {
        return attach_text_input(self, manager, source, options);
    }

    pub fn attach_wheel(
        &self,
        manager: &Ref<InputManager>,
        source: &InputIngressSource,
        options: Option<&AttachInputOptions>,
    ) {
        return attach_wheel_input(self, manager, source, options);
    }
}

/// Sugar for the shared manager handle (detach is manager-scoped).
pub trait InputManagerMethods {
    fn detach_gamepad(&self, source: &InputIngressSource);
    fn detach_keyboard(&self, source: &InputIngressSource);
    fn detach_pointer(&self, source: &InputIngressSource);
    fn detach_relative_pointer(&self, source: &InputIngressSource);
    fn detach_text(&self, source: &InputIngressSource);
    fn detach_wheel(&self, source: &InputIngressSource);
}

impl InputManagerMethods for Ref<InputManager> {
    fn detach_gamepad(&self, source: &InputIngressSource) {
        return detach_gamepad_input(self, source);
    }

    fn detach_keyboard(&self, source: &InputIngressSource) {
        return detach_keyboard_input(self, source);
    }

    fn detach_pointer(&self, source: &InputIngressSource) {
        return detach_pointer_input(self, source);
    }

    fn detach_relative_pointer(&self, source: &InputIngressSource) {
        return detach_relative_pointer_input(self, source);
    }

    fn detach_text(&self, source: &InputIngressSource) {
        return detach_text_input(self, source);
    }

    fn detach_wheel(&self, source: &InputIngressSource) {
        return detach_wheel_input(self, source);
    }
}
