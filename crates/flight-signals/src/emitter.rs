use crate::slot::compact_signal_data;
use crate::types::{Signal, SignalData};
use flight_entity::Ref;

pub fn cancel_signal<T>(signal: &Signal<T>) {
    let mut state = signal.data.write().unwrap();
    if let Some(signal_data) = state.as_mut() {
        signal_data.cancelled = true;
    }
}

/// Emits the signal in priority order. The data lock is held only to read or update one entry at
/// a time, never across a callback, so a slot may re-entrantly connect, disconnect, emit or
/// cancel (D4). Slots added ahead of the cursor during the walk are reached, as in TS.
pub(crate) fn dispatch_signal_data<T>(data: &Ref<Option<SignalData<T>>>, args: &T) {
    {
        let mut state = data.write().unwrap();
        let Some(signal_data) = state.as_mut() else {
            return;
        };
        signal_data.cancelled = false;
        signal_data.depth += 1;
    }

    let mut index = 0;
    loop {
        let slot = {
            let state = data.read().unwrap();
            let Some(signal_data) = state.as_ref() else {
                break;
            };
            if index >= signal_data.slots.len() {
                break;
            }
            if signal_data.paused[index] {
                None
            } else {
                signal_data.slots[index].clone()
            }
        };

        if let Some(callback) = slot {
            callback(args);

            let cancelled = data
                .read()
                .unwrap()
                .as_ref()
                .map(|signal_data| signal_data.cancelled)
                .unwrap_or(false);
            if cancelled {
                break;
            }

            let mut state = data.write().unwrap();
            if let Some(signal_data) = state.as_mut()
                && index < signal_data.slots.len()
                && !signal_data.repeat[index]
            {
                signal_data.slots[index] = None;
            }
        }

        index += 1;
    }

    let should_compact = {
        let mut state = data.write().unwrap();
        match state.as_mut() {
            Some(signal_data) => {
                signal_data.depth -= 1;
                signal_data.depth == 0
            }
            None => false,
        }
    };
    if should_compact {
        compact_signal_data(&data);
    }
}

/// Calls the source-required emitter, including custom callbacks and spread wrappers.
pub fn emit_signal<T>(signal: &Signal<T>, args: &T) {
    (signal.emit)(args);
}
