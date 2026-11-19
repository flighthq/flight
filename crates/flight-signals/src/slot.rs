use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};

use flight_entity::Ref;

use crate::signal::install_default_signal_emitter;
use crate::types::{Signal, SignalConnectOptions, SignalData, SignalSlot, SlotId};

static NEXT_SIGNAL_SLOT_ID: AtomicU32 = AtomicU32::new(1);

/// Detaches every registration. The detached slots are dropped after the data lock is released,
/// so a slot's teardown may call back into this signal.
pub fn clear_signal<T>(signal: &Signal<T>) {
    let mut state = signal.data.write().unwrap();
    let detached = state.take();
    *signal.emit.write().unwrap() = Arc::new(|_| {});
    drop(state);
    drop(detached);
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
            signal_data.slots[write] = signal_data.slots[read].clone();
            signal_data.slots[read] = None;
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
    let slots: &mut Vec<Option<SignalSlot<T>>> = &mut signal_data.slots;
    slots.truncate(write);
    let ids: &mut Vec<SlotId> = &mut signal_data.ids;
    ids.truncate(write);
    let priorities: &mut Vec<i32> = &mut signal_data.priorities;
    priorities.truncate(write);
    let repeat: &mut Vec<bool> = &mut signal_data.repeat;
    repeat.truncate(write);
    let paused: &mut Vec<bool> = &mut signal_data.paused;
    paused.truncate(write);
    if write == 0 {
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
    let id = SlotId {
        value: NEXT_SIGNAL_SLOT_ID.fetch_add(1, Ordering::Relaxed),
    };

    loop {
        init_signal_data(signal);
        let mut state = signal.data.write().unwrap();
        let Some(signal_data) = state.as_mut() else {
            continue;
        };
        let mut index = 0;
        while index < signal_data.priorities.len() && priority <= signal_data.priorities[index] {
            index += 1;
        }
        let slots: &mut Vec<Option<SignalSlot<T>>> = &mut signal_data.slots;
        slots.insert(index, Some(slot));
        let ids: &mut Vec<SlotId> = &mut signal_data.ids;
        ids.insert(index, id);
        let priorities: &mut Vec<i32> = &mut signal_data.priorities;
        priorities.insert(index, priority);
        let repeats: &mut Vec<bool> = &mut signal_data.repeat;
        repeats.insert(index, repeat);
        let paused: &mut Vec<bool> = &mut signal_data.paused;
        paused.insert(index, false);
        return id;
    }
}

pub(crate) fn count_live_slots<T>(data: &SignalData<T>) -> usize {
    let mut live = 0;
    for slot in &data.slots {
        if slot.is_some() {
            live += 1;
        }
    }
    return live;
}

/// Detaches the registration state once it is empty and no dispatch is walking it, resetting
/// `emit` (when given) while the data lock is held so a concurrent connect cannot lose its
/// emitter. The caller drops the returned state after every lock is released.
pub(crate) fn detach_empty_signal_data<T>(
    data: &Ref<Option<SignalData<T>>>,
    emit: Option<&Ref<Arc<dyn Fn(&T) + Send + Sync>>>,
) -> Option<SignalData<T>> {
    let mut state = data.write().unwrap();
    let empty = state
        .as_ref()
        .is_some_and(|signal_data| signal_data.depth == 0 && signal_data.slots.is_empty());
    if !empty {
        return None;
    }
    if let Some(emit) = emit {
        *emit.write().unwrap() = Arc::new(|_| {});
    }
    return state.take();
}

/// Disconnects a registration by id. During a dispatch the entry is tombstoned instead of
/// removed, so an emission already walking the arrays keeps its indices; compaction removes it
/// when the outermost dispatch exits (D4 re-entrancy). The removed slot is dropped after the data
/// lock is released, so its teardown may call back into this signal.
// flight-lint: allow(conform-params) D4: disconnect takes the SlotId returned by connect_signal
pub fn disconnect_signal<T>(signal: &Signal<T>, id: SlotId) {
    let removed = remove_signal_slot(&signal.data, Some(&signal.emit), id);
    drop(removed);
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
    install_default_signal_emitter(signal);
}

// flight-lint: allow(conform-params) D4: connectivity is queried by SlotId, not by function identity
pub fn is_slot_connected<T>(signal: &Signal<T>, id: SlotId) -> bool {
    return is_slot_connected_in(&signal.data, id);
}

pub(crate) fn is_slot_connected_in<T>(data: &Ref<Option<SignalData<T>>>, id: SlotId) -> bool {
    let state = data.read().unwrap();
    let Some(signal_data) = state.as_ref() else {
        return false;
    };
    for index in 0..signal_data.slots.len() {
        if signal_data.slots[index].is_some() && signal_data.ids[index].value == id.value {
            return true;
        }
    }
    return false;
}

/// Removes one registration (tombstoning it during a dispatch) and detaches the state when it is
/// left empty. Nothing is dropped under the lock: the removed slot and any detached state are
/// returned for the caller to drop once the lock is released, because dropping a slot can run
/// arbitrary teardown that calls back into the signal.
pub(crate) fn remove_signal_slot<T>(
    data: &Ref<Option<SignalData<T>>>,
    emit: Option<&Ref<Arc<dyn Fn(&T) + Send + Sync>>>,
    id: SlotId,
) -> (Vec<SignalSlot<T>>, Option<SignalData<T>>) {
    let mut removed: Vec<SignalSlot<T>> = Vec::new();
    let mut state = data.write().unwrap();
    let Some(signal_data) = state.as_mut() else {
        return (removed, None);
    };
    let dispatching = signal_data.depth > 0;
    let mut index = signal_data.slots.len();
    while index > 0 {
        index -= 1;
        if signal_data.ids[index].value != id.value {
            continue;
        }
        let slot = if dispatching {
            signal_data.slots[index].take()
        } else {
            let slots: &mut Vec<Option<SignalSlot<T>>> = &mut signal_data.slots;
            let slot = slots.remove(index);
            let ids: &mut Vec<SlotId> = &mut signal_data.ids;
            ids.remove(index);
            let priorities: &mut Vec<i32> = &mut signal_data.priorities;
            priorities.remove(index);
            let repeats: &mut Vec<bool> = &mut signal_data.repeat;
            repeats.remove(index);
            let paused: &mut Vec<bool> = &mut signal_data.paused;
            paused.remove(index);
            slot
        };
        removed.extend(slot);
    }
    let mut detached = None;
    if !dispatching && signal_data.slots.is_empty() {
        if let Some(emit) = emit {
            *emit.write().unwrap() = Arc::new(|_| {});
        }
        detached = state.take();
    }
    return (removed, detached);
}

/// Pauses or resumes one registration in place (priority order is preserved). Returns false when
/// the registration no longer exists, so resuming a torn-down connection cannot resurrect it.
pub(crate) fn set_slot_paused_in<T>(
    data: &Ref<Option<SignalData<T>>>,
    id: SlotId,
    paused: bool,
) -> bool {
    let mut state = data.write().unwrap();
    let Some(signal_data) = state.as_mut() else {
        return false;
    };
    for index in 0..signal_data.slots.len() {
        if signal_data.slots[index].is_some() && signal_data.ids[index].value == id.value {
            signal_data.paused[index] = paused;
            return true;
        }
    }
    return false;
}
