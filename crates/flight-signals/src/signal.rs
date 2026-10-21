use crate::types::Signal;
use std::sync::Arc;

pub fn create_signal<T: 'static>() -> Signal<T> {
    let mut out = Signal::default();
    initialize_signal(&mut out);
    return out;
}

pub fn initialize_signal<T: 'static>(out: &mut Signal<T>) {
    *out.data.write().unwrap() = None;
    install_default_signal_emitter(out);
}

/// Restores native D4 dispatch without holding an emitter-cell lock during callbacks.
pub(crate) fn install_default_signal_emitter<T: 'static>(signal: &Signal<T>) {
    let data = signal.data.clone();
    let emitter = Arc::downgrade(&signal.emit);
    *signal.emit.write().unwrap() = Arc::new(move |args| {
        let detached = crate::emitter::dispatch_signal_data(&data, args);
        if detached && let Some(emitter) = emitter.upgrade() {
            *emitter.write().unwrap() = Arc::new(|_| {});
        }
    });
}
