use std::any::Any;
use std::cell::RefCell;
use std::rc::Rc;

use flight_signals::*;

mod cancel_signal {
    use super::*;

    #[test]
    fn does_nothing_when_no_slots_are_connected() {
        let signal = create_signal();
        cancel_signal(&signal); // should not panic
    }

    #[test]
    fn does_not_prevent_subsequent_emits() {
        let signal = create_signal();
        let count = Rc::new(RefCell::new(0));
        let signal_c = signal.clone();
        let count_c = count.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *count_c.borrow_mut() += 1;
                cancel_signal(&signal_c);
            }),
            None,
        );
        let count_c2 = count.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *count_c2.borrow_mut() += 1;
            }),
            None,
        );
        emit_signal(&signal, Rc::new(()));
        emit_signal(&signal, Rc::new(()));
        assert_eq!(*count.borrow(), 2);
    }

    #[test]
    fn stops_emit_after_the_canceling_slot() {
        let signal = create_signal();
        let order = Rc::new(RefCell::new(Vec::<i32>::new()));
        let signal_c = signal.clone();
        let order_c = order.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                order_c.borrow_mut().push(1);
                cancel_signal(&signal_c);
            }),
            None,
        );
        let order_c2 = order.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                order_c2.borrow_mut().push(2);
            }),
            None,
        );
        emit_signal(&signal, Rc::new(()));
        assert_eq!(*order.borrow(), vec![1]);
    }
}

mod emit_signal_tests {
    use super::*;

    #[test]
    fn calls_all_connected_slots() {
        let signal = create_signal();
        let count = Rc::new(RefCell::new(0));
        let count_c = count.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *count_c.borrow_mut() += 1;
            }),
            None,
        );
        let count_c2 = count.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *count_c2.borrow_mut() += 1;
            }),
            None,
        );
        emit_signal(&signal, Rc::new(()));
        assert_eq!(*count.borrow(), 2);
    }

    #[test]
    fn does_nothing_when_no_slots_are_connected() {
        let signal = create_signal();
        emit_signal(&signal, Rc::new(())); // should not panic
    }

    #[test]
    fn passes_typed_arguments_to_each_slot() {
        let signal = create_signal();
        let received = Rc::new(RefCell::new(Vec::<i32>::new()));
        let received_c = received.clone();
        connect_signal(
            &signal,
            Rc::new(move |args: Rc<dyn Any>| {
                let v = *args.downcast_ref::<i32>().unwrap();
                received_c.borrow_mut().push(v);
            }),
            None,
        );
        emit_signal(&signal, Rc::new(42_i32));
        assert_eq!(*received.borrow(), vec![42]);
    }

    #[test]
    fn removes_once_slots_after_they_fire() {
        let signal = create_signal();
        let count = Rc::new(RefCell::new(0));
        let count_c = count.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *count_c.borrow_mut() += 1;
            }),
            Some(&SignalConnectOptions {
                once: true,
                ..Default::default()
            }),
        );
        emit_signal(&signal, Rc::new(()));
        emit_signal(&signal, Rc::new(()));
        assert_eq!(*count.borrow(), 1);
    }

    #[test]
    fn resets_cancelled_before_each_emit() {
        let signal = create_signal();
        let count = Rc::new(RefCell::new(0));
        let signal_c = signal.clone();
        let count_c = count.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *count_c.borrow_mut() += 1;
                cancel_signal(&signal_c);
            }),
            None,
        );
        let count_c2 = count.clone();
        connect_signal(
            &signal,
            Rc::new(move |_: Rc<dyn Any>| {
                *count_c2.borrow_mut() += 1;
            }),
            None,
        );
        emit_signal(&signal, Rc::new(()));
        assert_eq!(*count.borrow(), 1);
        emit_signal(&signal, Rc::new(()));
        assert_eq!(*count.borrow(), 2);
    }
}
