use crate::types::Signal;

pub fn create_signal<T>() -> Signal<T> {
    let mut out = Signal::default();
    initialize_signal(&mut out);
    return out;
}

pub fn initialize_signal<T>(out: &mut Signal<T>) {
    *out.data.write().unwrap() = None;
}
