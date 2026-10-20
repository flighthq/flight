use std::any::Any;
use std::rc::Rc;

use flight_signals::*;

mod create_signal {
    use super::*;

    #[test]
    fn initializes_with_data_none() {
        let signal = create_signal();
        assert!(signal.data.borrow().is_none());
    }

    #[test]
    fn initializes_with_a_no_op_emit() {
        let signal = create_signal();
        // Emitting on an empty signal is a no-op (no panic, no slots called).
        emit_signal(&signal, Rc::new(()) as Rc<dyn Any>);
    }
}

mod initialize_signal {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_signal() {
        let mut signal = Signal::default();
        initialize_signal(&mut signal);
        assert!(signal.data.borrow().is_none());
    }
}
