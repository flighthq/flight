use std::any::Any;
use std::cell::RefCell;
use std::rc::Rc;

use crate::slot::compact_signal_data;
use crate::types::{Signal, SignalData, SlotFn};

/// Emits to the priority-ordered listener set captured at emission start.
///
/// Connections added while this snapshot is running wait for a later emission.
/// A connection removed after the snapshot was captured still receives this
/// emission. Nested safe emissions capture their own listener set. This
/// deterministic mutation behavior costs one copy of each dispatch lane.
pub fn emit_signal_safe(signal: &Signal, args: Rc<dyn Any>) {
    let data_rc = match signal.data.borrow().as_ref() {
        Some(rc) => rc.clone(),
        None => return,
    };

    // Snapshot slots, priorities, repeat and update dispatch state
    let (slots, priorities, repeat) = {
        let mut data = data_rc.borrow_mut();
        let slots = data.slots.clone();
        let priorities = data.priorities.clone();
        let repeat = data.repeat.clone();
        data.cancelled = false;
        data.depth += 1;
        (slots, priorities, repeat)
    };

    for i in 0..slots.len() {
        let slot = match &slots[i] {
            Some(s) => s.clone(),
            None => continue,
        };

        // Consume once registrations before invoking them so a once callback
        // cannot repeat itself by nesting another safe emission.
        if !repeat[i] {
            tombstone_once_slot(&data_rc, &slot, priorities[i]);
        }

        slot(args.clone());

        // Check cancelled
        let cancelled = data_rc.borrow().cancelled;
        if cancelled {
            break;
        }
    }

    // Decrement depth
    let should_compact = {
        let mut data = data_rc.borrow_mut();
        data.depth -= 1;
        data.depth == 0
    };

    if should_compact {
        compact_signal_data(signal, &data_rc);
    }
}

fn tombstone_once_slot(data_rc: &Rc<RefCell<SignalData>>, slot: &SlotFn, priority: i32) {
    let mut data = data_rc.borrow_mut();
    for i in 0..data.slots.len() {
        let is_match = match &data.slots[i] {
            Some(s) => Rc::ptr_eq(s, slot) && !data.repeat[i] && data.priorities[i] == priority,
            None => false,
        };
        if !is_match {
            continue;
        }
        data.slots[i] = None;
        return;
    }
}
