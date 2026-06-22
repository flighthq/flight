//! [`InputManager`] and its lifecycle functions.

pub use flighthq_types::input::InputManager;

use flighthq_signals::disconnect_all_signals;

use crate::signals::create_input_signals;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/// Allocates a new [`InputManager`] with `enabled = true` and no connected
/// listeners.
pub fn create_input_manager() -> InputManager {
    InputManager {
        enabled: true,
        signals: create_input_signals(),
    }
}

/// Disconnects all signal listeners and releases any internal resources owned
/// by `manager`.
///
/// The manager is left in an inert state: `enabled` is set to `false` and all
/// signals are reset.
pub fn dispose_input_manager(manager: &mut InputManager) {
    let s = &manager.signals;
    disconnect_all_signals(&s.on_gamepad_axis_move);
    disconnect_all_signals(&s.on_gamepad_button_down);
    disconnect_all_signals(&s.on_gamepad_button_up);
    disconnect_all_signals(&s.on_gamepad_connect);
    disconnect_all_signals(&s.on_gamepad_disconnect);
    disconnect_all_signals(&s.on_key_down);
    disconnect_all_signals(&s.on_key_up);
    disconnect_all_signals(&s.on_pointer_cancel);
    disconnect_all_signals(&s.on_pointer_down);
    disconnect_all_signals(&s.on_pointer_move);
    disconnect_all_signals(&s.on_pointer_move_relative);
    disconnect_all_signals(&s.on_pointer_up);
    disconnect_all_signals(&s.on_text_edit);
    disconnect_all_signals(&s.on_text_input);
    disconnect_all_signals(&s.on_wheel);
    manager.enabled = false;
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::sync::Arc;

    use flighthq_signals::{SignalConnectOptions, connect_signal};
    use flighthq_types::input::InputPointerData;

    #[test]
    fn create_input_manager_enabled_by_default() {
        let m = create_input_manager();
        assert!(m.enabled);
    }

    #[test]
    fn dispose_input_manager_disconnects_and_disables() {
        let mut m = create_input_manager();
        let guard = connect_signal(
            &m.signals.on_pointer_down,
            Arc::new(|_d: &InputPointerData| {}),
            SignalConnectOptions::default(),
        );
        assert!(m.signals.on_pointer_down.has_listeners());
        // Keep the guard alive across dispose so the disconnect comes from
        // dispose, not from the guard dropping.
        std::mem::forget(guard);
        dispose_input_manager(&mut m);
        assert!(!m.signals.on_pointer_down.has_listeners());
        assert!(!m.enabled);
    }
}
