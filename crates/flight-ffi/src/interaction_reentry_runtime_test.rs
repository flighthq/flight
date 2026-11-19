use std::ffi::c_void;
use std::sync::atomic::{AtomicUsize, Ordering};

// G4's dispatch paths run C callbacks with no interaction manager lock held: a callback connected
// through the generated lock-scoped signal connect may read the manager and call a generated
// manager mutator on the same handle.

struct Reentry {
    calls: AtomicUsize,
    manager: flight_sdk::Ref<flight_sdk::InteractionManager>,
    target: flight_sdk::NodeRef,
}

#[test]
fn direct_dispatch_lets_a_callback_reenter_the_manager() {
    z_run_within_deadline(|| {
        let (reentry, _connection) = z_create_reentry();
        unsafe {
            crate::flight_dispatch_interaction_pointer_down(
                z_get_manager_handle(reentry),
                1.0,
                1.0,
                0,
                std::ptr::null(),
            )
        };
        z_assert_reentered(reentry);
    });
}

#[test]
fn input_connector_dispatch_lets_a_callback_reenter_the_manager() {
    z_run_within_deadline(|| {
        let (reentry, _connection) = z_create_reentry();
        let input = flight_sdk::create_input_manager();
        let disposer = unsafe {
            crate::flight_connect_input_to_interaction(
                (&input as *const flight_sdk::Ref<flight_sdk::InputManager>).cast(),
                z_get_manager_handle(reentry),
                1.0,
            )
        };
        let data = flight_sdk::InputPointerData::default();
        flight_sdk::emit_signal(&input.read().unwrap().on_pointer_down, &data);
        z_assert_reentered(reentry);
        assert!(unsafe { crate::flight_call_disposer(disposer) });
        unsafe { crate::flight_free_disposer(disposer) };
    });
}

fn z_assert_reentered(reentry: &Reentry) {
    assert_eq!(reentry.calls.load(Ordering::SeqCst), 1);
    let manager = reentry.manager.read().unwrap();
    assert!(manager.pointer_captures.contains_key(&9));
    assert!(manager.pointer_states[&0].pointer_down_target.is_some());
}

// A root with one child the pointer is captured to, and a pointer-down callback on the child that
// re-enters the manager. Leaked so the callback context outlives the test thread's frames.
fn z_create_reentry() -> (&'static Reentry, *mut flight_sdk::SignalConnection) {
    let root: flight_sdk::NodeRef = flight_sdk::create_display_object();
    let target: flight_sdk::NodeRef = flight_sdk::create_display_object();
    flight_sdk::add_node_child(&root, &target);
    let manager = flight_sdk::create_interaction_manager(root, None);
    {
        let mut guard = manager.write().unwrap();
        flight_sdk::capture_interaction_pointer(&mut guard, 0, target.clone());
        guard
            .signal_subscriber_counts
            .insert(flight_sdk::InteractionSignalName::OnPointerDown, 1);
    }
    let reentry: &'static Reentry = Box::leak(Box::new(Reentry {
        calls: AtomicUsize::new(0),
        manager,
        target: target.clone(),
    }));
    let owner = Box::leak(Box::new(flight_sdk::enable_interaction_signals(&target)));
    let connection = unsafe {
        crate::flight_connect_interaction_signals_on_pointer_down(
            (owner as *const flight_sdk::Ref<flight_sdk::InteractionSignals>).cast(),
            Some(z_reenter_manager),
            reentry as *const Reentry as *mut c_void,
            None,
            0,
            false,
            std::ptr::null(),
        )
    };
    assert!(!connection.is_null());
    return (reentry, connection);
}

fn z_get_manager_handle(reentry: &Reentry) -> *const c_void {
    return (&reentry.manager as *const flight_sdk::Ref<flight_sdk::InteractionManager>).cast();
}

extern "C" fn z_reenter_manager(ctx: *mut c_void, _event: *const flight_sdk::PointerEventData) {
    let reentry = unsafe { &*(ctx as *const Reentry) };
    assert!(reentry.manager.read().unwrap().enabled);
    unsafe {
        crate::flight_capture_interaction_pointer(
            z_get_manager_handle(reentry),
            9,
            (&reentry.target as *const flight_sdk::NodeRef).cast(),
        )
    };
    reentry.calls.fetch_add(1, Ordering::SeqCst);
}

// Runs `test` on its own thread and fails instead of hanging when it deadlocks.
fn z_run_within_deadline(test: impl FnOnce() + Send + 'static) {
    let (done, finished) = std::sync::mpsc::channel();
    let worker = std::thread::spawn(move || {
        test();
        done.send(()).unwrap();
    });
    if finished
        .recv_timeout(std::time::Duration::from_secs(5))
        .is_err()
    {
        panic!("interaction dispatch deadlocked or panicked");
    }
    worker.join().unwrap();
}
