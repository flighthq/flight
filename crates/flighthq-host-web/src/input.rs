//! DOM event translation into `flighthq-input`.
//!
//! The translation functions take plain value snapshots of the DOM event
//! fields (so they are unit-testable without a browser) and produce the
//! normalized [`InputPointerData`] / [`InputKeyboardData`] the input dispatch
//! functions consume. The wasm-only `attach_web_input` / `detach_web_input`
//! wiring lives at the bottom, gated on `target_arch = "wasm32"`.

use flighthq_input::get_key_code_from_key_name;
use flighthq_types::input::{InputKeyboardData, InputPointerData, MouseWheelMode, PointerType};

/// Value snapshot of the DOM `PointerEvent` fields the host reads. Decoupling
/// from `web_sys` keeps [`web_pointer_event_to_input_pointer_data`] testable on
/// native targets.
#[derive(Clone, Debug, Default)]
pub struct WebPointerEvent {
    pub alt_key: bool,
    pub button: i32,
    pub buttons: u32,
    pub ctrl_key: bool,
    pub is_primary: bool,
    pub meta_key: bool,
    pub pointer_id: i32,
    /// DOM `pointerType` string: `"mouse"`, `"pen"`, or `"touch"`.
    pub pointer_type: String,
    pub shift_key: bool,
    /// Position already converted to canvas-local CSS pixels.
    pub x: f32,
    pub y: f32,
}

/// Value snapshot of the DOM `WheelEvent` fields the host reads.
#[derive(Clone, Debug, Default)]
pub struct WebWheelEvent {
    pub alt_key: bool,
    pub ctrl_key: bool,
    pub delta_x: f32,
    pub delta_y: f32,
    /// DOM `deltaMode`: 0 = pixel, 1 = line, 2 = page.
    pub delta_mode: u32,
    pub meta_key: bool,
    pub shift_key: bool,
    pub x: f32,
    pub y: f32,
}

/// Value snapshot of the DOM `KeyboardEvent` fields the host reads.
#[derive(Clone, Debug, Default)]
pub struct WebKeyboardEvent {
    pub alt_key: bool,
    pub caps_lock: bool,
    pub code: String,
    pub ctrl_key: bool,
    pub key: String,
    pub meta_key: bool,
    pub num_lock: bool,
    pub repeat: bool,
    pub shift_key: bool,
}

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

/// Translates a DOM keyboard event snapshot into [`InputKeyboardData`].
pub fn web_keyboard_event_to_input_keyboard_data(event: &WebKeyboardEvent) -> InputKeyboardData {
    InputKeyboardData {
        alt_key: event.alt_key,
        caps_lock: event.caps_lock,
        code: event.code.clone(),
        ctrl_key: event.ctrl_key,
        key: event.key.clone(),
        key_code: get_key_code_from_key_name(&event.key),
        // DOM `location` is not carried in the snapshot; default standard location.
        location: 0,
        meta_key: event.meta_key,
        modifier: web_key_modifier_mask(event),
        num_lock: event.num_lock,
        repeat: event.repeat,
        shift_key: event.shift_key,
    }
}

/// Translates a DOM pointer event snapshot into [`InputPointerData`].
pub fn web_pointer_event_to_input_pointer_data(event: &WebPointerEvent) -> InputPointerData {
    InputPointerData {
        alt_key: event.alt_key,
        button: event.button,
        buttons: event.buttons,
        ctrl_key: event.ctrl_key,
        delta_x: 0.0,
        delta_y: 0.0,
        is_primary: event.is_primary,
        meta_key: event.meta_key,
        pointer_id: event.pointer_id,
        pointer_type: web_pointer_type_from_name(&event.pointer_type),
        shift_key: event.shift_key,
        wheel_mode: MouseWheelMode::Unknown,
        x: event.x,
        y: event.y,
    }
}

/// Translates a DOM wheel event snapshot into [`InputPointerData`], mapping
/// `deltaMode` onto [`MouseWheelMode`].
pub fn web_wheel_event_to_input_pointer_data(event: &WebWheelEvent) -> InputPointerData {
    InputPointerData {
        alt_key: event.alt_key,
        button: -1,
        buttons: 0,
        ctrl_key: event.ctrl_key,
        delta_x: event.delta_x,
        delta_y: event.delta_y,
        is_primary: true,
        meta_key: event.meta_key,
        pointer_id: 0,
        pointer_type: PointerType::Mouse,
        shift_key: event.shift_key,
        wheel_mode: web_wheel_mode_from_delta_mode(event.delta_mode),
        x: event.x,
        y: event.y,
    }
}

// ---------------------------------------------------------------------------
// Internal mapping helpers
// ---------------------------------------------------------------------------

fn web_key_modifier_mask(event: &WebKeyboardEvent) -> u32 {
    // The DOM does not expose left/right side; report the generic (left) bit when set,
    // matching the web port's convention of treating the unsided flag as the left modifier.
    flighthq_input::get_key_modifier_from_flags(
        event.shift_key,
        false,
        event.ctrl_key,
        false,
        event.alt_key,
        false,
        event.meta_key,
        false,
        event.caps_lock,
        event.num_lock,
    )
}

fn web_pointer_type_from_name(name: &str) -> PointerType {
    match name {
        "mouse" => PointerType::Mouse,
        "pen" => PointerType::Pen,
        "touch" => PointerType::Touch,
        _ => PointerType::Unknown,
    }
}

fn web_wheel_mode_from_delta_mode(delta_mode: u32) -> MouseWheelMode {
    match delta_mode {
        0 => MouseWheelMode::Pixels,
        1 => MouseWheelMode::Lines,
        2 => MouseWheelMode::Pages,
        _ => MouseWheelMode::Unknown,
    }
}

// ---------------------------------------------------------------------------
// wasm DOM wiring
// ---------------------------------------------------------------------------

#[cfg(target_arch = "wasm32")]
pub use self::wasm_input::{WebInputListeners, attach_web_input, detach_web_input};

#[cfg(target_arch = "wasm32")]
mod wasm_input {
    use std::cell::RefCell;
    use std::rc::Rc;

    use flighthq_input::{
        InputManager, dispatch_keyboard_event, dispatch_pointer_down_event,
        dispatch_pointer_move_event, dispatch_pointer_up_event, dispatch_wheel_event,
    };
    use flighthq_types::input::MouseWheelMode;
    use wasm_bindgen::JsCast;
    use wasm_bindgen::closure::Closure;
    use web_sys::HtmlCanvasElement;

    use super::{
        WebKeyboardEvent, WebPointerEvent, WebWheelEvent,
        web_keyboard_event_to_input_keyboard_data, web_pointer_event_to_input_pointer_data,
        web_wheel_event_to_input_pointer_data,
    };

    /// Live DOM listeners installed by [`attach_web_input`]. Hold this for the
    /// lifetime of the attachment; drop (via [`detach_web_input`]) to remove the
    /// listeners and release the closures.
    pub struct WebInputListeners {
        canvas: HtmlCanvasElement,
        pointer_down: Closure<dyn FnMut(web_sys::PointerEvent)>,
        pointer_move: Closure<dyn FnMut(web_sys::PointerEvent)>,
        pointer_up: Closure<dyn FnMut(web_sys::PointerEvent)>,
        wheel: Closure<dyn FnMut(web_sys::WheelEvent)>,
        key_down: Closure<dyn FnMut(web_sys::KeyboardEvent)>,
        key_up: Closure<dyn FnMut(web_sys::KeyboardEvent)>,
    }

    /// Installs DOM pointer/wheel/keyboard listeners on `canvas` that dispatch
    /// into the shared `manager`. Pointer positions are converted to
    /// canvas-local CSS pixels. Returns the listener handle; keep it alive.
    pub fn attach_web_input(
        canvas: &HtmlCanvasElement,
        manager: Rc<RefCell<InputManager>>,
    ) -> WebInputListeners {
        let pointer_down = make_pointer_listener(canvas, Rc::clone(&manager), PointerPhase::Down);
        let pointer_move = make_pointer_listener(canvas, Rc::clone(&manager), PointerPhase::Move);
        let pointer_up = make_pointer_listener(canvas, Rc::clone(&manager), PointerPhase::Up);
        let wheel = make_wheel_listener(canvas, Rc::clone(&manager));
        let key_down = make_key_listener(Rc::clone(&manager), true);
        let key_up = make_key_listener(Rc::clone(&manager), false);

        let target: &web_sys::EventTarget = canvas.as_ref();
        let _ = target
            .add_event_listener_with_callback("pointerdown", pointer_down.as_ref().unchecked_ref());
        let _ = target
            .add_event_listener_with_callback("pointermove", pointer_move.as_ref().unchecked_ref());
        let _ = target
            .add_event_listener_with_callback("pointerup", pointer_up.as_ref().unchecked_ref());
        let _ = target.add_event_listener_with_callback("wheel", wheel.as_ref().unchecked_ref());
        let _ =
            target.add_event_listener_with_callback("keydown", key_down.as_ref().unchecked_ref());
        let _ = target.add_event_listener_with_callback("keyup", key_up.as_ref().unchecked_ref());

        WebInputListeners {
            canvas: canvas.clone(),
            pointer_down,
            pointer_move,
            pointer_up,
            wheel,
            key_down,
            key_up,
        }
    }

    /// Removes the DOM listeners installed by [`attach_web_input`] and drops the
    /// closures. This is a `dispose_*`-style teardown (detach-and-release-to-GC),
    /// not a resource free.
    pub fn detach_web_input(listeners: WebInputListeners) {
        let target: &web_sys::EventTarget = listeners.canvas.as_ref();
        let _ = target.remove_event_listener_with_callback(
            "pointerdown",
            listeners.pointer_down.as_ref().unchecked_ref(),
        );
        let _ = target.remove_event_listener_with_callback(
            "pointermove",
            listeners.pointer_move.as_ref().unchecked_ref(),
        );
        let _ = target.remove_event_listener_with_callback(
            "pointerup",
            listeners.pointer_up.as_ref().unchecked_ref(),
        );
        let _ = target
            .remove_event_listener_with_callback("wheel", listeners.wheel.as_ref().unchecked_ref());
        let _ = target.remove_event_listener_with_callback(
            "keydown",
            listeners.key_down.as_ref().unchecked_ref(),
        );
        let _ = target.remove_event_listener_with_callback(
            "keyup",
            listeners.key_up.as_ref().unchecked_ref(),
        );
        // `listeners` drops here, freeing the closures.
    }

    #[derive(Copy, Clone)]
    enum PointerPhase {
        Down,
        Move,
        Up,
    }

    fn make_pointer_listener(
        canvas: &HtmlCanvasElement,
        manager: Rc<RefCell<InputManager>>,
        phase: PointerPhase,
    ) -> Closure<dyn FnMut(web_sys::PointerEvent)> {
        let canvas = canvas.clone();
        Closure::wrap(Box::new(move |event: web_sys::PointerEvent| {
            let (local_x, local_y) =
                canvas_local_position(&canvas, event.client_x(), event.client_y());
            let snapshot = WebPointerEvent {
                alt_key: event.alt_key(),
                button: event.button() as i32,
                buttons: event.buttons() as u32,
                ctrl_key: event.ctrl_key(),
                is_primary: event.is_primary(),
                meta_key: event.meta_key(),
                pointer_id: event.pointer_id(),
                pointer_type: event.pointer_type(),
                shift_key: event.shift_key(),
                x: local_x,
                y: local_y,
            };
            let data = web_pointer_event_to_input_pointer_data(&snapshot);
            let mut manager = manager.borrow_mut();
            match phase {
                PointerPhase::Down => dispatch_pointer_down_event(&mut manager, data),
                PointerPhase::Move => dispatch_pointer_move_event(&mut manager, data),
                PointerPhase::Up => dispatch_pointer_up_event(&mut manager, data),
            }
        }) as Box<dyn FnMut(web_sys::PointerEvent)>)
    }

    fn make_wheel_listener(
        canvas: &HtmlCanvasElement,
        manager: Rc<RefCell<InputManager>>,
    ) -> Closure<dyn FnMut(web_sys::WheelEvent)> {
        let canvas = canvas.clone();
        Closure::wrap(Box::new(move |event: web_sys::WheelEvent| {
            let (local_x, local_y) =
                canvas_local_position(&canvas, event.client_x(), event.client_y());
            let snapshot = WebWheelEvent {
                alt_key: event.alt_key(),
                ctrl_key: event.ctrl_key(),
                delta_x: event.delta_x() as f32,
                delta_y: event.delta_y() as f32,
                delta_mode: event.delta_mode(),
                meta_key: event.meta_key(),
                shift_key: event.shift_key(),
                x: local_x,
                y: local_y,
            };
            let data = web_wheel_event_to_input_pointer_data(&snapshot);
            let wheel_mode = data.wheel_mode;
            let mut manager = manager.borrow_mut();
            dispatch_wheel_event(
                &mut manager,
                data.x,
                data.y,
                data.delta_x,
                data.delta_y,
                if wheel_mode == MouseWheelMode::Unknown {
                    MouseWheelMode::Pixels
                } else {
                    wheel_mode
                },
                data,
            );
        }) as Box<dyn FnMut(web_sys::WheelEvent)>)
    }

    fn make_key_listener(
        manager: Rc<RefCell<InputManager>>,
        is_down: bool,
    ) -> Closure<dyn FnMut(web_sys::KeyboardEvent)> {
        Closure::wrap(Box::new(move |event: web_sys::KeyboardEvent| {
            let snapshot = WebKeyboardEvent {
                alt_key: event.alt_key(),
                caps_lock: event.get_modifier_state("CapsLock"),
                code: event.code(),
                ctrl_key: event.ctrl_key(),
                key: event.key(),
                meta_key: event.meta_key(),
                num_lock: event.get_modifier_state("NumLock"),
                repeat: event.repeat(),
                shift_key: event.shift_key(),
            };
            let data = web_keyboard_event_to_input_keyboard_data(&snapshot);
            let mut manager = manager.borrow_mut();
            dispatch_keyboard_event(&mut manager, data, is_down);
        }) as Box<dyn FnMut(web_sys::KeyboardEvent)>)
    }

    // Converts viewport client coordinates into canvas-local CSS pixels.
    fn canvas_local_position(
        canvas: &HtmlCanvasElement,
        client_x: i32,
        client_y: i32,
    ) -> (f32, f32) {
        let rect = canvas.get_bounding_client_rect();
        (
            client_x as f32 - rect.left() as f32,
            client_y as f32 - rect.top() as f32,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn web_keyboard_event_to_input_keyboard_data_resolves_key_code_and_modifier() {
        let event = WebKeyboardEvent {
            ctrl_key: true,
            key: "A".to_string(),
            code: "KeyA".to_string(),
            ..Default::default()
        };
        let data = web_keyboard_event_to_input_keyboard_data(&event);
        assert_eq!(data.key, "A");
        assert_eq!(data.code, "KeyA");
        // 'A' lower-cases to 'a' = 0x61.
        assert_eq!(data.key_code, 0x61);
        assert!(data.ctrl_key);
        assert_ne!(data.modifier, 0);
    }

    #[test]
    fn web_pointer_event_to_input_pointer_data_maps_type_and_position() {
        let event = WebPointerEvent {
            button: 0,
            buttons: 1,
            is_primary: true,
            pointer_id: 7,
            pointer_type: "touch".to_string(),
            x: 12.5,
            y: 34.0,
            ..Default::default()
        };
        let data = web_pointer_event_to_input_pointer_data(&event);
        assert_eq!(data.pointer_type, PointerType::Touch);
        assert_eq!(data.pointer_id, 7);
        assert_eq!(data.buttons, 1);
        assert_eq!(data.x, 12.5);
        assert_eq!(data.y, 34.0);
        assert_eq!(data.wheel_mode, MouseWheelMode::Unknown);
    }

    #[test]
    fn web_pointer_event_to_input_pointer_data_unknown_type_falls_back() {
        let event = WebPointerEvent {
            pointer_type: "".to_string(),
            ..Default::default()
        };
        let data = web_pointer_event_to_input_pointer_data(&event);
        assert_eq!(data.pointer_type, PointerType::Unknown);
    }

    #[test]
    fn web_wheel_event_to_input_pointer_data_maps_delta_mode() {
        let pixels = web_wheel_event_to_input_pointer_data(&WebWheelEvent {
            delta_mode: 0,
            delta_y: 100.0,
            ..Default::default()
        });
        assert_eq!(pixels.wheel_mode, MouseWheelMode::Pixels);
        assert_eq!(pixels.delta_y, 100.0);

        let lines = web_wheel_event_to_input_pointer_data(&WebWheelEvent {
            delta_mode: 1,
            ..Default::default()
        });
        assert_eq!(lines.wheel_mode, MouseWheelMode::Lines);

        let pages = web_wheel_event_to_input_pointer_data(&WebWheelEvent {
            delta_mode: 2,
            ..Default::default()
        });
        assert_eq!(pages.wheel_mode, MouseWheelMode::Pages);

        let unknown = web_wheel_event_to_input_pointer_data(&WebWheelEvent {
            delta_mode: 9,
            ..Default::default()
        });
        assert_eq!(unknown.wheel_mode, MouseWheelMode::Unknown);
    }

    #[test]
    fn web_wheel_event_to_input_pointer_data_uses_mouse_pointer() {
        let data = web_wheel_event_to_input_pointer_data(&WebWheelEvent::default());
        assert_eq!(data.pointer_type, PointerType::Mouse);
        assert_eq!(data.button, -1);
    }
}
