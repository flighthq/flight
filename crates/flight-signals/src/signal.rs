use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};

use crate::emitter::dispatch_signal_data;
use crate::types::Signal;

pub fn create_signal<T: 'static>() -> Signal<T> {
    let mut out: Signal<T> = allocate_entity();
    out.emit = Ref::new(RwLock::new(Arc::new(|_: &T| {})));
    out.data = Ref::new(RwLock::new(None));
    initialize_signal(&mut out);
    return out;
}

pub fn initialize_signal<T: 'static>(out: &mut Signal<T>) {
    *out.data.write().unwrap() = None;
    install_default_signal_emitter(out);
}

/// Restores native D4 dispatch without holding an emitter-cell lock during callbacks.
pub(crate) fn install_default_signal_emitter<T: 'static>(signal: &Signal<T>) {
    let dispatch_signal = signal.clone();
    let _emit = signal.emit.clone();
    *signal.emit.write().unwrap() = Arc::new(move |args| {
        if dispatch_signal_data(&dispatch_signal, args) {
            *dispatch_signal.data.write().unwrap() = None;
            *_emit.write().unwrap() = Arc::new(|_| {});
        }
    });
}
