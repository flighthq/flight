use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};

// Item C: every teardown path releases the callback context exactly once, and the callback never
// runs after its release.

#[derive(Default)]
// flight-lint: allow(f64) probes record scalar, frame-delta and enum payloads as one value list
struct Probe {
    id: usize,
    calls: AtomicUsize,
    releases: AtomicUsize,
    in_call: AtomicBool,
    called_after_release: AtomicBool,
    released_during_call: AtomicBool,
    order: Option<Arc<Mutex<Vec<usize>>>>,
    reemit: Option<flight_sdk::Signal<()>>,
    self_connection: Mutex<Option<usize>>,
    thread: Mutex<Option<std::thread::ThreadId>>,
    values: Mutex<Vec<f64>>,
}

#[test]
fn callbacks_run_on_the_emitting_thread() {
    let signal = flight_sdk::create_signal::<()>();
    let probe = Probe::default();
    let connection = z_connect_unit(&signal, &probe, 0, false);
    let emitter = signal.clone();
    let emitter_thread = std::thread::spawn(move || {
        flight_sdk::emit_signal(&emitter, &());
        return std::thread::current().id();
    })
    .join()
    .unwrap();
    assert_eq!(*probe.thread.lock().unwrap(), Some(emitter_thread));
    unsafe { crate::flight_free_signal_connection(connection) };
    assert_eq!(
        (z_get_probe_calls(&probe), z_get_probe_releases(&probe)),
        (1, 1)
    );
}

#[test]
fn clear_signal_releases_once_and_free_does_not_release_again() {
    let signal = flight_sdk::create_signal::<()>();
    let probe = Probe::default();
    let connection = z_connect_unit(&signal, &probe, 0, false);
    flight_sdk::emit_signal(&signal, &());
    flight_sdk::clear_signal(&signal);
    assert_eq!(z_get_probe_releases(&probe), 1);
    flight_sdk::emit_signal(&signal, &());
    unsafe { crate::flight_free_signal_connection(connection) };
    assert_eq!(
        (z_get_probe_calls(&probe), z_get_probe_releases(&probe)),
        (1, 1)
    );
    assert!(!probe.called_after_release.load(Ordering::SeqCst));
}

#[test]
fn disconnect_releases_once_and_free_does_not_release_again() {
    let signal = flight_sdk::create_signal::<()>();
    let probe = Probe::default();
    let connection = z_connect_unit(&signal, &probe, 0, false);
    flight_sdk::disconnect_signal_connection(unsafe { &*connection });
    assert_eq!(z_get_probe_releases(&probe), 1);
    assert!(!flight_sdk::is_signal_connection_connected(unsafe {
        &*connection
    }));
    flight_sdk::disconnect_signal_connection(unsafe { &*connection });
    flight_sdk::emit_signal(&signal, &());
    unsafe { crate::flight_free_signal_connection(connection) };
    assert_eq!(
        (z_get_probe_calls(&probe), z_get_probe_releases(&probe)),
        (0, 1)
    );
}

#[test]
// flight-lint: allow(f64) the clock tick payload carries the SDK's f64 frame delta
fn field_producers_borrow_the_owner_signal() {
    let clock = flight_sdk::create_clock();
    let mut owner = clock.write().unwrap();
    assert!(unsafe { crate::flight_get_clock_on_tick(&*owner) }.is_null());
    flight_sdk::enable_clock_signals(&mut owner);
    let signal = unsafe { crate::flight_get_clock_on_tick(&*owner) };
    assert_eq!(signal, owner.on_tick.as_ref().unwrap() as *const _);
    drop(owner);
    let probe = Probe::default();
    let connection = unsafe {
        crate::flight_connect_frame_tick_signal(
            signal,
            Some(z_record_frame_tick),
            z_get_probe_context(&probe),
            Some(z_release),
            0,
            false,
            std::ptr::null(),
        )
    };
    let tick = flight_sdk::FrameTick { delta_time: 5.0 };
    flight_sdk::emit_signal(clock.read().unwrap().on_tick.as_ref().unwrap(), &tick);
    unsafe { crate::flight_free_signal_connection(connection) };
    assert_eq!(*probe.values.lock().unwrap(), [5.0]);

    let mut options = flight_sdk::NetRequestOptions::default();
    assert!(unsafe { crate::flight_get_net_request_options_progress(&options) }.is_null());
    let created = unsafe { crate::flight_enable_net_request_options_progress(&mut options) };
    let again = unsafe { crate::flight_enable_net_request_options_progress(&mut options) };
    assert_eq!(created, again);
    assert_eq!(
        unsafe { crate::flight_get_net_request_options_progress(&options) },
        created
    );
    let progress_probe = Probe::default();
    let connection = unsafe {
        crate::flight_connect_net_progress_signal(
            created,
            Some(z_record_net_progress),
            z_get_probe_context(&progress_probe),
            Some(z_release),
            0,
            false,
            std::ptr::null(),
        )
    };
    let passed = options.clone();
    let value: flight_sdk::Ref<flight_sdk::NetProgress> =
        Arc::new(RwLock::new(flight_sdk::NetProgress {
            phase: flight_sdk::NetProgressPhase::Upload,
            loaded: 7,
            total: 9,
        }));
    flight_sdk::emit_signal(&passed.progress.as_ref().unwrap().read().unwrap(), &value);
    unsafe { crate::flight_free_signal_connection(connection) };
    assert_eq!(*progress_probe.values.lock().unwrap(), [7.0]);
    assert_eq!(z_get_probe_releases(&progress_probe), 1);
    assert!(unsafe { crate::flight_get_clock_on_tick(std::ptr::null()) }.is_null());
    assert!(
        unsafe { crate::flight_enable_net_request_options_progress(std::ptr::null_mut()) }
            .is_null()
    );
}

#[test]
// flight-lint: allow(f64) frame-rate callbacks receive the SDK's f64 accumulated milliseconds
fn frame_rate_connection_shares_the_signal_connection_teardown() {
    let signal = flight_sdk::create_signal::<flight_sdk::FrameTick>();
    let probe = Probe::default();
    let connection = unsafe {
        crate::flight_connect_signal_at_frame_rate(
            &signal,
            10.0,
            Some(z_record_f64),
            z_get_probe_context(&probe),
            Some(z_release),
        )
    };
    assert!(!connection.is_null());
    assert_eq!(
        z_get_probe_releases(&probe),
        0,
        "connect released the context"
    );
    flight_sdk::emit_signal(&signal, &flight_sdk::FrameTick { delta_time: 40.0 });
    flight_sdk::emit_signal(&signal, &flight_sdk::FrameTick { delta_time: 60.0 });
    assert_eq!(*probe.values.lock().unwrap(), [100.0]);
    flight_sdk::pause_signal_connection(unsafe { &*connection });
    flight_sdk::emit_signal(&signal, &flight_sdk::FrameTick { delta_time: 100.0 });
    assert_eq!(z_get_probe_calls(&probe), 1);
    flight_sdk::resume_signal_connection(unsafe { &*connection });
    assert!(flight_sdk::is_signal_connection_connected(unsafe {
        &*connection
    }));
    unsafe { crate::flight_free_signal_connection(connection) };
    assert_eq!(z_get_probe_releases(&probe), 1);
    flight_sdk::emit_signal(&signal, &flight_sdk::FrameTick { delta_time: 100.0 });
    assert_eq!(
        (z_get_probe_calls(&probe), z_get_probe_releases(&probe)),
        (1, 1)
    );

    let cleared = Probe::default();
    let connection = unsafe {
        crate::flight_connect_signal_at_frame_rate(
            &signal,
            10.0,
            Some(z_record_f64),
            z_get_probe_context(&cleared),
            Some(z_release),
        )
    };
    assert_eq!(
        z_get_probe_releases(&cleared),
        0,
        "connect released the context"
    );
    flight_sdk::clear_signal(&signal);
    assert_eq!(z_get_probe_releases(&cleared), 1);
    assert!(!flight_sdk::is_signal_connection_connected(unsafe {
        &*connection
    }));
    unsafe { crate::flight_free_signal_connection(connection) };
    assert_eq!(z_get_probe_releases(&cleared), 1);

    let refused = Probe::default();
    assert!(
        unsafe {
            crate::flight_connect_signal_at_frame_rate(
                std::ptr::null(),
                10.0,
                Some(z_record_f64),
                z_get_probe_context(&refused),
                Some(z_release),
            )
        }
        .is_null()
    );
    assert_eq!(z_get_probe_releases(&refused), 0);
}

#[test]
fn free_while_connected_disconnects_and_releases_once() {
    let signal = flight_sdk::create_signal::<()>();
    let probe = Probe::default();
    let connection = z_connect_unit(&signal, &probe, 0, false);
    flight_sdk::emit_signal(&signal, &());
    flight_sdk::emit_signal(&signal, &());
    unsafe { crate::flight_free_signal_connection(connection) };
    assert_eq!(z_get_probe_releases(&probe), 1);
    flight_sdk::emit_signal(&signal, &());
    assert_eq!(
        (z_get_probe_calls(&probe), z_get_probe_releases(&probe)),
        (2, 1)
    );
    assert!(!flight_sdk::has_signal_slots(&signal));
    unsafe { crate::flight_free_signal_connection(std::ptr::null_mut()) };
}

#[test]
fn null_release_is_allowed() {
    let signal = flight_sdk::create_signal::<()>();
    let probe = Probe::default();
    let connection = unsafe {
        crate::flight_connect_unit_signal(
            &signal,
            Some(z_record_unit),
            z_get_probe_context(&probe),
            None,
            0,
            false,
            std::ptr::null(),
        )
    };
    flight_sdk::emit_signal(&signal, &());
    unsafe { crate::flight_free_signal_connection(connection) };
    assert_eq!(
        (z_get_probe_calls(&probe), z_get_probe_releases(&probe)),
        (1, 0)
    );
}

#[test]
fn null_signal_or_callback_connects_nothing_and_keeps_the_context() {
    let signal = flight_sdk::create_signal::<()>();
    let probe = Probe::default();
    let missing_signal = unsafe {
        crate::flight_connect_unit_signal(
            std::ptr::null(),
            Some(z_record_unit),
            z_get_probe_context(&probe),
            Some(z_release),
            0,
            false,
            std::ptr::null(),
        )
    };
    let missing_callback = unsafe {
        crate::flight_connect_unit_signal(
            &signal,
            None,
            z_get_probe_context(&probe),
            Some(z_release),
            0,
            false,
            std::ptr::null(),
        )
    };
    assert!(missing_signal.is_null() && missing_callback.is_null());
    assert_eq!(z_get_probe_releases(&probe), 0);
    assert!(!flight_sdk::has_signal_slots(&signal));
}

#[test]
fn once_fires_then_releases_without_waiting_for_free() {
    let signal = flight_sdk::create_signal::<()>();
    let probe = Probe::default();
    let connection = z_connect_unit(&signal, &probe, 0, true);
    flight_sdk::emit_signal(&signal, &());
    assert_eq!(
        (z_get_probe_calls(&probe), z_get_probe_releases(&probe)),
        (1, 1)
    );
    flight_sdk::emit_signal(&signal, &());
    unsafe { crate::flight_free_signal_connection(connection) };
    assert_eq!(
        (z_get_probe_calls(&probe), z_get_probe_releases(&probe)),
        (1, 1)
    );
}

#[test]
// flight-lint: allow(f64) the scalar case exercises the SDK's f64 signal payload
fn payload_classes_lower_by_task_m_rules() {
    let scalar = flight_sdk::create_signal::<f64>();
    let probes: [Probe; 4] = Default::default();
    let connection = unsafe {
        crate::flight_connect_f64_signal(
            &scalar,
            Some(z_record_f64),
            z_get_probe_context(&probes[0]),
            Some(z_release),
            0,
            false,
            std::ptr::null(),
        )
    };
    assert_eq!(
        z_get_probe_releases(&probes[0]),
        0,
        "connect released the context"
    );
    flight_sdk::emit_signal(&scalar, &2.5);
    unsafe { crate::flight_free_signal_connection(connection) };

    let tick = flight_sdk::create_signal::<flight_sdk::FrameTick>();
    let connection = unsafe {
        crate::flight_connect_frame_tick_signal(
            &tick,
            Some(z_record_frame_tick),
            z_get_probe_context(&probes[1]),
            Some(z_release),
            0,
            false,
            std::ptr::null(),
        )
    };
    flight_sdk::emit_signal(&tick, &flight_sdk::FrameTick { delta_time: 16.0 });
    unsafe { crate::flight_free_signal_connection(connection) };

    let lifecycle = flight_sdk::create_signal::<flight_sdk::AppLifecycleState>();
    let connection = unsafe {
        crate::flight_connect_app_lifecycle_state_signal(
            &lifecycle,
            Some(z_record_u32),
            z_get_probe_context(&probes[2]),
            Some(z_release),
            0,
            false,
            std::ptr::null(),
        )
    };
    flight_sdk::emit_signal(&lifecycle, &flight_sdk::AppLifecycleState::Background);
    unsafe { crate::flight_free_signal_connection(connection) };

    let progress = flight_sdk::create_signal::<flight_sdk::Ref<flight_sdk::NetProgress>>();
    let connection = unsafe {
        crate::flight_connect_net_progress_signal(
            &progress,
            Some(z_record_net_progress),
            z_get_probe_context(&probes[3]),
            Some(z_release),
            0,
            false,
            std::ptr::null(),
        )
    };
    let value: flight_sdk::Ref<flight_sdk::NetProgress> =
        Arc::new(RwLock::new(flight_sdk::NetProgress {
            phase: flight_sdk::NetProgressPhase::Download,
            loaded: 3,
            total: 4,
        }));
    flight_sdk::emit_signal(&progress, &value);
    unsafe { crate::flight_free_signal_connection(connection) };

    let values: Vec<f64> = probes
        .iter()
        .map(|probe| probe.values.lock().unwrap()[0])
        .collect();
    assert_eq!(
        values,
        [
            2.5,
            16.0,
            flight_sdk::AppLifecycleState::Background as u32 as f64,
            3.0
        ]
    );
    assert!(probes.iter().all(|probe| z_get_probe_releases(&probe) == 1));
}

#[test]
fn priority_runs_higher_first_and_ties_keep_connect_order() {
    let signal = flight_sdk::create_signal::<()>();
    let order = Arc::new(Mutex::new(Vec::new()));
    let probes: Vec<Probe> = (0..3)
        .map(|index| {
            let mut probe = Probe::default();
            probe.id = index;
            probe.order = Some(order.clone());
            return probe;
        })
        .collect();
    let connections = [
        z_connect_unit(&signal, &probes[0], 0, false),
        z_connect_unit(&signal, &probes[1], 5, false),
        z_connect_unit(&signal, &probes[2], 0, false),
    ];
    flight_sdk::emit_signal(&signal, &());
    assert_eq!(*order.lock().unwrap(), [1, 0, 2]);
    for connection in connections {
        unsafe { crate::flight_free_signal_connection(connection) };
    }
    assert!(probes.iter().all(|probe| z_get_probe_releases(&probe) == 1));
}

#[test]
fn reentrant_emit_from_a_callback_does_not_deadlock() {
    let signal = flight_sdk::create_signal::<()>();
    let mut probe = Probe::default();
    probe.reemit = Some(signal.clone());
    let connection = z_connect_unit(&signal, &probe, 0, false);
    flight_sdk::emit_signal(&signal, &());
    assert_eq!(z_get_probe_calls(&probe), 2);
    unsafe { crate::flight_free_signal_connection(connection) };
    assert_eq!(z_get_probe_releases(&probe), 1);
}

#[test]
fn scope_disconnect_releases_once() {
    let signal = flight_sdk::create_signal::<()>();
    let scope = flight_sdk::create_signal_scope();
    let probe = Probe::default();
    let connection = unsafe {
        crate::flight_connect_unit_signal(
            &signal,
            Some(z_record_unit),
            z_get_probe_context(&probe),
            Some(z_release),
            0,
            false,
            &scope,
        )
    };
    assert_eq!(
        z_get_probe_releases(&probe),
        0,
        "connect released the context"
    );
    flight_sdk::disconnect_signal_scope(&scope);
    assert_eq!(z_get_probe_releases(&probe), 1);
    flight_sdk::emit_signal(&signal, &());
    unsafe { crate::flight_free_signal_connection(connection) };
    assert_eq!(
        (z_get_probe_calls(&probe), z_get_probe_releases(&probe)),
        (0, 1)
    );
}

#[test]
fn self_disconnect_inside_the_callback_releases_after_it_returns() {
    let signal = flight_sdk::create_signal::<()>();
    let probe = Probe::default();
    let connection = z_connect_unit(&signal, &probe, 0, false);
    *probe.self_connection.lock().unwrap() = Some(connection as usize);
    flight_sdk::emit_signal(&signal, &());
    assert_eq!(z_get_probe_releases(&probe), 1);
    assert!(!probe.released_during_call.load(Ordering::SeqCst));
    flight_sdk::emit_signal(&signal, &());
    unsafe { crate::flight_free_signal_connection(connection) };
    assert_eq!(
        (z_get_probe_calls(&probe), z_get_probe_releases(&probe)),
        (1, 1)
    );
}

fn z_check_probe_released_after_calls(probe: &Probe) {
    if !std::thread::panicking() {
        assert!(
            !probe.called_after_release.load(Ordering::SeqCst),
            "callback ran after its context was released"
        );
    }
}

fn z_connect_unit(
    signal: &flight_sdk::Signal<()>,
    probe: &Probe,
    priority: i32,
    once: bool,
) -> *mut flight_sdk::SignalConnection {
    let connection = unsafe {
        crate::flight_connect_unit_signal(
            signal,
            Some(z_record_unit),
            z_get_probe_context(&probe),
            Some(z_release),
            priority,
            once,
            std::ptr::null(),
        )
    };
    assert!(!connection.is_null());
    assert_eq!(
        z_get_probe_releases(&probe),
        0,
        "connect released the context"
    );
    return connection;
}

fn z_enter(ctx: *mut c_void) -> &'static Probe {
    let probe = unsafe { &*(ctx as *const Probe) };
    if z_get_probe_releases(&probe) > 0 {
        probe.called_after_release.store(true, Ordering::SeqCst);
    }
    probe.calls.fetch_add(1, Ordering::SeqCst);
    *probe.thread.lock().unwrap() = Some(std::thread::current().id());
    return probe;
}

fn z_get_probe_calls(probe: &Probe) -> usize {
    return probe.calls.load(Ordering::SeqCst);
}

fn z_get_probe_context(probe: &Probe) -> *mut c_void {
    return probe as *const Probe as *mut c_void;
}

fn z_get_probe_releases(probe: &Probe) -> usize {
    return probe.releases.load(Ordering::SeqCst);
}

// flight-lint: allow(f64) signal callback ABI and frame deltas are defined by the SDK
extern "C" fn z_record_f64(ctx: *mut c_void, value: f64) {
    z_enter(ctx).values.lock().unwrap().push(value);
}

extern "C" fn z_record_frame_tick(ctx: *mut c_void, tick: *const flight_sdk::FrameTick) {
    z_enter(ctx)
        .values
        .lock()
        .unwrap()
        .push(unsafe { &*tick }.delta_time);
}

// flight-lint: allow(f64) probes record every payload class into one f64 value list
extern "C" fn z_record_net_progress(ctx: *mut c_void, handle: *const c_void) {
    let progress = unsafe { &*(handle as *const flight_sdk::Ref<flight_sdk::NetProgress>) };
    let loaded = progress.read().unwrap().loaded;
    z_enter(ctx).values.lock().unwrap().push(loaded as f64);
}

// flight-lint: allow(f64) probes record every payload class into one f64 value list
extern "C" fn z_record_u32(ctx: *mut c_void, value: u32) {
    z_enter(ctx).values.lock().unwrap().push(value as f64);
}

extern "C" fn z_record_unit(ctx: *mut c_void) {
    let probe = z_enter(ctx);
    probe.in_call.store(true, Ordering::SeqCst);
    if let Some(order) = &probe.order {
        order.lock().unwrap().push(probe.id);
    }
    if let Some(signal) = &probe.reemit
        && z_get_probe_calls(&probe) == 1
    {
        flight_sdk::emit_signal(signal, &());
    }
    if let Some(connection) = *probe.self_connection.lock().unwrap() {
        flight_sdk::disconnect_signal_connection(unsafe {
            &*(connection as *const flight_sdk::SignalConnection)
        });
    }
    probe.in_call.store(false, Ordering::SeqCst);
}

extern "C" fn z_release(ctx: *mut c_void) {
    let probe = unsafe { &*(ctx as *const Probe) };
    if probe.in_call.load(Ordering::SeqCst) {
        probe.released_during_call.store(true, Ordering::SeqCst);
    }
    probe.releases.fetch_add(1, Ordering::SeqCst);
}

impl Drop for Probe {
    fn drop(&mut self) {
        z_check_probe_released_after_calls(self);
    }
}
