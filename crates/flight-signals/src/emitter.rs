use crate::slot::compact_signal_data;
use crate::types::{Signal, SignalData, SignalSlot};
use flight_entity::Ref;

fn begin_signal_dispatch<T>(data: &Ref<Option<SignalData<T>>>) -> bool {
    let mut state = data.write().unwrap();
    let Some(signal_data) = state.as_mut() else {
        return false;
    };
    signal_data.cancelled = false;
    signal_data.depth += 1;
    return true;
}

pub fn cancel_signal<T>(signal: &Signal<T>) {
    let mut state = signal.data.write().unwrap();
    if let Some(signal_data) = state.as_mut() {
        signal_data.cancelled = true;
    }
}

/// Emits the signal in priority order. The data lock is held only to read or update one entry at
/// a time, never across a callback, so a slot may re-entrantly connect, disconnect, emit or
/// cancel (D4). Slots added ahead of the cursor during the walk are reached, as in TS.
pub(crate) fn dispatch_signal_data<T>(signal: &Signal<T>, args: &T) -> bool {
    if !begin_signal_dispatch(&signal.data) {
        return false;
    }

    let mut index = 0;
    while signal_dispatch_has_index(&signal.data, index) {
        let slot = get_signal_dispatch_slot(&signal.data, index);

        if let Some(callback) = slot {
            callback(args);

            let cancelled = signal_data_cancelled(&signal.data);
            if cancelled {
                break;
            }

            let mut state = signal.data.write().unwrap();
            if let Some(signal_data) = state.as_mut() {
                if index < signal_data.slots.len() && !signal_data.repeat[index] {
                    signal_data.slots[index] = None;
                }
            }
        }

        index += 1;
    }

    if end_signal_dispatch(&signal.data) {
        return compact_signal_data(&signal.data);
    }
    return false;
}

/// Calls the source-required emitter, including custom callbacks and spread wrappers.
pub fn emit_signal<T>(signal: &Signal<T>, args: &T) {
    let emit = signal.emit.read().unwrap().clone();
    emit(args);
}

fn end_signal_dispatch<T>(data: &Ref<Option<SignalData<T>>>) -> bool {
    let mut state = data.write().unwrap();
    let Some(signal_data) = state.as_mut() else {
        return false;
    };
    signal_data.depth -= 1;
    return signal_data.depth == 0;
}

fn get_signal_dispatch_slot<T>(
    data: &Ref<Option<SignalData<T>>>,
    index: usize,
) -> Option<SignalSlot<T>> {
    let state = data.read().unwrap();
    let Some(signal_data) = state.as_ref() else {
        return None;
    };
    if index >= signal_data.slots.len() || signal_data.paused[index] {
        return None;
    }
    return signal_data.slots[index].clone();
}

pub(crate) fn signal_data_cancelled<T>(data: &Ref<Option<SignalData<T>>>) -> bool {
    let state = data.read().unwrap();
    let Some(signal_data) = state.as_ref() else {
        return false;
    };
    return signal_data.cancelled;
}

fn signal_dispatch_has_index<T>(data: &Ref<Option<SignalData<T>>>, index: usize) -> bool {
    let state = data.read().unwrap();
    let Some(signal_data) = state.as_ref() else {
        return false;
    };
    return index < signal_data.slots.len();
}
