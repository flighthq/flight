//! Rust method sugar over the free functions (D18): inherent convenience methods and the `*Methods`
//! traits on the shared handles. TypeScript keeps the free functions only.
//! flight-compiler: rust-only

use flight_entity::Ref;
use flight_host::InputIngressSource;

use crate::contract::*;

#[cfg(test)]
mod input_binding_sugar_tests {
    use std::sync::Arc;

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

#[cfg(test)]
mod input_gamepad_sugar_tests {
    use super::*;

    #[test]
    fn apply_dead_zone_method_matches_apply_gamepad_stick_dead_zone() {
        let mut method_out = GamepadStickOutput { x: 0.0, y: 0.0 };
        let mut free_out = GamepadStickOutput { x: 0.0, y: 0.0 };
        method_out.apply_dead_zone(0.8, 0.1, 0.2);
        apply_gamepad_stick_dead_zone(&mut free_out, 0.8, 0.1, 0.2);
        assert_eq!(method_out, free_out);
    }
}

#[cfg(test)]
mod input_state_sugar_tests {
    use super::*;
    use crate::input_signals::create_input_manager;

    #[test]
    fn state_new_matches_create_input_state() {
        let method_state = InputState::new();
        let free_state = create_input_state();
        assert_eq!(
            method_state.read().unwrap().keys_down.len(),
            free_state.read().unwrap().keys_down.len()
        );
    }

    #[test]
    fn connect_to_manager_method_matches_connect_input_state_to_input_manager() {
        let method_state = create_input_state();
        let free_state = create_input_state();
        let method_manager = create_input_manager();
        let free_manager = create_input_manager();
        let method_disposer = InputStateMethods::connect_to_manager(&method_state, &method_manager);
        connect_input_state_to_input_manager(&free_state, &free_manager);
        method_disposer();
        assert_eq!(
            method_state.read().unwrap().keys_down.len(),
            free_state.read().unwrap().keys_down.len()
        );
    }

    #[test]
    fn end_frame_method_matches_end_input_state_frame() {
        let method_state = create_input_state();
        let free_state = create_input_state();
        method_state.write().unwrap().just_pressed_keys.insert(1);
        free_state.write().unwrap().just_pressed_keys.insert(1);
        InputStateMethods::end_frame(&method_state);
        end_input_state_frame(&free_state);
        assert_eq!(
            method_state.read().unwrap().just_pressed_keys.len(),
            free_state.read().unwrap().just_pressed_keys.len()
        );
    }

    #[test]
    fn get_gamepad_axis_method_matches_get_input_gamepad_axis() {
        let state = create_input_state();
        state.write().unwrap().axis_values.insert(1, 0.5);
        assert_eq!(
            InputStateMethods::get_gamepad_axis(&state, 0, 1),
            get_input_gamepad_axis(&state, 0, 1)
        );
    }

    #[test]
    fn is_gamepad_button_down_method_matches_is_input_gamepad_button_down() {
        let state = create_input_state();
        assert_eq!(
            InputStateMethods::is_gamepad_button_down(&state, 0, 0),
            is_input_gamepad_button_down(&state, 0, 0)
        );
    }

    #[test]
    fn is_key_down_method_matches_is_input_key_down() {
        let state = create_input_state();
        assert_eq!(
            InputStateMethods::is_key_down(&state, 65),
            is_input_key_down(&state, 65)
        );
    }

    #[test]
    fn is_pointer_button_down_method_matches_is_input_pointer_button_down() {
        let state = create_input_state();
        assert_eq!(
            InputStateMethods::is_pointer_button_down(&state, 0, 0),
            is_input_pointer_button_down(&state, 0, 0)
        );
    }

    #[test]
    fn was_gamepad_button_pressed_method_matches_the_free_function() {
        let state = create_input_state();
        assert_eq!(
            InputStateMethods::was_gamepad_button_pressed(&state, 0, 0),
            was_input_gamepad_button_pressed(&state, 0, 0)
        );
    }

    #[test]
    fn was_gamepad_button_released_method_matches_the_free_function() {
        let state = create_input_state();
        assert_eq!(
            InputStateMethods::was_gamepad_button_released(&state, 0, 0),
            was_input_gamepad_button_released(&state, 0, 0)
        );
    }

    #[test]
    fn was_key_pressed_method_matches_was_input_key_pressed() {
        let state = create_input_state();
        assert_eq!(
            InputStateMethods::was_key_pressed(&state, 65),
            was_input_key_pressed(&state, 65)
        );
    }

    #[test]
    fn was_key_released_method_matches_was_input_key_released() {
        let state = create_input_state();
        assert_eq!(
            InputStateMethods::was_key_released(&state, 65),
            was_input_key_released(&state, 65)
        );
    }
}

#[cfg(test)]
mod input_timer_sugar_tests {
    use std::sync::Arc;

    use super::*;

    fn options() -> InputKeyRepeatOptions {
        return InputKeyRepeatOptions {
            delay: 500.0,
            interval: 33.0,
        };
    }

    #[test]
    fn new_matches_create_input_key_repeat_timer() {
        let method_timer = InputKeyRepeatTimer::new(&options());
        let free_timer = create_input_key_repeat_timer(&options());
        assert_eq!(
            method_timer.read().unwrap().delay_ms,
            free_timer.read().unwrap().delay_ms
        );
    }

    #[test]
    fn advance_method_matches_advance_input_key_repeat_timer() {
        let method_timer = create_input_key_repeat_timer(&options());
        let free_timer = create_input_key_repeat_timer(&options());
        start_input_key_repeat_timer(&method_timer, Arc::new(|| {}), 0.0);
        start_input_key_repeat_timer(&free_timer, Arc::new(|| {}), 0.0);
        method_timer.advance(500.0);
        advance_input_key_repeat_timer(&free_timer, 500.0);
        assert_eq!(
            method_timer.read().unwrap().next_fire_ms,
            free_timer.read().unwrap().next_fire_ms
        );
    }

    #[test]
    fn start_method_matches_start_input_key_repeat_timer() {
        let method_timer = create_input_key_repeat_timer(&options());
        let free_timer = create_input_key_repeat_timer(&options());
        let method_calls = Arc::new(std::sync::Mutex::new(0));
        let captured = method_calls.clone();
        method_timer.start(Arc::new(move || *captured.lock().unwrap() += 1), 10.0);
        let free_calls = Arc::new(std::sync::Mutex::new(0));
        let captured = free_calls.clone();
        start_input_key_repeat_timer(
            &free_timer,
            Arc::new(move || *captured.lock().unwrap() += 1),
            10.0,
        );
        assert_eq!(*method_calls.lock().unwrap(), *free_calls.lock().unwrap());
    }

    #[test]
    fn stop_method_matches_stop_input_key_repeat_timer() {
        let method_timer = create_input_key_repeat_timer(&options());
        let free_timer = create_input_key_repeat_timer(&options());
        start_input_key_repeat_timer(&method_timer, Arc::new(|| {}), 0.0);
        start_input_key_repeat_timer(&free_timer, Arc::new(|| {}), 0.0);
        method_timer.stop();
        stop_input_key_repeat_timer(&free_timer);
        assert_eq!(
            method_timer.read().unwrap().started,
            free_timer.read().unwrap().started
        );
    }
}

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

impl GamepadStickOutput {
    pub fn apply_dead_zone(&mut self, x: f32, y: f32, dead_zone: f32) {
        return apply_gamepad_stick_dead_zone(self, x, y, dead_zone);
    }
}

impl InputState {
    pub fn new() -> Ref<InputState> {
        return create_input_state();
    }
}

/// Sugar for the shared input-state handle. State is interior-mutable, so every method borrows the
/// handle rather than the value.
pub trait InputStateMethods {
    fn connect_to_manager(&self, manager: &Ref<InputManager>) -> InputDisposer;
    fn end_frame(&self);
    fn get_gamepad_axis(&self, gamepad: i32, axis: i32) -> f32;
    fn is_gamepad_button_down(&self, gamepad: i32, button: i32) -> bool;
    fn is_key_down(&self, key_code: i32) -> bool;
    fn is_pointer_button_down(&self, pointer_id: i32, button: i32) -> bool;
    fn was_gamepad_button_pressed(&self, gamepad: i32, button: i32) -> bool;
    fn was_gamepad_button_released(&self, gamepad: i32, button: i32) -> bool;
    fn was_key_pressed(&self, key_code: i32) -> bool;
    fn was_key_released(&self, key_code: i32) -> bool;
}

impl InputStateMethods for Ref<InputState> {
    fn connect_to_manager(&self, manager: &Ref<InputManager>) -> InputDisposer {
        return connect_input_state_to_input_manager(self, manager);
    }

    fn end_frame(&self) {
        return end_input_state_frame(self);
    }

    fn get_gamepad_axis(&self, gamepad: i32, axis: i32) -> f32 {
        return get_input_gamepad_axis(self, gamepad, axis);
    }

    fn is_gamepad_button_down(&self, gamepad: i32, button: i32) -> bool {
        return is_input_gamepad_button_down(self, gamepad, button);
    }

    fn is_key_down(&self, key_code: i32) -> bool {
        return is_input_key_down(self, key_code);
    }

    fn is_pointer_button_down(&self, pointer_id: i32, button: i32) -> bool {
        return is_input_pointer_button_down(self, pointer_id, button);
    }

    fn was_gamepad_button_pressed(&self, gamepad: i32, button: i32) -> bool {
        return was_input_gamepad_button_pressed(self, gamepad, button);
    }

    fn was_gamepad_button_released(&self, gamepad: i32, button: i32) -> bool {
        return was_input_gamepad_button_released(self, gamepad, button);
    }

    fn was_key_pressed(&self, key_code: i32) -> bool {
        return was_input_key_pressed(self, key_code);
    }

    fn was_key_released(&self, key_code: i32) -> bool {
        return was_input_key_released(self, key_code);
    }
}

impl InputKeyRepeatTimer {
    pub fn new(options: &InputKeyRepeatOptions) -> Ref<InputKeyRepeatTimer> {
        return create_input_key_repeat_timer(options);
    }
}

/// Sugar for the shared key-repeat timer handle.
pub trait InputKeyRepeatTimerMethods {
    fn advance(&self, now_ms: f64);
    fn start(&self, callback: InputRepeatCallback, now_ms: f64);
    fn stop(&self);
}

impl InputKeyRepeatTimerMethods for Ref<InputKeyRepeatTimer> {
    // flight-lint: allow(f64) D1: the injected clock is a millisecond duration
    fn advance(&self, now_ms: f64) {
        return advance_input_key_repeat_timer(self, now_ms);
    }

    // flight-lint: allow(f64) D1: the injected clock is a millisecond duration
    fn start(&self, callback: InputRepeatCallback, now_ms: f64) {
        return start_input_key_repeat_timer(self, callback, now_ms);
    }

    fn stop(&self) {
        return stop_input_key_repeat_timer(self);
    }
}
