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
/// cancel (D4). Slots added ahead of the cursor during the walk are reached, as in TS. A once
/// registration is taken out before its callback runs, so a nested emission cannot repeat it; the
/// local handle is dropped only after the callback returns, outside every lock.
pub(crate) fn dispatch_signal_data<T>(data: &Ref<Option<SignalData<T>>>, args: &T) -> bool {
    if !begin_signal_dispatch(data) {
        return false;
    }

    let mut index = 0;
    while signal_dispatch_has_index(data, index) {
        let slot = take_signal_dispatch_slot(data, index);

        if let Some(callback) = slot {
            callback(args);
            drop(callback);

            if signal_data_cancelled(data) {
                break;
            }
        }

        index += 1;
    }

    if end_signal_dispatch(data) {
        return compact_signal_data(data);
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

// The slot to call at `index`: a shared handle for a repeating registration, or the registration
// itself for a once slot, which is tombstoned here so it is consumed before it runs.
fn take_signal_dispatch_slot<T>(
    data: &Ref<Option<SignalData<T>>>,
    index: usize,
) -> Option<SignalSlot<T>> {
    let mut state = data.write().unwrap();
    let Some(signal_data) = state.as_mut() else {
        return None;
    };
    if index >= signal_data.slots.len() || signal_data.paused[index] {
        return None;
    }
    if !signal_data.repeat[index] {
        return signal_data.slots[index].take();
    }
    return signal_data.slots[index].clone();
}
