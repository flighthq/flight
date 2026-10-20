use std::cell::RefCell;
use std::rc::Rc;

use crate::types::{Signal, SignalConnectOptions, SignalData, SlotFn};

pub fn clear_signal(signal: &Signal) {
    *signal.data.borrow_mut() = None;
}

pub fn connect_signal(signal: &Signal, slot: SlotFn, options: Option<&SignalConnectOptions>) {
    let priority = options.map_or(0, |o| o.priority);
    let repeat = !options.map_or(false, |o| o.once);

    init_signal_data(signal);

    let data_rc = signal.data.borrow().as_ref().unwrap().clone();
    let mut data = data_rc.borrow_mut();

    for i in 0..data.priorities.len() {
        if priority > data.priorities[i] {
            data.slots.insert(i, Some(slot));
            data.priorities.insert(i, priority);
            data.repeat.insert(i, repeat);
            return;
        }
    }

    data.slots.push(Some(slot));
    data.priorities.push(priority);
    data.repeat.push(repeat);
}

pub fn disconnect_signal(signal: &Signal, slot: &SlotFn) {
    let data_rc = match signal.data.borrow().as_ref() {
        Some(rc) => rc.clone(),
        None => return,
    };

    let is_empty = {
        let mut data = data_rc.borrow_mut();
        let dispatching = data.depth > 0;

        let mut i = data.slots.len();
        while i > 0 {
            i -= 1;
            let is_match = match &data.slots[i] {
                Some(s) => Rc::ptr_eq(s, slot),
                None => false,
            };
            if !is_match {
                continue;
            }
            if dispatching {
                data.slots[i] = None;
            } else {
                data.slots.remove(i);
                data.priorities.remove(i);
                data.repeat.remove(i);
            }
        }

        !dispatching && data.slots.is_empty()
    };

    if is_empty {
        *signal.data.borrow_mut() = None;
    }
}

pub fn has_signal_slots(signal: &Signal) -> bool {
    let data_rc = match signal.data.borrow().as_ref() {
        Some(rc) => rc.clone(),
        None => return false,
    };
    let data = data_rc.borrow();
    if data.depth == 0 {
        return !data.slots.is_empty();
    }
    return count_live_slots(&data) > 0;
}

pub fn is_slot_connected(signal: &Signal, slot: &SlotFn) -> bool {
    let data_rc = match signal.data.borrow().as_ref() {
        Some(rc) => rc.clone(),
        None => return false,
    };
    let data = data_rc.borrow();
    return data
        .slots
        .iter()
        .any(|s| s.as_ref().map_or(false, |s| Rc::ptr_eq(s, slot)));
}

// -------------------------------------------------------------------------
// Crate-internal helpers
// -------------------------------------------------------------------------

pub(crate) fn compact_signal_data(signal: &Signal, data_rc: &Rc<RefCell<SignalData>>) {
    let is_empty = {
        let mut data = data_rc.borrow_mut();
        let original_len = data.slots.len();
        let mut write = 0;
        for read in 0..original_len {
            if data.slots[read].is_none() {
                continue;
            }
            if write != read {
                let slot = data.slots[read].take();
                data.slots[write] = slot;
                data.priorities[write] = data.priorities[read];
                data.repeat[write] = data.repeat[read];
            }
            write += 1;
        }
        if write == original_len {
            return;
        }
        data.slots.truncate(write);
        data.priorities.truncate(write);
        data.repeat.truncate(write);
        write == 0
    };

    if is_empty {
        let should_clear = signal
            .data
            .borrow()
            .as_ref()
            .map_or(false, |rc| Rc::ptr_eq(rc, data_rc));
        if should_clear {
            *signal.data.borrow_mut() = None;
        }
    }
}

fn init_signal_data(signal: &Signal) {
    let mut data_opt = signal.data.borrow_mut();
    if data_opt.is_some() {
        return;
    }
    *data_opt = Some(Rc::new(RefCell::new(SignalData {
        slots: Vec::new(),
        priorities: Vec::new(),
        repeat: Vec::new(),
        cancelled: false,
        depth: 0,
    })));
}

fn count_live_slots(data: &SignalData) -> usize {
    return data.slots.iter().filter(|s| s.is_some()).count();
}
