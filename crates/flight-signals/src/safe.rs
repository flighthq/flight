use flight_entity::Ref;

use crate::slot::compact_signal_data;
use crate::types::{Signal, SignalData, SlotId};

/// Emits to the priority-ordered set captured at emission start (TS `emitSignalSafe`).
///
/// Connections added while the snapshot runs wait for a later emission; a connection removed
/// after the snapshot was captured still receives this emission. Nested safe emissions take
/// their own snapshot. Once registrations are consumed before they are invoked, so a nested
/// safe emission cannot repeat one.
pub fn emit_signal_safe<T>(signal: &Signal<T>, args: &T) {
    let data = signal.data.clone();
    let (slots, ids, repeat, paused) = {
        let mut state = data.write().unwrap();
        let Some(signal_data) = state.as_mut() else {
            return;
        };
        let slots = signal_data.slots.clone();
        let ids = signal_data.ids.clone();
        let repeat = signal_data.repeat.clone();
        let paused = signal_data.paused.clone();
        signal_data.cancelled = false;
        signal_data.depth += 1;
        (slots, ids, repeat, paused)
    };

    for index in 0..slots.len() {
        if let Some(slot) = &slots[index] {
            if !paused[index] {
                if !repeat[index] {
                    tombstone_once_slot(&data, ids[index]);
                }
                slot(args);
                let cancelled = data
                    .read()
                    .unwrap()
                    .as_ref()
                    .map(|signal_data| signal_data.cancelled)
                    .unwrap_or(false);
                if cancelled {
                    break;
                }
            }
        }
    }

    if end_safe_signal_dispatch(&data) {
        if compact_signal_data(&data) {
            *signal.emit.write().unwrap() = std::sync::Arc::new(|_| {});
        }
    }
}

fn end_safe_signal_dispatch<T>(data: &Ref<Option<SignalData<T>>>) -> bool {
    let mut state = data.write().unwrap();
    let Some(signal_data) = state.as_mut() else {
        return false;
    };
    signal_data.depth -= 1;
    return signal_data.depth == 0;
}

fn tombstone_once_slot<T>(data: &Ref<Option<SignalData<T>>>, id: SlotId) {
    let mut state = data.write().unwrap();
    let Some(signal_data) = state.as_mut() else {
        return;
    };
    for index in 0..signal_data.slots.len() {
        if signal_data.slots[index].is_some()
            && signal_data.ids[index] == id
            && !signal_data.repeat[index]
        {
            signal_data.slots[index] = None;
            return;
        }
    }
}
