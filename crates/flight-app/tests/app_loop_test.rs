use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use flight_app::contract::*;
use flight_entity::{Entity, FlightError, FlightErrorKind, Ref, Unknown};
use flight_lifecycle::{AppLifecycleState, HostLifecycleCapability};
use flight_signals::{connect_signal, emit_signal};

/// The source's `makeManualLoopBackend`: one pending frame callback, fired by `tick`.
struct ManualLoop {
    callback: Arc<Mutex<Option<AppFrameCallback>>>,
    cancel_count: Arc<AtomicUsize>,
    capability: HostAppLoopCapability,
}

fn manual_loop() -> ManualLoop {
    let callback: Arc<Mutex<Option<AppFrameCallback>>> = Arc::new(Mutex::new(None));
    let cancel_count = Arc::new(AtomicUsize::new(0));
    let (requested, cancelled, counted) =
        (callback.clone(), callback.clone(), cancel_count.clone());
    let capability = HostAppLoopCapability {
        provider: Arc::new(()),
        cancel_frame: Arc::new(move |_handle: &Unknown| {
            counted.fetch_add(1, Ordering::SeqCst);
            *cancelled.lock().unwrap() = None;
        }),
        now: Arc::new(|| 0.0),
        request_frame: Arc::new(move |frame: AppFrameCallback| {
            *requested.lock().unwrap() = Some(frame);
            let handle: Unknown = Some(Arc::new(1_i32));
            return handle;
        }),
    };
    return ManualLoop {
        callback,
        cancel_count,
        capability,
    };
}

impl ManualLoop {
    fn tick(&self, time: f64) {
        let frame = self.callback.lock().unwrap().clone();
        if let Some(frame) = frame {
            frame(time);
        }
    }
}

fn lifecycle(state: AppLifecycleState) -> (HostLifecycleCapability, Arc<Mutex<AppLifecycleState>>) {
    let current = Arc::new(Mutex::new(state));
    let read = current.clone();
    let capability = HostLifecycleCapability {
        get_state: Arc::new(move || *read.lock().unwrap()),
        subscribe: Arc::new(|_listener| Arc::new(|| {})),
        get_launch_kind: None,
        subscribe_memory_warning: None,
    };
    return (capability, current);
}

/// The source's `createExitTestHost`: records subscribe/release and fans out `emit`.
struct ExitHost {
    calls: Arc<Mutex<Vec<String>>>,
    capability: HostAppExitCapability,
    listeners: Arc<Mutex<Vec<(usize, AppListener)>>>,
}

fn exit_host() -> ExitHost {
    let calls = Arc::new(Mutex::new(Vec::new()));
    let listeners: Arc<Mutex<Vec<(usize, AppListener)>>> = Arc::new(Mutex::new(Vec::new()));
    let (log, live) = (calls.clone(), listeners.clone());
    let next = Arc::new(AtomicUsize::new(0));
    let capability = HostAppExitCapability {
        provider: Arc::new(()),
        subscribe: Arc::new(move |listener: AppListener| {
            log.lock().unwrap().push("subscribe".to_string());
            let id = next.fetch_add(1, Ordering::SeqCst);
            live.lock().unwrap().push((id, listener));
            let active = Arc::new(AtomicBool::new(true));
            let (log, live) = (log.clone(), live.clone());
            return Arc::new(move || {
                if !active.swap(false, Ordering::SeqCst) {
                    return;
                }
                log.lock().unwrap().push("release".to_string());
                live.lock().unwrap().retain(|(entry, _)| *entry != id);
            });
        }),
    };
    return ExitHost {
        calls,
        capability,
        listeners,
    };
}

impl ExitHost {
    fn emit(&self) {
        let listeners: Vec<AppListener> = self
            .listeners
            .lock()
            .unwrap()
            .iter()
            .map(|(_, l)| l.clone())
            .collect();
        for listener in listeners {
            listener();
        }
    }

    fn calls(&self) -> Vec<String> {
        return self.calls.lock().unwrap().clone();
    }
}

fn active() -> HostLifecycleCapability {
    return lifecycle(AppLifecycleState::Active).0;
}

fn record_updates(app: &Ref<AppLoop>) -> Arc<Mutex<Vec<f64>>> {
    let updates = Arc::new(Mutex::new(Vec::new()));
    let keep = updates.clone();
    let signal = app.read().unwrap().on_update.clone();
    connect_signal(
        &signal,
        Arc::new(move |delta: &f64| keep.lock().unwrap().push(*delta)),
        None,
    );
    return updates;
}

fn count_renders(app: &Ref<AppLoop>) -> Arc<AtomicUsize> {
    let renders = Arc::new(AtomicUsize::new(0));
    let keep = renders.clone();
    let signal = app.read().unwrap().on_render.clone();
    connect_signal(
        &signal,
        Arc::new(move |_value: &()| {
            keep.fetch_add(1, Ordering::SeqCst);
        }),
        None,
    );
    return renders;
}

fn record_fixed(app: &Ref<AppLoop>) -> Arc<Mutex<Vec<f64>>> {
    let deltas = Arc::new(Mutex::new(Vec::new()));
    let keep = deltas.clone();
    let signal = app.read().unwrap().on_fixed_update.clone().unwrap();
    connect_signal(
        &signal,
        Arc::new(move |delta: &f64| keep.lock().unwrap().push(*delta)),
        None,
    );
    return deltas;
}

fn record_errors(app: &Ref<AppLoop>) -> Arc<Mutex<Vec<String>>> {
    let errors = Arc::new(Mutex::new(Vec::new()));
    let keep = errors.clone();
    let signal = app.read().unwrap().on_error.clone().unwrap();
    connect_signal(
        &signal,
        Arc::new(move |error: &Unknown| {
            let message = error
                .as_ref()
                .and_then(|value| value.downcast_ref::<FlightError>())
                .map(|error| error.message.clone())
                .unwrap_or_default();
            keep.lock().unwrap().push(message);
        }),
        None,
    );
    return errors;
}

fn throwing(message: &'static str) -> impl Fn() {
    return move || {
        std::panic::panic_any(FlightError {
            kind: FlightErrorKind::Error,
            message: message.to_string(),
        })
    };
}

fn running(app: &Ref<AppLoop>) -> bool {
    return app.read().unwrap().is_running;
}

fn ptr_list(windows: &[Ref<AppWindow>]) -> Vec<usize> {
    return windows
        .iter()
        .map(|win| Arc::as_ptr(win) as usize)
        .collect();
}

mod attach_app_loop_exit {
    use super::*;

    #[test]
    fn emits_on_exit_through_the_host_subscription() {
        let host = exit_host();
        let app = create_app_loop();
        let called = Arc::new(AtomicBool::new(false));
        let flag = called.clone();
        connect_signal(
            &app.read().unwrap().on_exit.clone(),
            Arc::new(move |_value: &()| flag.store(true, Ordering::SeqCst)),
            None,
        );
        attach_app_loop_exit(&host.capability, &app);
        host.emit();
        assert!(called.load(Ordering::SeqCst));
        assert_eq!(host.calls(), vec!["subscribe"]);
    }

    #[test]
    fn releases_the_prior_host_before_replacing_the_exit_listener() {
        let (first, second) = (exit_host(), exit_host());
        let app = create_app_loop();
        let count = Arc::new(AtomicUsize::new(0));
        let tally = count.clone();
        connect_signal(
            &app.read().unwrap().on_exit.clone(),
            Arc::new(move |_value: &()| {
                tally.fetch_add(1, Ordering::SeqCst);
            }),
            None,
        );
        attach_app_loop_exit(&first.capability, &app);
        attach_app_loop_exit(&second.capability, &app);
        first.emit();
        second.emit();
        assert_eq!(count.load(Ordering::SeqCst), 1);
        assert_eq!(first.calls(), vec!["subscribe", "release"]);
        assert_eq!(second.calls(), vec!["subscribe"]);
    }
}

mod attach_app_loop_lifecycle {
    use super::*;

    #[test]
    fn pauses_the_loop_when_the_window_deactivates() {
        let backend = manual_loop();
        let app = create_app_loop();
        let win = create_app_window();
        start_app_loop(&backend.capability, &active(), &app, None);
        attach_app_loop_lifecycle(&app, &win);
        emit_signal(&win.read().unwrap().on_deactivate.clone(), &());
        assert!(!running(&app));
        stop_app_loop(&app);
    }

    #[test]
    fn resumes_the_loop_when_the_window_activates() {
        let backend = manual_loop();
        let app = create_app_loop();
        let win = create_app_window();
        start_app_loop(&backend.capability, &active(), &app, None);
        attach_app_loop_lifecycle(&app, &win);
        emit_signal(&win.read().unwrap().on_deactivate.clone(), &());
        assert!(!running(&app));
        emit_signal(&win.read().unwrap().on_activate.clone(), &());
        assert!(running(&app));
        stop_app_loop(&app);
    }

    #[test]
    fn emits_the_opt_in_lifecycle_signals_and_replaces_a_window_wiring() {
        let backend = manual_loop();
        let app = create_app_loop();
        enable_app_loop_lifecycle_signals(&app);
        let win = create_app_window();
        start_app_loop(&backend.capability, &active(), &app, None);
        attach_app_loop_lifecycle(&app, &win);
        attach_app_loop_lifecycle(&app, &win);
        let deactivations = Arc::new(AtomicUsize::new(0));
        let tally = deactivations.clone();
        connect_signal(
            &app.read().unwrap().on_deactivate.clone().unwrap(),
            Arc::new(move |_value: &()| {
                tally.fetch_add(1, Ordering::SeqCst);
            }),
            None,
        );
        emit_signal(&win.read().unwrap().on_deactivate.clone(), &());
        assert_eq!(deactivations.load(Ordering::SeqCst), 1);
        dispose_app_loop(&app);
        emit_signal(&win.read().unwrap().on_deactivate.clone(), &());
        assert_eq!(deactivations.load(Ordering::SeqCst), 1);
    }
}

mod create_app_loop {
    use super::*;

    #[test]
    fn creates_an_entity_backed_application_identity() {
        let app = create_app_loop();
        let guard = app.read().unwrap();
        let _: &dyn Entity = &*guard;
    }

    #[test]
    fn returns_signals_with_no_side_effects() {
        let host = exit_host();
        let app = create_app_loop();
        let called = Arc::new(AtomicBool::new(false));
        let flag = called.clone();
        connect_signal(
            &app.read().unwrap().on_exit.clone(),
            Arc::new(move |_value: &()| flag.store(true, Ordering::SeqCst)),
            None,
        );
        host.emit();
        assert!(!called.load(Ordering::SeqCst));
    }

    #[test]
    fn initializes_frame_metrics_to_zero() {
        let app = create_app_loop();
        let guard = app.read().unwrap();
        assert_eq!(guard.elapsed_time, 0.0);
        assert_eq!(guard.frame_count, 0);
        assert_eq!(guard.delta_time, 0.0);
        assert!(!guard.is_running);
        assert_eq!(guard.interpolation_alpha, 1.0);
        assert!(guard.windows.is_empty());
    }

    #[test]
    fn initializes_lifecycle_signals_to_null() {
        let app = create_app_loop();
        let guard = app.read().unwrap();
        assert!(guard.on_activate.is_none());
        assert!(guard.on_deactivate.is_none());
        assert!(guard.on_error.is_none());
        assert!(guard.on_fixed_update.is_none());
    }
}

mod detach_app_loop_exit {
    use super::*;

    #[test]
    fn removes_the_listener() {
        let host = exit_host();
        let app = create_app_loop();
        let called = Arc::new(AtomicBool::new(false));
        let flag = called.clone();
        connect_signal(
            &app.read().unwrap().on_exit.clone(),
            Arc::new(move |_value: &()| flag.store(true, Ordering::SeqCst)),
            None,
        );
        attach_app_loop_exit(&host.capability, &app);
        detach_app_loop_exit(&app);
        host.emit();
        assert!(!called.load(Ordering::SeqCst));
        assert_eq!(host.calls(), vec!["subscribe", "release"]);
    }
}

mod dispose_app_loop {
    use super::*;

    #[test]
    fn stops_loop_removes_exit_listener_and_sets_is_running_false() {
        let backend = manual_loop();
        let exit = exit_host();
        let app = create_app_loop();
        let called = Arc::new(AtomicBool::new(false));
        let flag = called.clone();
        connect_signal(
            &app.read().unwrap().on_exit.clone(),
            Arc::new(move |_value: &()| flag.store(true, Ordering::SeqCst)),
            None,
        );
        start_app_loop(&backend.capability, &active(), &app, None);
        attach_app_loop_exit(&exit.capability, &app);
        assert!(running(&app));
        dispose_app_loop(&app);
        assert!(!running(&app));
        exit.emit();
        assert!(!called.load(Ordering::SeqCst));
        assert_eq!(exit.calls(), vec!["subscribe", "release"]);
        assert_eq!(backend.cancel_count.load(Ordering::SeqCst), 1);
    }
}

mod enable_app_loop_lifecycle_signals {
    use super::*;

    #[test]
    fn allocates_the_opt_in_signals_on_the_application() {
        let app = create_app_loop();
        enable_app_loop_lifecycle_signals(&app);
        let guard = app.read().unwrap();
        assert!(guard.on_activate.is_some() && guard.on_deactivate.is_some());
        assert!(guard.on_error.is_some() && guard.on_fixed_update.is_some());
    }

    #[test]
    fn is_idempotent() {
        let app = create_app_loop();
        enable_app_loop_lifecycle_signals(&app);
        let signal = app.read().unwrap().on_activate.clone().unwrap();
        enable_app_loop_lifecycle_signals(&app);
        let again = app.read().unwrap().on_activate.clone().unwrap();
        assert!(Arc::ptr_eq(&signal.data, &again.data));
    }
}

mod for_each_app_loop_window {
    use super::*;

    #[test]
    fn iterates_all_registered_windows() {
        let app = create_app_loop();
        let (win1, win2) = (create_app_window(), create_app_window());
        register_app_loop_window(&app, &win1);
        register_app_loop_window(&app, &win2);
        let mut seen = Vec::new();
        for_each_app_loop_window(&app, &mut |win: &Ref<AppWindow>| seen.push(win.clone()));
        assert_eq!(ptr_list(&seen), ptr_list(&[win1, win2]));
    }
}

mod get_app_loop_frame_rate {
    use super::*;

    #[test]
    fn returns_0_before_any_ticks() {
        assert_eq!(get_app_loop_frame_rate(&create_app_loop()), 0.0);
    }

    #[test]
    fn returns_approximate_fps_after_several_ticks() {
        let backend = manual_loop();
        let app = create_app_loop();
        start_app_loop(&backend.capability, &active(), &app, None);
        for index in 0..=60 {
            backend.tick(index as f64 * 16.67);
        }
        let fps = get_app_loop_frame_rate(&app);
        assert!(fps > 55.0 && fps < 65.0, "{fps}");
        stop_app_loop(&app);
    }
}

mod get_app_loop_main_window {
    use super::*;

    #[test]
    fn returns_null_with_no_windows() {
        assert!(get_app_loop_main_window(&create_app_loop()).is_none());
    }

    #[test]
    fn returns_the_first_registered_window_by_default() {
        let app = create_app_loop();
        let (win1, win2) = (create_app_window(), create_app_window());
        register_app_loop_window(&app, &win1);
        register_app_loop_window(&app, &win2);
        assert!(Arc::ptr_eq(&get_app_loop_main_window(&app).unwrap(), &win1));
    }

    #[test]
    fn returns_the_explicitly_set_main_window() {
        let app = create_app_loop();
        let (win1, win2) = (create_app_window(), create_app_window());
        register_app_loop_window(&app, &win1);
        set_app_loop_main_window(&app, &win2);
        assert!(Arc::ptr_eq(&get_app_loop_main_window(&app).unwrap(), &win2));
    }
}

mod get_app_loop_windows {
    use super::*;

    #[test]
    fn returns_an_empty_array_initially() {
        assert!(get_app_loop_windows(&create_app_loop()).is_empty());
    }

    #[test]
    fn returns_a_snapshot_of_registered_windows() {
        let app = create_app_loop();
        let win = create_app_window();
        register_app_loop_window(&app, &win);
        let mut snapshot = get_app_loop_windows(&app);
        assert_eq!(ptr_list(&snapshot), ptr_list(&[win]));
        snapshot.push(create_app_window());
        assert_eq!(app.read().unwrap().windows.len(), 1);
    }
}

mod initialize_app_loop {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_app_loop() {
        let mut out: AppLoop = flight_entity::allocate_entity();
        out.frame_count = 9;
        initialize_app_loop(&mut out);
        assert_eq!(out.frame_count, 0);
        assert!(out.on_error.is_none());
    }
}

mod is_app_loop_running {
    use super::*;

    #[test]
    fn returns_false_before_loop_is_started() {
        assert!(!is_app_loop_running(&create_app_loop()));
    }

    #[test]
    fn returns_true_after_loop_is_started() {
        let backend = manual_loop();
        let app = create_app_loop();
        start_app_loop(&backend.capability, &active(), &app, None);
        assert!(is_app_loop_running(&app));
        stop_app_loop(&app);
    }

    #[test]
    fn returns_false_after_loop_is_stopped() {
        let backend = manual_loop();
        let app = create_app_loop();
        start_app_loop(&backend.capability, &active(), &app, None);
        stop_app_loop(&app);
        assert!(!is_app_loop_running(&app));
    }
}

mod pause_app_loop {
    use super::*;

    #[test]
    fn pauses_emission_without_cancelling_the_frame_chain() {
        let backend = manual_loop();
        let app = create_app_loop();
        let updates = record_updates(&app);
        start_app_loop(&backend.capability, &active(), &app, None);
        backend.tick(0.0);
        backend.tick(16.0);
        pause_app_loop(&app);
        backend.tick(32.0);
        assert_eq!(updates.lock().unwrap().len(), 2);
        assert!(!running(&app));
        assert!(backend.callback.lock().unwrap().is_some());
        stop_app_loop(&app);
    }

    #[test]
    fn is_idempotent() {
        let backend = manual_loop();
        let app = create_app_loop();
        start_app_loop(&backend.capability, &active(), &app, None);
        pause_app_loop(&app);
        pause_app_loop(&app);
        assert!(!running(&app));
        stop_app_loop(&app);
    }
}

mod register_app_loop_window {
    use super::*;

    #[test]
    fn adds_a_window_to_the_registry() {
        let app = create_app_loop();
        let win = create_app_window();
        register_app_loop_window(&app, &win);
        assert_eq!(ptr_list(&app.read().unwrap().windows), ptr_list(&[win]));
    }

    #[test]
    fn is_idempotent() {
        let app = create_app_loop();
        let win = create_app_window();
        register_app_loop_window(&app, &win);
        register_app_loop_window(&app, &win);
        assert_eq!(app.read().unwrap().windows.len(), 1);
    }
}

mod resume_app_loop {
    use super::*;

    #[test]
    fn resumes_emission_after_pause_without_dumping_the_gap_delta() {
        let backend = manual_loop();
        let app = create_app_loop();
        let updates = record_updates(&app);
        start_app_loop(&backend.capability, &active(), &app, None);
        backend.tick(0.0);
        backend.tick(16.0);
        pause_app_loop(&app);
        resume_app_loop(&app);
        backend.tick(5000.0);
        assert_eq!(*updates.lock().unwrap().last().unwrap(), 0.0);
        assert!(running(&app));
        stop_app_loop(&app);
    }

    #[test]
    fn is_a_no_op_when_not_paused() {
        let backend = manual_loop();
        let app = create_app_loop();
        start_app_loop(&backend.capability, &active(), &app, None);
        resume_app_loop(&app);
        assert!(running(&app));
        stop_app_loop(&app);
    }
}

mod set_app_loop_main_window {
    use super::*;

    #[test]
    fn registers_the_window_if_not_already_registered() {
        let app = create_app_loop();
        let win = create_app_window();
        set_app_loop_main_window(&app, &win);
        assert_eq!(
            ptr_list(&app.read().unwrap().windows),
            ptr_list(&[win.clone()])
        );
        assert!(Arc::ptr_eq(&get_app_loop_main_window(&app).unwrap(), &win));
    }
}

mod start_app_loop {
    use super::*;

    fn options(edit: impl FnOnce(&mut AppLoopOptions)) -> AppLoopOptions {
        let mut out = AppLoopOptions {
            max_delta_time: None,
            target_frame_rate: None,
            background_frame_rate: None,
            fixed_time_step: None,
            max_updates_per_frame: None,
        };
        edit(&mut out);
        return out;
    }

    #[test]
    fn sets_is_running_to_true() {
        let backend = manual_loop();
        let app = create_app_loop();
        start_app_loop(&backend.capability, &active(), &app, None);
        assert!(running(&app));
        stop_app_loop(&app);
    }

    #[test]
    fn replaces_a_previous_loop_when_called_again() {
        let backend = manual_loop();
        let app = create_app_loop();
        start_app_loop(&backend.capability, &active(), &app, None);
        let initial = backend.cancel_count.load(Ordering::SeqCst);
        start_app_loop(&backend.capability, &active(), &app, None);
        assert!(backend.cancel_count.load(Ordering::SeqCst) > initial);
        stop_app_loop(&app);
    }

    #[test]
    fn emits_on_update_with_clamped_delta_and_on_render_on_each_tick() {
        let backend = manual_loop();
        let app = create_app_loop();
        let updates = record_updates(&app);
        let renders = count_renders(&app);
        start_app_loop(&backend.capability, &active(), &app, None);
        backend.tick(0.0);
        backend.tick(100.0);
        assert_eq!(*updates.lock().unwrap(), vec![0.0, 100.0]);
        assert_eq!(renders.load(Ordering::SeqCst), 2);
        stop_app_loop(&app);
    }

    #[test]
    fn clamps_large_delta_gaps_to_max_delta_time() {
        let backend = manual_loop();
        let app = create_app_loop();
        let updates = record_updates(&app);
        start_app_loop(
            &backend.capability,
            &active(),
            &app,
            Some(&options(|o| o.max_delta_time = Some(100.0))),
        );
        backend.tick(0.0);
        backend.tick(5000.0);
        assert_eq!(updates.lock().unwrap()[1], 100.0);
        stop_app_loop(&app);
    }

    #[test]
    fn defaults_to_250ms_max_delta_clamp() {
        let backend = manual_loop();
        let app = create_app_loop();
        let updates = record_updates(&app);
        start_app_loop(&backend.capability, &active(), &app, None);
        backend.tick(0.0);
        backend.tick(10000.0);
        assert_eq!(updates.lock().unwrap()[1], 250.0);
        stop_app_loop(&app);
    }

    #[test]
    fn accumulates_frame_count_and_elapsed_time() {
        let backend = manual_loop();
        let app = create_app_loop();
        start_app_loop(&backend.capability, &active(), &app, None);
        backend.tick(0.0);
        backend.tick(16.0);
        backend.tick(32.0);
        assert_eq!(app.read().unwrap().frame_count, 3);
        assert!((app.read().unwrap().elapsed_time - 0.032).abs() < 5e-4);
        stop_app_loop(&app);
    }

    #[test]
    fn throttles_to_target_frame_rate_when_set() {
        let backend = manual_loop();
        let app = create_app_loop();
        let renders = count_renders(&app);
        start_app_loop(
            &backend.capability,
            &active(),
            &app,
            Some(&options(|o| o.target_frame_rate = Some(30.0))),
        );
        backend.tick(0.0);
        backend.tick(16.0);
        assert_eq!(renders.load(Ordering::SeqCst), 1);
        backend.tick(34.0);
        assert_eq!(renders.load(Ordering::SeqCst), 2);
        stop_app_loop(&app);
    }

    #[test]
    fn pulls_lifecycle_state_from_the_host_when_choosing_the_frame_interval() {
        let backend = manual_loop();
        let (host_lifecycle, state) = lifecycle(AppLifecycleState::Background);
        let app = create_app_loop();
        let renders = count_renders(&app);
        start_app_loop(
            &backend.capability,
            &host_lifecycle,
            &app,
            Some(&options(|o| o.background_frame_rate = Some(1.0))),
        );
        backend.tick(0.0);
        backend.tick(500.0);
        assert_eq!(renders.load(Ordering::SeqCst), 1);
        *state.lock().unwrap() = AppLifecycleState::Active;
        backend.tick(516.0);
        assert_eq!(renders.load(Ordering::SeqCst), 2);
        stop_app_loop(&app);
    }

    #[test]
    fn emits_on_fixed_update_when_fixed_time_step_is_set() {
        let backend = manual_loop();
        let app = create_app_loop();
        enable_app_loop_lifecycle_signals(&app);
        let fixed = record_fixed(&app);
        start_app_loop(
            &backend.capability,
            &active(),
            &app,
            Some(&options(|o| o.fixed_time_step = Some(16.0))),
        );
        backend.tick(0.0);
        backend.tick(48.0);
        assert_eq!(*fixed.lock().unwrap(), vec![16.0, 16.0, 16.0]);
        stop_app_loop(&app);
    }

    #[test]
    fn clamps_to_max_updates_per_frame_to_prevent_spiral_of_death() {
        let backend = manual_loop();
        let app = create_app_loop();
        enable_app_loop_lifecycle_signals(&app);
        let fixed = record_fixed(&app);
        start_app_loop(
            &backend.capability,
            &active(),
            &app,
            Some(&options(|o| {
                o.fixed_time_step = Some(16.0);
                o.max_updates_per_frame = Some(3.0);
            })),
        );
        backend.tick(0.0);
        backend.tick(10000.0);
        assert_eq!(fixed.lock().unwrap().len(), 3);
        // The cap drains the leftover accumulator.
        assert_eq!(app.read().unwrap().interpolation_alpha, 0.0);
        stop_app_loop(&app);
    }

    #[test]
    fn sets_interpolation_alpha_between_0_and_1_during_fixed_step() {
        let backend = manual_loop();
        let app = create_app_loop();
        enable_app_loop_lifecycle_signals(&app);
        start_app_loop(
            &backend.capability,
            &active(),
            &app,
            Some(&options(|o| o.fixed_time_step = Some(16.0))),
        );
        backend.tick(0.0);
        backend.tick(24.0);
        assert_eq!(app.read().unwrap().interpolation_alpha, 0.5);
        stop_app_loop(&app);
    }

    #[test]
    fn routes_fixed_update_errors_through_on_error_and_continues_the_frame() {
        let backend = manual_loop();
        let app = create_app_loop();
        enable_app_loop_lifecycle_signals(&app);
        let errors = record_errors(&app);
        let fail = throwing("fixed update failed");
        connect_signal(
            &app.read().unwrap().on_fixed_update.clone().unwrap(),
            Arc::new(move |_delta: &f64| fail()),
            None,
        );
        let updates = record_updates(&app);
        let renders = count_renders(&app);
        start_app_loop(
            &backend.capability,
            &active(),
            &app,
            Some(&options(|o| o.fixed_time_step = Some(16.0))),
        );
        backend.tick(0.0);
        backend.tick(32.0);
        assert_eq!(
            *errors.lock().unwrap(),
            vec!["fixed update failed", "fixed update failed"]
        );
        assert_eq!(updates.lock().unwrap().len(), 2);
        assert_eq!(renders.load(Ordering::SeqCst), 2);
        stop_app_loop(&app);
    }

    #[test]
    fn routes_on_update_errors_to_on_error_when_lifecycle_signals_enabled() {
        let backend = manual_loop();
        let app = create_app_loop();
        enable_app_loop_lifecycle_signals(&app);
        let errors = record_errors(&app);
        let fail = throwing("boom");
        connect_signal(
            &app.read().unwrap().on_update.clone(),
            Arc::new(move |_delta: &f64| fail()),
            None,
        );
        start_app_loop(&backend.capability, &active(), &app, None);
        backend.tick(0.0);
        assert!(errors.lock().unwrap().contains(&"boom".to_string()));
        assert!(running(&app));
        assert!(backend.callback.lock().unwrap().is_some());
        stop_app_loop(&app);
    }
}

mod step_app_loop {
    use super::*;

    fn fixed(step: f64) -> AppStepOptions {
        return AppStepOptions {
            fixed_time_step: Some(step),
            max_delta_time: None,
            max_updates_per_frame: None,
        };
    }

    #[test]
    fn drives_one_tick_with_the_supplied_delta() {
        let app = create_app_loop();
        let updates = record_updates(&app);
        let renders = count_renders(&app);
        step_app_loop(&app, 16.0, None);
        assert_eq!(*updates.lock().unwrap(), vec![16.0]);
        assert_eq!(renders.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn clamps_the_delta_to_the_default_max_delta_time() {
        let app = create_app_loop();
        let updates = record_updates(&app);
        step_app_loop(&app, 9999.0, None);
        assert_eq!(updates.lock().unwrap()[0], 250.0);
    }

    #[test]
    fn updates_frame_metrics() {
        let app = create_app_loop();
        enable_app_loop_lifecycle_signals(&app);
        let fixed_deltas = record_fixed(&app);
        app.write().unwrap().interpolation_alpha = 0.25;
        step_app_loop(&app, 16.0, None);
        let guard = app.read().unwrap();
        assert_eq!(guard.frame_count, 1);
        assert_eq!(guard.delta_time, 16.0);
        assert!((guard.elapsed_time - 0.016).abs() < 5e-6);
        assert_eq!(guard.interpolation_alpha, 1.0);
        assert!(fixed_deltas.lock().unwrap().is_empty());
    }

    #[test]
    fn runs_fixed_updates_standalone_and_retains_the_residual_accumulator_across_calls() {
        let app = create_app_loop();
        enable_app_loop_lifecycle_signals(&app);
        let fixed_deltas = record_fixed(&app);
        step_app_loop(&app, 10.0, Some(&fixed(16.0)));
        assert!(fixed_deltas.lock().unwrap().is_empty());
        assert!((app.read().unwrap().interpolation_alpha - 0.625).abs() < 5e-6);
        step_app_loop(&app, 10.0, Some(&fixed(16.0)));
        assert_eq!(*fixed_deltas.lock().unwrap(), vec![16.0]);
        assert!((app.read().unwrap().interpolation_alpha - 0.25).abs() < 5e-6);
    }

    #[test]
    fn uses_explicit_fixed_step_options_instead_of_policy_from_an_active_backend_loop() {
        let backend = manual_loop();
        let app = create_app_loop();
        enable_app_loop_lifecycle_signals(&app);
        let fixed_deltas = record_fixed(&app);
        let options = AppLoopOptions {
            max_delta_time: None,
            target_frame_rate: None,
            background_frame_rate: None,
            fixed_time_step: Some(8.0),
            max_updates_per_frame: None,
        };
        start_app_loop(&backend.capability, &active(), &app, Some(&options));
        step_app_loop(&app, 12.0, Some(&fixed(12.0)));
        assert_eq!(*fixed_deltas.lock().unwrap(), vec![12.0]);
        assert_eq!(app.read().unwrap().interpolation_alpha, 0.0);
        stop_app_loop(&app);
    }

    #[test]
    fn carries_residual_wall_time_across_different_explicit_fixed_step_sizes() {
        let app = create_app_loop();
        enable_app_loop_lifecycle_signals(&app);
        let fixed_deltas = record_fixed(&app);
        step_app_loop(&app, 10.0, Some(&fixed(16.0)));
        step_app_loop(&app, 4.0, Some(&fixed(8.0)));
        assert_eq!(*fixed_deltas.lock().unwrap(), vec![8.0]);
        assert_eq!(app.read().unwrap().interpolation_alpha, 0.75);
    }

    #[test]
    fn carries_fixed_residual_across_an_intervening_variable_step() {
        let app = create_app_loop();
        enable_app_loop_lifecycle_signals(&app);
        let fixed_deltas = record_fixed(&app);
        step_app_loop(&app, 10.0, Some(&fixed(16.0)));
        step_app_loop(&app, 100.0, None);
        assert!(fixed_deltas.lock().unwrap().is_empty());
        assert_eq!(app.read().unwrap().interpolation_alpha, 1.0);
        step_app_loop(&app, 6.0, Some(&fixed(16.0)));
        assert_eq!(*fixed_deltas.lock().unwrap(), vec![16.0]);
        assert_eq!(app.read().unwrap().interpolation_alpha, 0.0);
    }

    #[test]
    fn uses_an_explicit_max_delta_instead_of_the_active_backend_loop_clamp() {
        let backend = manual_loop();
        let app = create_app_loop();
        let options = AppLoopOptions {
            max_delta_time: Some(100.0),
            target_frame_rate: None,
            background_frame_rate: None,
            fixed_time_step: None,
            max_updates_per_frame: None,
        };
        start_app_loop(&backend.capability, &active(), &app, Some(&options));
        let explicit = AppStepOptions {
            fixed_time_step: None,
            max_delta_time: Some(40.0),
            max_updates_per_frame: None,
        };
        step_app_loop(&app, 9999.0, Some(&explicit));
        assert_eq!(app.read().unwrap().delta_time, 40.0);
        step_app_loop(&app, 9999.0, None);
        assert_eq!(app.read().unwrap().delta_time, 100.0);
        stop_app_loop(&app);
    }

    #[test]
    fn routes_update_and_render_errors_independently_through_on_error() {
        let app = create_app_loop();
        enable_app_loop_lifecycle_signals(&app);
        let errors = record_errors(&app);
        let (update_fail, render_fail) = (throwing("update failed"), throwing("render failed"));
        connect_signal(
            &app.read().unwrap().on_update.clone(),
            Arc::new(move |_delta: &f64| update_fail()),
            None,
        );
        connect_signal(
            &app.read().unwrap().on_render.clone(),
            Arc::new(move |_value: &()| render_fail()),
            None,
        );
        step_app_loop(&app, 16.0, None);
        assert_eq!(
            *errors.lock().unwrap(),
            vec!["update failed", "render failed"]
        );
    }

    #[test]
    fn propagates_a_listener_panic_without_an_on_error_signal() {
        let app = create_app_loop();
        let fail = throwing("unhandled");
        connect_signal(
            &app.read().unwrap().on_update.clone(),
            Arc::new(move |_delta: &f64| fail()),
            None,
        );
        let raised = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            step_app_loop(&app, 16.0, None)
        }));
        assert_eq!(
            raised
                .unwrap_err()
                .downcast::<FlightError>()
                .unwrap()
                .message,
            "unhandled"
        );
    }

    #[test]
    fn uses_the_default_250ms_max_clamp_when_called_without_a_prior_loop() {
        let app = create_app_loop();
        let updates = record_updates(&app);
        step_app_loop(&app, 9999.0, None);
        assert_eq!(updates.lock().unwrap()[0], 250.0);
    }

    #[test]
    fn produces_reproducible_metrics_when_stepped_to_a_fixed_frame_count_with_a_fixed_delta() {
        let run = || {
            let app = create_app_loop();
            let updates = record_updates(&app);
            for _ in 0..10 {
                step_app_loop(&app, 16.0, None);
            }
            let guard = app.read().unwrap();
            return (
                guard.delta_time,
                guard.elapsed_time,
                guard.frame_count,
                updates.lock().unwrap().clone(),
            );
        };
        let first = run();
        let second = run();
        assert_eq!(first.2, 10);
        assert_eq!(first.0, 16.0);
        assert!((first.1 - 0.16).abs() < 5e-11);
        assert_eq!(first.3, vec![16.0; 10]);
        assert_eq!(second, first);
    }
}

mod stop_app_loop {
    use super::*;

    #[test]
    fn sets_is_running_to_false() {
        let backend = manual_loop();
        let app = create_app_loop();
        start_app_loop(&backend.capability, &active(), &app, None);
        stop_app_loop(&app);
        assert!(!running(&app));
    }

    #[test]
    fn stops_emitting_after_stop() {
        let backend = manual_loop();
        let app = create_app_loop();
        let renders = count_renders(&app);
        start_app_loop(&backend.capability, &active(), &app, None);
        backend.tick(0.0);
        stop_app_loop(&app);
        backend.tick(16.0);
        assert_eq!(renders.load(Ordering::SeqCst), 1);
    }
}

mod unregister_app_loop_window {
    use super::*;

    #[test]
    fn removes_a_registered_window() {
        let app = create_app_loop();
        let win = create_app_window();
        register_app_loop_window(&app, &win);
        unregister_app_loop_window(&app, &win);
        assert!(app.read().unwrap().windows.is_empty());
    }

    #[test]
    fn clears_the_main_window_override_if_removed() {
        let app = create_app_loop();
        let win = create_app_window();
        set_app_loop_main_window(&app, &win);
        unregister_app_loop_window(&app, &win);
        assert!(get_app_loop_main_window(&app).is_none());
    }

    #[test]
    fn is_a_no_op_for_unregistered_windows() {
        let app = create_app_loop();
        unregister_app_loop_window(&app, &create_app_window());
        assert!(app.read().unwrap().windows.is_empty());
    }
}
