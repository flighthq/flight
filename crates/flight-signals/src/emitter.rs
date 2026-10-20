use std::any::Any;
use std::rc::Rc;

use crate::slot::compact_signal_data;
use crate::types::Signal;

pub fn cancel_signal(signal: &Signal) {
    let data_rc = match signal.data.borrow().as_ref() {
        Some(rc) => rc.clone(),
        None => return,
    };
    data_rc.borrow_mut().cancelled = true;
}

/// Emits the signal, invoking all connected slots in priority order.
///
/// This contains the dispatch logic that in the TS source lives inside
/// `makeDispatch` (slot.ts). Slots added during dispatch ARE reached if their
/// index is ahead of the cursor. Slots removed during dispatch are tombstoned
/// and skipped. Once-slots are tombstoned after invocation.
pub fn emit_signal(signal: &Signal, args: Rc<dyn Any>) {
    // Capture the data Rc so the dispatch keeps working even if clear_signal
    // replaces signal.data during a slot callback.
    let data_rc = match signal.data.borrow().as_ref() {
        Some(rc) => rc.clone(),
        None => return,
    };

    // Increment depth, reset cancelled
    {
        let mut data = data_rc.borrow_mut();
        data.cancelled = false;
        data.depth += 1;
    }

    let mut i: usize = 0;
    loop {
        // Read slot at index i
        let (slot_opt, len) = {
            let data = data_rc.borrow();
            let len = data.slots.len();
            if i >= len {
                (None, len)
            } else {
                (data.slots[i].clone(), len)
            }
        };

        if i >= len {
            break;
        }

        if let Some(slot_fn) = slot_opt {
            // Call the slot
            slot_fn(args.clone());

            // Check cancelled
            let cancelled = data_rc.borrow().cancelled;
            if cancelled {
                break;
            }

            // Tombstone once-slots (repeat == false)
            {
                let mut data = data_rc.borrow_mut();
                if i < data.slots.len() && !data.repeat[i] {
                    data.slots[i] = None;
                }
            }
        }

        i += 1;
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
