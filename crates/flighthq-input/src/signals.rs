//! Re-exports and constructor for [`InputSignals`].

pub use flighthq_types::input::InputSignals;

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

/// Allocates a new [`InputSignals`] with no connected listeners.
pub fn create_input_signals() -> InputSignals {
    InputSignals::default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_input_signals_default() {
        let s = create_input_signals();
        assert!(!s.on_key_down.has_listeners());
        assert!(!s.on_pointer_down.has_listeners());
    }
}
