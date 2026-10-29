use flight_entity::Ref;

use crate::emitter::signal_data_cancelled;
use crate::slot::compact_signal_data;
use crate::types::{Signal, SignalData, SignalSlot, SlotId};

/// Emits to the priority-ordered set captured at emission start (TS `emitSignalSafe`).
///
/// Connections added while the snapshot runs wait for a later emission; a connection removed
/// after the snapshot was captured still receives this emission. Nested safe emissions take
/// their own snapshot. Once registrations are consumed before they are invoked, so a nested
/// safe emission cannot repeat one.
pub fn emit_signal_safe<T>(signal: &Signal<T>, args: &T) {
    let Some(snapshot) = take_safe_signal_snapshot(&signal.data) else {
        return;
    };
    let (slots, ids, repeat, paused) = snapshot;

    for index in 0..slots.len() {
        if let Some(slot) = &slots[index] {
            if !paused[index] {
                if !repeat[index] {
                    tombstone_once_slot(&signal.data, ids[index]);
                }
                slot(args);
                if signal_data_cancelled(&signal.data) {
                    break;
                }
            }
        }
    }

    if end_safe_signal_dispatch(&signal.data) && compact_signal_data(&signal.data) {
        *signal.data.write().unwrap() = None;
        *signal.emit.write().unwrap() = std::sync::Arc::new(|_| {});
    }
}

fn take_safe_signal_snapshot<T>(
    data: &Ref<Option<SignalData<T>>>,
) -> Option<(
    Vec<Option<SignalSlot<T>>>,
    Vec<SlotId>,
    Vec<bool>,
    Vec<bool>,
)> {
    let mut state = data.write().unwrap();
    let Some(signal_data) = state.as_mut() else {
        return None;
    };
    let mut slots: Vec<Option<SignalSlot<T>>> = Vec::new();
    for slot in &signal_data.slots {
        slots.push(slot.clone());
    }
    let mut ids: Vec<SlotId> = Vec::new();
    for id in &signal_data.ids {
        ids.push(*id);
    }
    let mut repeat: Vec<bool> = Vec::new();
    for value in &signal_data.repeat {
        repeat.push(*value);
    }
    let mut paused: Vec<bool> = Vec::new();
    for value in &signal_data.paused {
        paused.push(*value);
    }
    signal_data.cancelled = false;
    signal_data.depth += 1;
    return Some((slots, ids, repeat, paused));
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
            && signal_data.ids[index].value == id.value
            && !signal_data.repeat[index]
        {
            signal_data.slots[index] = None;
            return;
        }
    }
}
