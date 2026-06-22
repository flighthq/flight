//! Pointer event dispatch (mouse, touch, pen) and wheel events.

use flighthq_signals::emit_signal;
use flighthq_types::input::{InputPointerData, MouseWheelMode};

use crate::manager::InputManager;

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

/// Dispatches a pointer-cancel event into `manager`, emitting
/// `signals.on_pointer_cancel`.
///
/// Does nothing when `manager.enabled` is `false`.
pub fn dispatch_pointer_cancel_event(manager: &mut InputManager, data: InputPointerData) {
    if !manager.enabled {
        return;
    }
    emit_signal(&manager.signals.on_pointer_cancel, &data);
}

/// Dispatches a pointer-down event into `manager`, emitting
/// `signals.on_pointer_down`.
///
/// Does nothing when `manager.enabled` is `false`.
pub fn dispatch_pointer_down_event(manager: &mut InputManager, data: InputPointerData) {
    if !manager.enabled {
        return;
    }
    emit_signal(&manager.signals.on_pointer_down, &data);
}

/// Dispatches a pointer-move event into `manager`, emitting
/// `signals.on_pointer_move`.
///
/// Does nothing when `manager.enabled` is `false`.
pub fn dispatch_pointer_move_event(manager: &mut InputManager, data: InputPointerData) {
    if !manager.enabled {
        return;
    }
    emit_signal(&manager.signals.on_pointer_move, &data);
}

/// Dispatches a relative pointer-move event (pointer-lock / captured mouse
/// movement) into `manager`, emitting `signals.on_pointer_move_relative`.
///
/// `delta_x` and `delta_y` carry movement relative to the previous position
/// rather than absolute window coordinates.
///
/// Does nothing when `manager.enabled` is `false`.
pub fn dispatch_pointer_move_relative_event(
    manager: &mut InputManager,
    delta_x: f32,
    delta_y: f32,
    mut data: InputPointerData,
) {
    if !manager.enabled {
        return;
    }
    data.delta_x = delta_x;
    data.delta_y = delta_y;
    data.wheel_mode = MouseWheelMode::Unknown;
    emit_signal(&manager.signals.on_pointer_move_relative, &data);
}

/// Dispatches a pointer-up event into `manager`, emitting
/// `signals.on_pointer_up`.
///
/// Does nothing when `manager.enabled` is `false`.
pub fn dispatch_pointer_up_event(manager: &mut InputManager, data: InputPointerData) {
    if !manager.enabled {
        return;
    }
    emit_signal(&manager.signals.on_pointer_up, &data);
}

/// Dispatches a mouse-wheel event into `manager`, emitting
/// `signals.on_wheel`.
///
/// `delta_x` / `delta_y` are in the units indicated by `mode`.
///
/// Does nothing when `manager.enabled` is `false`.
pub fn dispatch_wheel_event(
    manager: &mut InputManager,
    x: f32,
    y: f32,
    delta_x: f32,
    delta_y: f32,
    mode: MouseWheelMode,
    mut data: InputPointerData,
) {
    if !manager.enabled {
        return;
    }
    data.x = x;
    data.y = y;
    data.delta_x = delta_x;
    data.delta_y = delta_y;
    data.wheel_mode = mode;
    emit_signal(&manager.signals.on_wheel, &data);
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicI32, AtomicU32, Ordering};

    use flighthq_signals::{SignalConnectOptions, connect_signal};

    use super::*;
    use crate::manager::create_input_manager;

    #[test]
    fn dispatch_pointer_down_event_emits_position() {
        let mut m = create_input_manager();
        let x = Arc::new(AtomicI32::new(0));
        let id = Arc::new(AtomicI32::new(0));
        let x2 = Arc::clone(&x);
        let id2 = Arc::clone(&id);
        let _g = connect_signal(
            &m.signals.on_pointer_down,
            Arc::new(move |d: &InputPointerData| {
                x2.store(d.x as i32, Ordering::SeqCst);
                id2.store(d.pointer_id, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        let data = InputPointerData {
            x: 20.0,
            y: 30.0,
            pointer_id: 4,
            ..Default::default()
        };
        dispatch_pointer_down_event(&mut m, data);
        assert_eq!(x.load(Ordering::SeqCst), 20);
        assert_eq!(id.load(Ordering::SeqCst), 4);
    }

    #[test]
    fn dispatch_pointer_down_event_respects_enabled() {
        let mut m = create_input_manager();
        m.enabled = false;
        let fired = Arc::new(AtomicU32::new(0));
        let fired2 = Arc::clone(&fired);
        let _g = connect_signal(
            &m.signals.on_pointer_down,
            Arc::new(move |_d: &InputPointerData| {
                fired2.fetch_add(1, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        dispatch_pointer_down_event(&mut m, InputPointerData::default());
        assert_eq!(fired.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn dispatch_pointer_move_relative_event_carries_deltas() {
        let mut m = create_input_manager();
        let dx = Arc::new(AtomicI32::new(0));
        let dy = Arc::new(AtomicI32::new(0));
        let dx2 = Arc::clone(&dx);
        let dy2 = Arc::clone(&dy);
        let _g = connect_signal(
            &m.signals.on_pointer_move_relative,
            Arc::new(move |d: &InputPointerData| {
                dx2.store(d.delta_x as i32, Ordering::SeqCst);
                dy2.store(d.delta_y as i32, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        dispatch_pointer_move_relative_event(&mut m, 5.0, -3.0, InputPointerData::default());
        assert_eq!(dx.load(Ordering::SeqCst), 5);
        assert_eq!(dy.load(Ordering::SeqCst), -3);
    }

    #[test]
    fn dispatch_wheel_event_carries_delta_and_mode() {
        let mut m = create_input_manager();
        let dy = Arc::new(AtomicI32::new(0));
        let mode = Arc::new(AtomicU32::new(0));
        let dy2 = Arc::clone(&dy);
        let mode2 = Arc::clone(&mode);
        let _g = connect_signal(
            &m.signals.on_wheel,
            Arc::new(move |d: &InputPointerData| {
                dy2.store(d.delta_y as i32, Ordering::SeqCst);
                mode2.store(d.wheel_mode as u32, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        dispatch_wheel_event(
            &mut m,
            0.0,
            0.0,
            0.0,
            -3.0,
            MouseWheelMode::Lines,
            InputPointerData::default(),
        );
        assert_eq!(dy.load(Ordering::SeqCst), -3);
        assert_eq!(mode.load(Ordering::SeqCst), MouseWheelMode::Lines as u32);
    }
}
