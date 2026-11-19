use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};

use crate::emitter::dispatch_signal_data;
use crate::slot::detach_empty_signal_data;
use crate::types::Signal;

pub fn create_signal<T: 'static>() -> Signal<T> {
    let mut out: Signal<T> = allocate_entity();
    out.emit = Ref::new(RwLock::new(Arc::new(|_: &T| {})));
    out.data = Ref::new(RwLock::new(None));
    initialize_signal(&mut out);
    return out;
}

pub fn initialize_signal<T: 'static>(out: &mut Signal<T>) {
    let detached = out.data.write().unwrap().take();
    install_default_signal_emitter(out);
    drop(detached);
}

/// Restores native D4 dispatch without holding an emitter-cell lock during callbacks. The emitter
/// reaches the registration state and its own cell through weak handles, so it never keeps the
/// signal alive: dropping the last `Signal` handle drops its slots.
pub(crate) fn install_default_signal_emitter<T: 'static>(signal: &Signal<T>) {
    let data = Arc::downgrade(&signal.data);
    let emit = Arc::downgrade(&signal.emit);
    *signal.emit.write().unwrap() = Arc::new(move |args| {
        let Some(data) = data.upgrade() else {
            return;
        };
        if dispatch_signal_data(&data, args) {
            let detached = detach_empty_signal_data(&data, emit.upgrade().as_ref());
            drop(detached);
        }
    });
}
