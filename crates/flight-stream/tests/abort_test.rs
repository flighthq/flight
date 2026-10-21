use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, Wake, Waker};

use flight_stream::contract::*;

use crate::block_on;

fn reason(label: &str) -> AbortReason {
    return Arc::new(label.to_string());
}

struct RecordingWake {
    woken: AtomicBool,
}

impl Wake for RecordingWake {
    fn wake(self: Arc<Self>) {
        self.woken.store(true, Ordering::SeqCst);
    }

    fn wake_by_ref(self: &Arc<Self>) {
        self.woken.store(true, Ordering::SeqCst);
    }
}

mod abort_controller {
    use super::*;

    #[test]
    fn first_abort_wins_and_repeated_aborts_do_not_reason_or_refire() {
        let controller = create_abort_controller();
        let calls = Arc::new(Mutex::new(0));
        let captured = calls.clone();
        let callback: AbortCallback = Arc::new(move || *captured.lock().unwrap() += 1);
        add_abort_listener(&controller.signal, callback);
        let first = reason("first");
        abort_controller(&controller, Some(first.clone()));
        abort_controller(&controller, Some(reason("second")));
        assert_eq!(*calls.lock().unwrap(), 1);
        let stored = get_abort_signal_reason(&controller.signal).expect("abort reason");
        assert!(Arc::ptr_eq(&stored, &first));
    }

    #[test]
    fn uses_the_default_abort_error_when_no_reason_is_supplied() {
        let controller = create_abort_controller();
        abort_controller(&controller, None);
        let stored = get_abort_signal_reason(&controller.signal).expect("default reason");
        let error = stored
            .downcast_ref::<AbortError>()
            .expect("default reason must be an AbortError");
        assert_eq!(error.name, "AbortError");
    }

    #[test]
    fn listeners_run_in_order_outside_the_lock_and_may_reenter() {
        let controller = create_abort_controller();
        let delivered = Arc::new(Mutex::new(Vec::new()));
        let first_delivered = delivered.clone();
        let signal = controller.signal.clone();
        let reentrant: AbortCallback = Arc::new(move || {
            first_delivered.lock().unwrap().push("first");
            let _ = get_abort_signal_reason(&signal);
            add_abort_listener(&signal, Arc::new(|| {}));
        });
        let second_delivered = delivered.clone();
        let second: AbortCallback = Arc::new(move || {
            second_delivered.lock().unwrap().push("second");
        });
        add_abort_listener(&controller.signal, reentrant);
        add_abort_listener(&controller.signal, second);
        abort_controller(&controller, None);
        assert_eq!(*delivered.lock().unwrap(), vec!["first", "second"]);
    }

    #[test]
    fn an_earlier_listener_that_removes_a_later_one_suppresses_its_invocation() {
        let controller = create_abort_controller();
        let signal = controller.signal.clone();
        let later_calls = Arc::new(Mutex::new(0));
        let captured = later_calls.clone();
        let later: AbortCallback = Arc::new(move || *captured.lock().unwrap() += 1);
        let remover_signal = signal.clone();
        let remover_callback = later.clone();
        let remover: AbortCallback = Arc::new(move || {
            remove_abort_listener(&remover_signal, &remover_callback);
        });
        add_abort_listener(&signal, remover);
        add_abort_listener(&signal, later);
        abort_controller(&controller, None);
        assert_eq!(*later_calls.lock().unwrap(), 0);
    }

    #[test]
    fn a_listener_added_during_dispatch_is_not_retroactively_delivered() {
        let controller = create_abort_controller();
        let signal = controller.signal.clone();
        let added_calls = Arc::new(Mutex::new(0));
        let captured = added_calls.clone();
        let adder_signal = signal.clone();
        let adder: AbortCallback = Arc::new(move || {
            let captured = captured.clone();
            let late: AbortCallback = Arc::new(move || *captured.lock().unwrap() += 1);
            add_abort_listener(&adder_signal, late);
        });
        add_abort_listener(&signal, adder);
        abort_controller(&controller, None);
        assert_eq!(*added_calls.lock().unwrap(), 0);
    }
}

mod add_abort_listener {
    use super::*;

    #[test]
    fn delivers_a_registered_listener_once_on_abort() {
        let controller = create_abort_controller();
        let calls = Arc::new(Mutex::new(0));
        let captured = calls.clone();
        let callback: AbortCallback = Arc::new(move || *captured.lock().unwrap() += 1);
        add_abort_listener(&controller.signal, callback);
        abort_controller(&controller, None);
        assert_eq!(*calls.lock().unwrap(), 1);
    }

    #[test]
    fn a_listener_added_after_abort_is_never_invoked() {
        let controller = create_abort_controller();
        abort_controller(&controller, None);
        let calls = Arc::new(Mutex::new(0));
        let captured = calls.clone();
        let callback: AbortCallback = Arc::new(move || *captured.lock().unwrap() += 1);
        add_abort_listener(&controller.signal, callback);
        assert_eq!(*calls.lock().unwrap(), 0);
    }
}

mod create_abort_controller {
    use super::*;

    #[test]
    fn starts_unaborted_with_a_signalless_reason_and_shared_clone_state() {
        let controller = create_abort_controller();
        let clone = controller.signal.clone();
        assert!(!is_abort_signal_aborted(&controller.signal));
        assert!(get_abort_signal_reason(&controller.signal).is_none());
        let shared = reason("stop");
        abort_controller(&controller, Some(shared.clone()));
        assert!(is_abort_signal_aborted(&clone));
        let stored = get_abort_signal_reason(&clone).expect("reason through the clone");
        assert!(Arc::ptr_eq(&stored, &shared));
    }
}

mod get_abort_signal_reason {
    use super::*;

    #[test]
    fn is_none_before_abort_and_preserves_reason_identity_after() {
        let controller = create_abort_controller();
        assert!(get_abort_signal_reason(&controller.signal).is_none());
        let shared = reason("stop");
        abort_controller(&controller, Some(shared.clone()));
        let first = get_abort_signal_reason(&controller.signal).expect("reason");
        let second = get_abort_signal_reason(&controller.signal).expect("reason");
        assert!(Arc::ptr_eq(&first, &shared));
        assert!(Arc::ptr_eq(&first, &second));
    }
}

mod is_abort_signal_aborted {
    use super::*;

    #[test]
    fn flips_once_for_the_signal_and_all_clones() {
        let controller = create_abort_controller();
        let clone = controller.signal.clone();
        assert!(!is_abort_signal_aborted(&controller.signal));
        assert!(!is_abort_signal_aborted(&clone));
        abort_controller(&controller, None);
        assert!(is_abort_signal_aborted(&controller.signal));
        assert!(is_abort_signal_aborted(&clone));
    }
}

mod remove_abort_listener {
    use super::*;

    #[test]
    fn removes_the_matching_registration_by_callback_identity() {
        let controller = create_abort_controller();
        let calls = Arc::new(Mutex::new(0));
        let captured = calls.clone();
        let callback: AbortCallback = Arc::new(move || *captured.lock().unwrap() += 1);
        add_abort_listener(&controller.signal, callback.clone());
        add_abort_listener(&controller.signal, callback.clone());
        remove_abort_listener(&controller.signal, &callback);
        abort_controller(&controller, None);
        assert_eq!(*calls.lock().unwrap(), 1);
    }

    #[test]
    fn removing_an_unregistered_callback_is_a_no_op_and_releases_the_registration() {
        let controller = create_abort_controller();
        let callback: AbortCallback = Arc::new(|| {});
        remove_abort_listener(&controller.signal, &callback);
        let weak = Arc::downgrade(&callback);
        add_abort_listener(&controller.signal, callback.clone());
        remove_abort_listener(&controller.signal, &callback);
        remove_abort_listener(&controller.signal, &callback);
        drop(callback);
        assert!(weak.upgrade().is_none());
    }

    #[test]
    fn readding_a_removed_callback_is_a_new_registration() {
        let controller = create_abort_controller();
        let calls = Arc::new(Mutex::new(0));
        let captured = calls.clone();
        let callback: AbortCallback = Arc::new(move || *captured.lock().unwrap() += 1);
        add_abort_listener(&controller.signal, callback.clone());
        remove_abort_listener(&controller.signal, &callback);
        add_abort_listener(&controller.signal, callback.clone());
        abort_controller(&controller, None);
        assert_eq!(*calls.lock().unwrap(), 1);
    }
}

mod throw_if_aborted {
    use super::*;

    #[test]
    fn does_not_throw_before_abort_and_throws_the_exact_reason_after() {
        let controller = create_abort_controller();
        throw_if_aborted(&controller.signal);
        let shared = reason("stop");
        abort_controller(&controller, Some(shared.clone()));
        let payload = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            throw_if_aborted(&controller.signal);
        }));
        let thrown = payload
            .expect_err("an aborted signal must throw")
            .downcast::<AbortReason>()
            .expect("panic payload must be the abort reason");
        assert!(Arc::ptr_eq(&thrown, &shared));
    }
}

mod wait_aborted {
    use super::*;

    #[test]
    fn resolves_immediately_with_the_reason_when_already_aborted() {
        let controller = create_abort_controller();
        let shared = reason("stop");
        abort_controller(&controller, Some(shared.clone()));
        let resolved = block_on(wait_aborted(&controller.signal));
        assert!(Arc::ptr_eq(&resolved, &shared));
    }

    #[test]
    fn a_pending_waiter_is_woken_by_an_external_abort() {
        let controller = create_abort_controller();
        let signal = controller.signal.clone();
        let recorder = Arc::new(RecordingWake {
            woken: AtomicBool::new(false),
        });
        let waker = Waker::from(recorder.clone());
        let mut context = Context::from_waker(&waker);
        let mut waiting = Box::pin(wait_aborted(&signal));
        assert!(waiting.as_mut().poll(&mut context).is_pending());
        let shared = reason("stop");
        abort_controller(&controller, Some(shared.clone()));
        assert!(recorder.woken.load(Ordering::SeqCst));
        match waiting.as_mut().poll(&mut context) {
            Poll::Ready(resolved) => assert!(Arc::ptr_eq(&resolved, &shared)),
            Poll::Pending => panic!("the waiter must settle after abort"),
        }
    }

    #[test]
    fn every_waiter_is_woken_and_observes_one_reason_identity() {
        let controller = create_abort_controller();
        let first_signal = controller.signal.clone();
        let second_signal = controller.signal.clone();
        let first_recorder = Arc::new(RecordingWake {
            woken: AtomicBool::new(false),
        });
        let second_recorder = Arc::new(RecordingWake {
            woken: AtomicBool::new(false),
        });
        let first_waker = Waker::from(first_recorder.clone());
        let second_waker = Waker::from(second_recorder.clone());
        let mut first_context = Context::from_waker(&first_waker);
        let mut second_context = Context::from_waker(&second_waker);
        let mut first = Box::pin(wait_aborted(&first_signal));
        let mut second = Box::pin(wait_aborted(&second_signal));
        assert!(first.as_mut().poll(&mut first_context).is_pending());
        assert!(second.as_mut().poll(&mut second_context).is_pending());
        let shared = reason("stop");
        abort_controller(&controller, Some(shared.clone()));
        assert!(first_recorder.woken.load(Ordering::SeqCst));
        assert!(second_recorder.woken.load(Ordering::SeqCst));
        let first_value = match first.as_mut().poll(&mut first_context) {
            Poll::Ready(value) => value,
            Poll::Pending => panic!("the first waiter must settle"),
        };
        let second_value = match second.as_mut().poll(&mut second_context) {
            Poll::Ready(value) => value,
            Poll::Pending => panic!("the second waiter must settle"),
        };
        assert!(Arc::ptr_eq(&first_value, &shared));
        assert!(Arc::ptr_eq(&second_value, &shared));
    }

    #[test]
    fn repeated_aborts_leave_the_settled_reason_stable() {
        let controller = create_abort_controller();
        let shared = reason("first");
        abort_controller(&controller, Some(shared.clone()));
        abort_controller(&controller, Some(reason("second")));
        let resolved = block_on(wait_aborted(&controller.signal));
        assert!(Arc::ptr_eq(&resolved, &shared));
    }
}
