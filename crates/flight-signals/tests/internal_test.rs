use std::any::Any;
use std::rc::Rc;

use flight_signals::*;

mod null_signal_emit {
    use super::*;

    #[test]
    fn returns_unit_and_does_nothing() {
        null_signal_emit(Rc::new(()) as Rc<dyn Any>);
        // No panic, no observable side-effect.
    }
}
