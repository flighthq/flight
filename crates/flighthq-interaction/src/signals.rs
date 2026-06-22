//! Re-exports and constructor for [`InteractionSignals`].

pub use flighthq_types::interaction::InteractionSignals;

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

/// Allocates a new [`InteractionSignals`] with no connected listeners.
pub fn create_interaction_signals() -> InteractionSignals {
    InteractionSignals::default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_interaction_signals_default() {
        let s = create_interaction_signals();
        assert!(!s.on_click.has_listeners());
        assert!(!s.on_pointer_down.has_listeners());
    }
}
