use std::sync::Arc;
use std::sync::atomic::Ordering;

use flight_entity::Ref;

use crate::types::{Signal, SignalConnectOptions, SignalData, SignalSlot, SlotId};

pub fn clear_signal<T>(signal: &Signal<T>) {
    *signal.emit.write().unwrap() = Arc::new(|_| {});
    *signal.data.write().unwrap() = None;
}

/// Removes tombstoned entries once the outermost emission exits, and detaches the signal when
/// the array becomes empty (the teardown a disconnect during dispatch defers).
pub(crate) fn compact_signal_data<T>(data: &Ref<Option<SignalData<T>>>) -> bool {
    let mut state = data.write().unwrap();
    let Some(signal_data) = state.as_mut() else {
        return false;
    };
    let original_len = signal_data.slots.len();
    let mut write = 0;
    for read in 0..original_len {
        if signal_data.slots[read].is_none() {
            continue;
        }
        if write != read {
            signal_data.slots[write] = signal_data.slots[read].take();
            signal_data.ids[write] = signal_data.ids[read];
            signal_data.priorities[write] = signal_data.priorities[read];
            signal_data.repeat[write] = signal_data.repeat[read];
            signal_data.paused[write] = signal_data.paused[read];
        }
        write += 1;
    }
    if write == original_len {
        return false;
    }
    signal_data.slots.truncate(write);
    signal_data.ids.truncate(write);
    signal_data.priorities.truncate(write);
    signal_data.repeat.truncate(write);
    signal_data.paused.truncate(write);
    if write == 0 {
        *state = None;
        return true;
    }
    return false;
}

/// Connects a slot and returns its registration id. Higher priority runs first; equal priorities
/// keep insertion order (D4).
pub fn connect_signal<T: 'static>(
    signal: &Signal<T>,
    slot: SignalSlot<T>,
    options: Option<&SignalConnectOptions>,
) -> SlotId {
    let priority = options.and_then(|o| o.priority).unwrap_or(0);
    let repeat = !options.and_then(|o| o.once).unwrap_or(false);
    let id = SlotId(signal.next_slot_id.fetch_add(1, Ordering::Relaxed));

    init_signal_data(signal);
    let mut state = signal.data.write().unwrap();
    let signal_data = state.as_mut().unwrap();
    let index = signal_data
        .priorities
        .iter()
        .position(|existing| priority > *existing)
        .unwrap_or(signal_data.slots.len());
    signal_data.slots.insert(index, Some(slot));
    signal_data.ids.insert(index, id);
    signal_data.priorities.insert(index, priority);
    signal_data.repeat.insert(index, repeat);
    signal_data.paused.insert(index, false);
    return id;
}

pub(crate) fn count_live_slots<T>(data: &SignalData<T>) -> usize {
    return data.slots.iter().filter(|slot| slot.is_some()).count();
}

/// Disconnects a registration by id. During a dispatch the entry is tombstoned instead of
/// removed, so an emission already walking the arrays keeps its indices; compaction removes it
/// when the outermost dispatch exits (D4 re-entrancy).
// flight-lint: allow(conform-params) D4: disconnect takes the SlotId returned by connect_signal
pub fn disconnect_signal<T>(signal: &Signal<T>, id: SlotId) {
    let data = signal.data.clone();
    let should_detach = {
        let mut state = data.write().unwrap();
        let Some(signal_data) = state.as_mut() else {
            return;
        };
        let dispatching = signal_data.depth > 0;
        let mut index = signal_data.slots.len();
        while index > 0 {
            index -= 1;
            if signal_data.ids[index] != id {
                continue;
            }
            if dispatching {
                signal_data.slots[index] = None;
            } else {
                signal_data.slots.remove(index);
                signal_data.ids.remove(index);
                signal_data.priorities.remove(index);
                signal_data.repeat.remove(index);
                signal_data.paused.remove(index);
            }
        }
        !dispatching && signal_data.slots.is_empty()
    };
    if should_detach {
        let mut state = data.write().unwrap();
        if state
            .as_ref()
            .map(|signal_data| signal_data.slots.is_empty())
            .unwrap_or(false)
        {
            *state = None;
            drop(state);
            *signal.emit.write().unwrap() = Arc::new(|_| {});
        }
    }
}

pub fn has_signal_slots<T>(signal: &Signal<T>) -> bool {
    let state = signal.data.read().unwrap();
    let Some(signal_data) = state.as_ref() else {
        return false;
    };
    if signal_data.depth == 0 {
        return !signal_data.slots.is_empty();
    }
    return count_live_slots(signal_data) > 0;
}

pub(crate) fn init_signal_data<T: 'static>(signal: &Signal<T>) {
    let mut state = signal.data.write().unwrap();
    if state.is_some() {
        return;
    }
    *state = Some(SignalData {
        slots: Vec::new(),
        ids: Vec::new(),
        priorities: Vec::new(),
        repeat: Vec::new(),
        paused: Vec::new(),
        cancelled: false,
        depth: 0,
    });
    drop(state);
    crate::signal::install_default_signal_emitter(signal);
}

// flight-lint: allow(conform-params) D4: connectivity is queried by SlotId, not by function identity
pub fn is_slot_connected<T>(signal: &Signal<T>, id: SlotId) -> bool {
    let state = signal.data.read().unwrap();
    let Some(signal_data) = state.as_ref() else {
        return false;
    };
    return signal_data
        .slots
        .iter()
        .zip(signal_data.ids.iter())
        .any(|(slot, slot_id)| slot.is_some() && *slot_id == id);
}

/// Pauses or resumes one registration in place (priority order is preserved). Returns false when
/// the registration no longer exists, so resuming a torn-down connection cannot resurrect it.
pub(crate) fn set_slot_paused<T>(signal: &Signal<T>, id: SlotId, paused: bool) -> bool {
    let mut state = signal.data.write().unwrap();
    let Some(signal_data) = state.as_mut() else {
        return false;
    };
    for index in 0..signal_data.slots.len() {
        if signal_data.slots[index].is_some() && signal_data.ids[index] == id {
            signal_data.paused[index] = paused;
            return true;
        }
    }
    return false;
}
