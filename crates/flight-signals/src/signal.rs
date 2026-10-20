use crate::types::Signal;

pub fn create_signal() -> Signal {
    let mut out = Signal::default();
    initialize_signal(&mut out);
    return out;
}

pub fn initialize_signal(out: &mut Signal) {
    *out.data.borrow_mut() = None;
}
