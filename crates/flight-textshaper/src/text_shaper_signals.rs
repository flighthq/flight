use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_signals::{clear_signal, create_signal};

use crate::types::*;

/// The construction initializer of the signals entity: a fresh backend-changed signal.
pub fn initialize_text_shaper_signals(out: &mut TextShaperSignals) {
    out.on_backend_changed = create_signal();
}

/// Clears the backend-changed signal and forgets the signals entity; a no-op when not enabled.
// flight-lint: allow(conform-params) D5: caller-owned slot replaces the source module singleton
pub fn dispose_text_shaper_signals(state: &mut TextShaperSignalsState) {
    let Some(signals) = state.signals.take() else {
        return;
    };
    clear_signal(&signals.read().unwrap().on_backend_changed);
}

/// The signals entity, allocated on the first call and returned unchanged after.
// flight-lint: allow(conform-params) D5: caller-owned slot replaces the source module singleton
pub fn enable_text_shaper_signals(state: &mut TextShaperSignalsState) -> Ref<TextShaperSignals> {
    if let Some(signals) = &state.signals {
        return signals.clone();
    }
    let mut out: TextShaperSignals = allocate_entity();
    initialize_text_shaper_signals(&mut out);
    let signals = Arc::new(RwLock::new(out));
    state.signals = Some(signals.clone());
    return signals;
}

/// The enabled signals entity, or `None`.
// flight-lint: allow(conform-params) D5: caller-owned slot replaces the source module singleton
pub fn get_text_shaper_signals(state: &TextShaperSignalsState) -> Option<Ref<TextShaperSignals>> {
    return state.signals.clone();
}
