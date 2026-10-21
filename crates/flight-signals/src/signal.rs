use crate::types::Signal;
use std::sync::Arc;

pub fn create_signal<T: 'static>() -> Signal<T> {
    let mut out = Signal::default();
    initialize_signal(&mut out);
    return out;
}

pub fn initialize_signal<T: 'static>(out: &mut Signal<T>) {
    *out.data.write().unwrap() = None;
    let data = out.data.clone();
    out.emit = Arc::new(move |args| crate::emitter::dispatch_signal_data(&data, args));
}
