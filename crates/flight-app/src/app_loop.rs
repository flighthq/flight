use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::{Arc, RwLock, Weak};

use flight_entity::{Ref, allocate_entity, unknown_from_panic};
use flight_lifecycle::{AppLifecycleState, HostLifecycleCapability};
use flight_signals::{connect_signal, create_signal, disconnect_signal, emit_signal};

use crate::loop_types::*;
use crate::types::AppUnsubscribe;
use crate::window_types::AppWindow;

#[cfg(test)]
mod sugar_tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use flight_entity::Unknown;

    use super::*;
    use crate::app_window::create_app_window;

    fn exit_host() -> (HostAppExitCapability, Arc<AtomicUsize>) {
        let released = Arc::new(AtomicUsize::new(0));
        let tally = released.clone();
        let host = HostAppExitCapability {
            provider: Arc::new(()),
            subscribe: Arc::new(move |_listener| {
                let tally = tally.clone();
                let release: AppUnsubscribe = Arc::new(move || {
                    tally.fetch_add(1, Ordering::SeqCst);
                });
                return release;
            }),
        };
        return (host, released);
    }

    #[test]
    fn app_loop_methods_attach_app_loop_lifecycle_matches_attach_app_loop_lifecycle() {
        let (a, b) = (create_app_loop(), create_app_loop());
        let win = create_app_window();
        a.attach_app_loop_lifecycle(&win);
        attach_app_loop_lifecycle(&b, &win);
        assert_eq!(
            a.read().unwrap().observers.len(),
            b.read().unwrap().observers.len()
        );
        assert_eq!(a.read().unwrap().observers.len(), 1);
    }

    #[test]
    fn app_loop_methods_detach_app_loop_exit_matches_detach_app_loop_exit() {
        let (host, released) = exit_host();
        let (a, b) = (create_app_loop(), create_app_loop());
        attach_app_loop_exit(&host, &a);
        attach_app_loop_exit(&host, &b);
        a.detach_app_loop_exit();
        detach_app_loop_exit(&b);
        assert_eq!(released.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn app_loop_methods_dispose_app_loop_matches_dispose_app_loop() {
        let (host, released) = exit_host();
        let (a, b) = (create_app_loop(), create_app_loop());
        attach_app_loop_exit(&host, &a);
        attach_app_loop_exit(&host, &b);
        a.dispose_app_loop();
        dispose_app_loop(&b);
        assert_eq!(released.load(Ordering::SeqCst), 2);
        assert_eq!(a.read().unwrap().is_running, b.read().unwrap().is_running);
    }

    #[test]
    fn app_loop_methods_enable_app_loop_lifecycle_signals_matches_enable_app_loop_lifecycle_signals()
     {
        let (a, b) = (create_app_loop(), create_app_loop());
        a.enable_app_loop_lifecycle_signals();
        enable_app_loop_lifecycle_signals(&b);
        assert_eq!(
            a.read().unwrap().on_error.is_some(),
            b.read().unwrap().on_error.is_some()
        );
        assert!(a.read().unwrap().on_fixed_update.is_some());
    }

    #[test]
    fn app_loop_methods_for_each_app_loop_window_matches_for_each_app_loop_window() {
        let app = create_app_loop();
        register_app_loop_window(&app, &create_app_window());
        let (mut a, mut b) = (0, 0);
        app.for_each_app_loop_window(&mut |_win: &Ref<AppWindow>| a += 1);
        for_each_app_loop_window(&app, &mut |_win: &Ref<AppWindow>| b += 1);
        assert_eq!(a, b);
        assert_eq!(a, 1);
    }

    #[test]
    fn app_loop_methods_get_app_loop_frame_rate_matches_get_app_loop_frame_rate() {
        let app = create_app_loop();
        step_app_loop(
            &app,
            16.0,
            Some(&AppStepOptions {
                fixed_time_step: Some(16.0),
                max_delta_time: None,
                max_updates_per_frame: None,
            }),
        );
        step_app_loop(&app, 20.0, None);
        assert_eq!(app.get_app_loop_frame_rate(), get_app_loop_frame_rate(&app));
        assert_eq!(app.get_app_loop_frame_rate(), 1000.0 / 18.0);
    }

    #[test]
    fn app_loop_methods_get_app_loop_main_window_matches_get_app_loop_main_window() {
        let app = create_app_loop();
        let win = create_app_window();
        set_app_loop_main_window(&app, &win);
        assert!(Arc::ptr_eq(
            &app.get_app_loop_main_window().unwrap(),
            &get_app_loop_main_window(&app).unwrap()
        ));
    }

    #[test]
    fn app_loop_methods_get_app_loop_windows_matches_get_app_loop_windows() {
        let app = create_app_loop();
        register_app_loop_window(&app, &create_app_window());
        let (mut method, mut free) = (Vec::new(), Vec::new());
        app.get_app_loop_windows(&mut method);
        get_app_loop_windows(&mut free, &app);
        assert_eq!(method.len(), free.len());
        assert_eq!(method.len(), 1);
    }

    #[test]
    fn app_loop_methods_is_app_loop_running_matches_is_app_loop_running() {
        let app = create_app_loop();
        assert_eq!(app.is_app_loop_running(), is_app_loop_running(&app));
        app.write().unwrap().is_running = true;
        assert_eq!(app.is_app_loop_running(), is_app_loop_running(&app));
    }

    #[test]
    fn app_loop_methods_pause_app_loop_matches_pause_app_loop() {
        let (a, b) = (create_app_loop(), create_app_loop());
        a.write().unwrap().is_running = true;
        b.write().unwrap().is_running = true;
        a.pause_app_loop();
        pause_app_loop(&b);
        assert_eq!(a.read().unwrap().is_running, b.read().unwrap().is_running);
        assert!(!a.read().unwrap().is_running);
    }

    #[test]
    fn app_loop_methods_register_app_loop_window_matches_register_app_loop_window() {
        let (a, b) = (create_app_loop(), create_app_loop());
        let win = create_app_window();
        a.register_app_loop_window(&win);
        register_app_loop_window(&b, &win);
        assert_eq!(
            a.read().unwrap().windows.len(),
            b.read().unwrap().windows.len()
        );
        assert_eq!(a.read().unwrap().windows.len(), 1);
    }

    #[test]
    fn app_loop_methods_resume_app_loop_matches_resume_app_loop() {
        let (a, b) = (create_app_loop(), create_app_loop());
        for app in [&a, &b] {
            app.write().unwrap().is_running = true;
            pause_app_loop(app);
        }
        a.resume_app_loop();
        resume_app_loop(&b);
        assert_eq!(a.read().unwrap().is_running, b.read().unwrap().is_running);
        assert!(a.read().unwrap().is_running);
    }

    #[test]
    fn app_loop_methods_set_app_loop_main_window_matches_set_app_loop_main_window() {
        let (a, b) = (create_app_loop(), create_app_loop());
        let win = create_app_window();
        a.set_app_loop_main_window(&win);
        set_app_loop_main_window(&b, &win);
        assert!(Arc::ptr_eq(
            &get_app_loop_main_window(&a).unwrap(),
            &get_app_loop_main_window(&b).unwrap()
        ));
    }

    #[test]
    fn app_loop_methods_step_app_loop_matches_step_app_loop() {
        let (a, b) = (create_app_loop(), create_app_loop());
        a.step_app_loop(9999.0, None);
        step_app_loop(&b, 9999.0, None);
        assert_eq!(a.read().unwrap().delta_time, b.read().unwrap().delta_time);
        assert_eq!(a.read().unwrap().delta_time, 250.0);
    }

    #[test]
    fn app_loop_methods_stop_app_loop_matches_stop_app_loop() {
        let (a, b) = (create_app_loop(), create_app_loop());
        for app in [&a, &b] {
            app.write().unwrap().is_running = true;
        }
        a.stop_app_loop();
        stop_app_loop(&b);
        assert_eq!(a.read().unwrap().is_running, b.read().unwrap().is_running);
        assert!(!a.read().unwrap().is_running);
    }

    #[test]
    fn app_loop_methods_unregister_app_loop_window_matches_unregister_app_loop_window() {
        let (a, b) = (create_app_loop(), create_app_loop());
        let win = create_app_window();
        register_app_loop_window(&a, &win);
        register_app_loop_window(&b, &win);
        a.unregister_app_loop_window(&win);
        unregister_app_loop_window(&b, &win);
        assert_eq!(
            a.read().unwrap().windows.len(),
            b.read().unwrap().windows.len()
        );
        assert!(a.read().unwrap().windows.is_empty());
    }

    #[test]
    fn host_app_exit_capability_attach_app_loop_exit_matches_attach_app_loop_exit() {
        let (host, _released) = exit_host();
        let (a, b) = (create_app_loop(), create_app_loop());
        host.attach_app_loop_exit(&a);
        attach_app_loop_exit(&host, &b);
        assert_eq!(
            a.read().unwrap().observers.len(),
            b.read().unwrap().observers.len()
        );
        assert_eq!(a.read().unwrap().observers.len(), 1);
    }

    #[test]
    fn host_app_loop_capability_start_app_loop_matches_start_app_loop() {
        let frames = Arc::new(AtomicUsize::new(0));
        let requested = frames.clone();
        let host = HostAppLoopCapability {
            provider: Arc::new(()),
            cancel_frame: Arc::new(|_handle: &Unknown| {}),
            now: Arc::new(|| 0.0),
            request_frame: Arc::new(move |_frame: AppFrameCallback| {
                requested.fetch_add(1, Ordering::SeqCst);
                let handle: Unknown = None;
                return handle;
            }),
        };
        let lifecycle = HostLifecycleCapability {
            get_state: Arc::new(|| AppLifecycleState::Active),
            subscribe: Arc::new(|_listener| Arc::new(|| {})),
            get_launch_kind: None,
            subscribe_memory_warning: None,
        };
        let (a, b) = (create_app_loop(), create_app_loop());
        host.start_app_loop(&lifecycle, &a, None);
        start_app_loop(&host, &lifecycle, &b, None);
        assert_eq!(a.read().unwrap().is_running, b.read().unwrap().is_running);
        assert_eq!(frames.load(Ordering::SeqCst), 2);
    }
}

/// Method sugar on the shared `Ref<AppLoop>` handle (D18): each method delegates to the free
/// function of the same name.
// flight-lint: allow(f64) D1: frame rates and deltas are JS numbers
pub trait AppLoopMethods {
    fn attach_app_loop_lifecycle(&self, win: &Ref<AppWindow>);
    fn detach_app_loop_exit(&self);
    fn dispose_app_loop(&self);
    fn enable_app_loop_lifecycle_signals(&self);
    fn for_each_app_loop_window(&self, visitor: &mut dyn FnMut(&Ref<AppWindow>));
    fn get_app_loop_frame_rate(&self) -> f64;
    fn get_app_loop_main_window(&self) -> Option<Ref<AppWindow>>;
    fn get_app_loop_windows(&self, out: &mut Vec<Ref<AppWindow>>);
    fn is_app_loop_running(&self) -> bool;
    fn pause_app_loop(&self);
    fn register_app_loop_window(&self, win: &Ref<AppWindow>);
    fn resume_app_loop(&self);
    fn set_app_loop_main_window(&self, win: &Ref<AppWindow>);
    fn step_app_loop(&self, delta_time: f64, options: Option<&AppStepOptions>);
    fn stop_app_loop(&self);
    fn unregister_app_loop_window(&self, win: &Ref<AppWindow>);
}

// flight-lint: allow(f64) D1: loop defaults are JS-number durations and limits
const DEFAULT_BACKGROUND_FRAME_RATE: f64 = 0.0;
// flight-lint: allow(f64) D1: loop defaults are JS-number durations and limits
const DEFAULT_FIXED_TIMESTEP: f64 = 0.0;
// flight-lint: allow(f64) D1: loop defaults are JS-number durations and limits
const DEFAULT_MAX_DELTA_TIME: f64 = 250.0;
// flight-lint: allow(f64) D1: loop defaults are JS-number durations and limits
const DEFAULT_MAX_UPDATES_PER_FRAME: f64 = 5.0;
const ROLLING_FPS_WINDOW: usize = 60;

/// One started loop's frame callback state (the source's `tick` closure).
// flight-lint: allow(f64) D1: frame intervals are JS-number milliseconds
struct AppLoopTick {
    app: Weak<RwLock<AppLoop>>,
    backend: HostAppLoopCapability,
    background_interval: f64,
    frame_interval: f64,
    lifecycle: HostLifecycleCapability,
    loop_state: Ref<AppLoopState>,
    max_delta_time: f64,
}

/// Creates a stopped loop with no windows, the three core signals, and the opt-in signals unset.
pub fn create_app_loop() -> Ref<AppLoop> {
    let mut out: AppLoop = allocate_entity();
    initialize_app_loop(&mut out);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(f64) D1: loop state fields are JS numbers
fn create_loop_state(
    fixed_time_step: f64,
    max_delta_time: f64,
    max_updates_per_frame: f64,
) -> Ref<AppLoopState> {
    return Arc::new(RwLock::new(AppLoopState {
        fixed_accumulator: 0.0,
        fixed_time_step,
        fps_buffer: Vec::new(),
        fps_head: 0,
        frame_handle: None,
        frame_rate_accumulated: 0.0,
        last_time: -1.0,
        max_delta_time,
        max_updates_per_frame,
    }));
}

/// The construction initializer of `create_app_loop`.
pub fn initialize_app_loop(out: &mut AppLoop) {
    out.delta_time = 0.0;
    out.elapsed_time = 0.0;
    out.frame_count = 0;
    out.interpolation_alpha = 1.0;
    out.is_running = false;
    out.on_activate = None;
    out.on_deactivate = None;
    out.on_error = None;
    out.on_exit = create_signal();
    out.on_fixed_update = None;
    out.on_render = create_signal();
    out.on_update = create_signal();
    out.windows = Vec::new();
    out.loop_state = None;
    out.main_window = None;
    out.observers = Vec::new();
}

// One update + render step: clamp the delta, advance the clocks, run any fixed steps, then emit
// `on_update` and `on_render`. No loop lock is held while a signal emits.
// flight-lint: allow(f64) D1: frame deltas are JS-number milliseconds
fn apply_app_loop_step(
    app: &Ref<AppLoop>,
    delta_time: f64,
    loop_state: Option<&Ref<AppLoopState>>,
    fixed_step_state: Option<&Ref<AppLoopState>>,
    max_delta_time: f64,
) {
    let clamped = get_js_min(delta_time, max_delta_time);
    let (fixed_update, on_update, on_render) = {
        let mut guard = app.write().unwrap();
        guard.delta_time = clamped;
        guard.elapsed_time += clamped / 1000.0;
        guard.frame_count += 1;
        (
            guard.on_fixed_update.clone(),
            guard.on_update.clone(),
            guard.on_render.clone(),
        )
    };
    if let Some(loop_state) = loop_state {
        record_fps_sample(&mut loop_state.write().unwrap(), clamped);
    }
    let fixed = fixed_step_state.filter(|state| state.read().unwrap().fixed_time_step > 0.0);
    match (fixed, fixed_update) {
        (Some(state), Some(fixed_update)) => {
            state.write().unwrap().fixed_accumulator += clamped;
            let mut iterations = 0.0;
            loop {
                let step = {
                    let mut guard = state.write().unwrap();
                    if !(guard.fixed_accumulator >= guard.fixed_time_step
                        && iterations < guard.max_updates_per_frame)
                    {
                        break;
                    }
                    guard.fixed_accumulator -= guard.fixed_time_step;
                    guard.fixed_time_step
                };
                iterations += 1.0;
                invoke_with_app_loop_error_handling(app, || emit_signal(&fixed_update, &step));
            }
            let alpha = {
                let mut guard = state.write().unwrap();
                // Hitting the cap drains the leftover to avoid a spiral of death.
                if iterations >= guard.max_updates_per_frame {
                    guard.fixed_accumulator = 0.0;
                }
                guard.fixed_accumulator / guard.fixed_time_step
            };
            app.write().unwrap().interpolation_alpha = alpha;
        }
        _ => app.write().unwrap().interpolation_alpha = 1.0,
    }
    invoke_with_app_loop_error_handling(app, || emit_signal(&on_update, &clamped));
    invoke_with_app_loop_error_handling(app, || emit_signal(&on_render, &()));
}

/// Forwards the host's application-exit event to `app.on_exit`, replacing a prior exit attachment.
pub fn attach_app_loop_exit(host_app_exit: &HostAppExitCapability, app: &Ref<AppLoop>) {
    let signal = app.read().unwrap().on_exit.clone();
    replace_app_loop_observer(app, AppLoopObserverKey::Exit, || {
        return (host_app_exit.subscribe)(Arc::new(move || emit_signal(&signal, &())));
    });
}

/// Wires `win.on_deactivate` to pause the loop and `win.on_activate` to resume it, each also
/// emitting the loop's matching opt-in lifecycle signal when enabled. One wiring per window;
/// re-attaching a window replaces its wiring.
pub fn attach_app_loop_lifecycle(app: &Ref<AppLoop>, win: &Ref<AppWindow>) {
    let key = AppLoopObserverKey::Lifecycle(Arc::downgrade(win));
    let (on_deactivate, on_activate) = {
        let guard = win.read().unwrap();
        (guard.on_deactivate.clone(), guard.on_activate.clone())
    };
    replace_app_loop_observer(app, key, || {
        let (pausing, resuming) = (Arc::downgrade(app), Arc::downgrade(app));
        let deactivate = connect_signal(
            &on_deactivate,
            Arc::new(move |_value: &()| {
                if let Some(app) = pausing.upgrade() {
                    pause_app_loop(&app);
                    let signal = app.read().unwrap().on_deactivate.clone();
                    if let Some(signal) = signal {
                        emit_signal(&signal, &());
                    }
                }
            }),
            None,
        );
        let activate = connect_signal(
            &on_activate,
            Arc::new(move |_value: &()| {
                if let Some(app) = resuming.upgrade() {
                    resume_app_loop(&app);
                    let signal = app.read().unwrap().on_activate.clone();
                    if let Some(signal) = signal {
                        emit_signal(&signal, &());
                    }
                }
            }),
            None,
        );
        return Arc::new(move || {
            disconnect_signal(&on_deactivate, deactivate);
            disconnect_signal(&on_activate, activate);
        });
    });
}

/// Releases the exit attachment.
pub fn detach_app_loop_exit(app: &Ref<AppLoop>) {
    remove_app_loop_observer(app, &AppLoopObserverKey::Exit);
}

/// Runs every observer cleanup in first-set order (cancelling the frame request, the exit and the
/// lifecycle wirings), forgets them, and marks the loop not running.
pub fn dispose_app_loop(app: &Ref<AppLoop>) {
    let cleanups: Vec<AppUnsubscribe> = app
        .read()
        .unwrap()
        .observers
        .iter()
        .map(|(_, cleanup)| cleanup.clone())
        .collect();
    for cleanup in cleanups {
        cleanup();
    }
    let mut guard = app.write().unwrap();
    guard.observers.clear();
    guard.is_running = false;
}

/// Allocates the opt-in lifecycle signals (`on_activate`, `on_deactivate`, `on_error`,
/// `on_fixed_update`) that are still unset. Idempotent.
pub fn enable_app_loop_lifecycle_signals(app: &Ref<AppLoop>) {
    let mut guard = app.write().unwrap();
    if guard.on_activate.is_none() {
        guard.on_activate = Some(create_signal());
    }
    if guard.on_deactivate.is_none() {
        guard.on_deactivate = Some(create_signal());
    }
    if guard.on_error.is_none() {
        guard.on_error = Some(create_signal());
    }
    if guard.on_fixed_update.is_none() {
        guard.on_fixed_update = Some(create_signal());
    }
}

/// Calls `visitor` for each registered window, in registration order.
// flight-lint: allow(conform-params) the TS parameter is named `fn`, a Rust keyword, so it is `visitor` here
pub fn for_each_app_loop_window(app: &Ref<AppLoop>, visitor: &mut dyn FnMut(&Ref<AppWindow>)) {
    let windows = app.read().unwrap().windows.clone();
    for win in &windows {
        visitor(win);
    }
}

/// The rolling-average frames per second over the last 60 recorded frames (positive deltas only),
/// or 0 before two samples exist.
// flight-lint: allow(f64) D1: frame rates and deltas are JS numbers
pub fn get_app_loop_frame_rate(app: &Ref<AppLoop>) -> f64 {
    let Some(state) = app.read().unwrap().loop_state.clone() else {
        return 0.0;
    };
    let state = state.read().unwrap();
    if state.fps_buffer.len() < 2 {
        return 0.0;
    }
    let mut total = 0.0;
    let mut count = 0.0;
    for delta in &state.fps_buffer {
        if *delta > 0.0 {
            total += *delta;
            count += 1.0;
        }
    }
    if count == 0.0 {
        return 0.0;
    }
    let average = total / count;
    return if average > 0.0 { 1000.0 / average } else { 0.0 };
}

/// The explicit main window, else the first registered window, else `None`.
pub fn get_app_loop_main_window(app: &Ref<AppLoop>) -> Option<Ref<AppWindow>> {
    let guard = app.read().unwrap();
    return guard
        .main_window
        .clone()
        .or_else(|| guard.windows.first().cloned());
}

/// A copy of the registered windows; prefer `for_each_app_loop_window` in hot paths.
// flight-lint: allow(conform-params) D24 (Principal 21f7557f): the result fills a caller-owned out, cleared first
pub fn get_app_loop_windows(out: &mut Vec<Ref<AppWindow>>, app: &Ref<AppLoop>) {
    out.clear();
    out.extend(app.read().unwrap().windows.iter().cloned());
}

// The source's `Math.min(a, b)`: NaN when either is NaN.
// flight-lint: allow(f64) D1: JS-number arithmetic
fn get_js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    return if a < b { a } else { b };
}

// Emits through `callback`; when the loop has an `on_error` signal, a panic from a listener is caught
// and emitted there instead (canonical lossless `unknown_from_panic`), else it propagates.
fn invoke_with_app_loop_error_handling(app: &Ref<AppLoop>, callback: impl FnOnce()) {
    let on_error = app.read().unwrap().on_error.clone();
    let Some(on_error) = on_error else {
        callback();
        return;
    };
    if let Err(payload) = catch_unwind(AssertUnwindSafe(callback)) {
        emit_signal(&on_error, &unknown_from_panic(payload));
    }
}

/// Whether the loop is running.
pub fn is_app_loop_running(app: &Ref<AppLoop>) -> bool {
    return app.read().unwrap().is_running;
}

fn is_same_observer(a: &AppLoopObserverKey, b: &AppLoopObserverKey) -> bool {
    return match (a, b) {
        (AppLoopObserverKey::Exit, AppLoopObserverKey::Exit)
        | (AppLoopObserverKey::Loop, AppLoopObserverKey::Loop)
        | (AppLoopObserverKey::Paused, AppLoopObserverKey::Paused) => true,
        (AppLoopObserverKey::Lifecycle(a), AppLoopObserverKey::Lifecycle(b)) => Weak::ptr_eq(a, b),
        _ => false,
    };
}

/// Pauses a running loop: frames keep being scheduled but emit nothing until `resume_app_loop`.
pub fn pause_app_loop(app: &Ref<AppLoop>) {
    let mut guard = app.write().unwrap();
    if !guard.is_running
        || guard
            .observers
            .iter()
            .any(|(entry, _)| matches!(entry, AppLoopObserverKey::Paused))
    {
        return;
    }
    guard.is_running = false;
    guard
        .observers
        .push((AppLoopObserverKey::Paused, Arc::new(|| {})));
}

// flight-lint: allow(f64) D1: frame deltas are JS-number milliseconds
fn record_fps_sample(state: &mut AppLoopState, delta: f64) {
    if state.fps_buffer.len() < ROLLING_FPS_WINDOW {
        state.fps_buffer.push(delta);
    } else {
        let head = state.fps_head;
        state.fps_buffer[head] = delta;
        state.fps_head = (head + 1) % ROLLING_FPS_WINDOW;
    }
}

/// Registers `win` as a managed window; a no-op when already registered.
pub fn register_app_loop_window(app: &Ref<AppLoop>, win: &Ref<AppWindow>) {
    let mut guard = app.write().unwrap();
    if guard
        .windows
        .iter()
        .any(|existing| Arc::ptr_eq(existing, win))
    {
        return;
    }
    guard.windows.push(win.clone());
}

// The source's `observers.get(key)?.(); observers.delete(key)`.
fn remove_app_loop_observer(app: &Ref<AppLoop>, key: &AppLoopObserverKey) {
    let cleanup = app
        .read()
        .unwrap()
        .observers
        .iter()
        .find(|(entry, _)| is_same_observer(entry, key))
        .map(|(_, cleanup)| cleanup.clone());
    if let Some(cleanup) = cleanup {
        cleanup();
    }
    app.write()
        .unwrap()
        .observers
        .retain(|(entry, _)| !is_same_observer(entry, key));
}

// The source's `observers.get(key)?.(); observers.set(key, subscribe())`: the previous cleanup runs
// first, then the new one takes the slot (keeping its first-set position).
fn replace_app_loop_observer(
    app: &Ref<AppLoop>,
    key: AppLoopObserverKey,
    subscribe: impl FnOnce() -> AppUnsubscribe,
) {
    let previous = app
        .read()
        .unwrap()
        .observers
        .iter()
        .find(|(entry, _)| is_same_observer(entry, &key))
        .map(|(_, cleanup)| cleanup.clone());
    if let Some(previous) = previous {
        previous();
    }
    let cleanup = subscribe();
    set_app_loop_observer(app, key, cleanup);
}

// The source's `observers.set(kLoop, () => backend.cancelFrame(loopState.frameHandle))`: the cleanup
// cancels whichever frame is pending when it runs.
// flight-lint: allow(f64) D1: the host frame timestamp is a JS number
fn request_app_loop_frame(app: &Ref<AppLoop>, tick: &Arc<AppLoopTick>) {
    let next = tick.clone();
    let handle =
        (tick.backend.request_frame)(Arc::new(move |time: f64| run_app_loop_tick(&next, time)));
    tick.loop_state.write().unwrap().frame_handle = handle;
    let (backend, loop_state) = (tick.backend.clone(), tick.loop_state.clone());
    set_app_loop_observer(
        app,
        AppLoopObserverKey::Loop,
        Arc::new(move || {
            let handle = loop_state.read().unwrap().frame_handle.clone();
            (backend.cancel_frame)(&handle);
        }),
    );
}

/// Resumes a paused loop. The next frame computes its delta from the resume rather than the pause,
/// so the gap is not dumped into `on_update`, and the fixed and frame-rate accumulators restart.
pub fn resume_app_loop(app: &Ref<AppLoop>) {
    let mut guard = app.write().unwrap();
    if !guard
        .observers
        .iter()
        .any(|(entry, _)| matches!(entry, AppLoopObserverKey::Paused))
    {
        return;
    }
    guard
        .observers
        .retain(|(entry, _)| !matches!(entry, AppLoopObserverKey::Paused));
    if let Some(loop_state) = &guard.loop_state {
        let mut state = loop_state.write().unwrap();
        state.last_time = -1.0;
        state.fixed_accumulator = 0.0;
        state.frame_rate_accumulated = 0.0;
    }
    guard.is_running = true;
}

// flight-lint: allow(f64) D1: the host frame timestamp is a JS number
fn run_app_loop_tick(tick: &Arc<AppLoopTick>, time: f64) {
    let Some(app) = tick.app.upgrade() else {
        return;
    };
    if !app.read().unwrap().is_running {
        // Paused: reschedule without emitting.
        request_app_loop_frame(&app, tick);
        return;
    }
    let (first, raw) = {
        let mut state = tick.loop_state.write().unwrap();
        let first = state.last_time < 0.0;
        let raw = if first { 0.0 } else { time - state.last_time };
        state.last_time = time;
        (first, raw)
    };
    let running = app.read().unwrap().is_running;
    let active_interval = if running
        && tick.background_interval > 0.0
        && (tick.lifecycle.get_state)() == AppLifecycleState::Background
    {
        tick.background_interval
    } else {
        tick.frame_interval
    };
    // Frame-rate cap: skip until the target interval has accumulated. The first tick always emits.
    if !first {
        let skip = {
            let mut state = tick.loop_state.write().unwrap();
            state.frame_rate_accumulated += raw;
            active_interval > 0.0 && state.frame_rate_accumulated < active_interval
        };
        if skip {
            request_app_loop_frame(&app, tick);
            return;
        }
    }
    let delta = {
        let mut state = tick.loop_state.write().unwrap();
        let delta = if active_interval > 0.0 && !first {
            state.frame_rate_accumulated
        } else {
            raw
        };
        state.frame_rate_accumulated = 0.0;
        delta
    };
    apply_app_loop_step(
        &app,
        delta,
        Some(&tick.loop_state),
        Some(&tick.loop_state),
        tick.max_delta_time,
    );
    request_app_loop_frame(&app, tick);
}

/// Sets the explicit main window, registering it first when needed.
pub fn set_app_loop_main_window(app: &Ref<AppLoop>, win: &Ref<AppWindow>) {
    register_app_loop_window(app, win);
    app.write().unwrap().main_window = Some(win.clone());
}

fn set_app_loop_observer(app: &Ref<AppLoop>, key: AppLoopObserverKey, cleanup: AppUnsubscribe) {
    let mut guard = app.write().unwrap();
    match guard
        .observers
        .iter_mut()
        .find(|(entry, _)| is_same_observer(entry, &key))
    {
        Some(slot) => slot.1 = cleanup,
        None => guard.observers.push((key, cleanup)),
    }
}

/// Starts (or restarts) the frame loop on the host's frame scheduler. A running loop is cancelled
/// first and any pause cleared. Each frame computes the delta from the previous frame (0 on the
/// first), throttles to the target frame rate (or the background rate while the host lifecycle
/// reports the app in the background), and runs one update + render step clamped to the maximum
/// delta.
pub fn start_app_loop(
    host_app_loop: &HostAppLoopCapability,
    host_lifecycle: &HostLifecycleCapability,
    app: &Ref<AppLoop>,
    options: Option<&AppLoopOptions>,
) {
    let previous = app
        .read()
        .unwrap()
        .observers
        .iter()
        .find(|(entry, _)| matches!(entry, AppLoopObserverKey::Loop))
        .map(|(_, cleanup)| cleanup.clone());
    if let Some(previous) = previous {
        previous();
    }
    app.write()
        .unwrap()
        .observers
        .retain(|(entry, _)| !matches!(entry, AppLoopObserverKey::Paused));
    let options = options.cloned().unwrap_or_default();
    let max_delta_time = options.max_delta_time.unwrap_or(DEFAULT_MAX_DELTA_TIME);
    let target_frame_rate = options.target_frame_rate.unwrap_or(0.0);
    let background_frame_rate = options
        .background_frame_rate
        .unwrap_or(DEFAULT_BACKGROUND_FRAME_RATE);
    let fixed_time_step = options.fixed_time_step.unwrap_or(DEFAULT_FIXED_TIMESTEP);
    let max_updates_per_frame = options
        .max_updates_per_frame
        .unwrap_or(DEFAULT_MAX_UPDATES_PER_FRAME);
    let loop_state = create_loop_state(fixed_time_step, max_delta_time, max_updates_per_frame);
    {
        let mut guard = app.write().unwrap();
        guard.loop_state = Some(loop_state.clone());
        guard.is_running = true;
    }
    let tick = Arc::new(AppLoopTick {
        app: Arc::downgrade(app),
        backend: host_app_loop.clone(),
        background_interval: if background_frame_rate > 0.0 {
            1000.0 / background_frame_rate
        } else {
            0.0
        },
        frame_interval: if target_frame_rate > 0.0 {
            1000.0 / target_frame_rate
        } else {
            0.0
        },
        lifecycle: host_lifecycle.clone(),
        loop_state,
        max_delta_time,
    });
    request_app_loop_frame(app, &tick);
}

/// Drives one update + render step with an explicit delta (ms), without a host loop. Fixed-step
/// options are self-contained, so deterministic headless callers need not start a loop.
// flight-lint: allow(f64) D1: frame deltas are JS-number milliseconds
pub fn step_app_loop(app: &Ref<AppLoop>, delta_time: f64, options: Option<&AppStepOptions>) {
    let options = options.cloned().unwrap_or_default();
    let existing = app.read().unwrap().loop_state.clone();
    let fixed_time_step = options.fixed_time_step.unwrap_or(DEFAULT_FIXED_TIMESTEP);
    let max_delta_time = options
        .max_delta_time
        .or_else(|| {
            existing
                .as_ref()
                .map(|state| state.read().unwrap().max_delta_time)
        })
        .unwrap_or(DEFAULT_MAX_DELTA_TIME);
    let max_updates_per_frame = options
        .max_updates_per_frame
        .unwrap_or(DEFAULT_MAX_UPDATES_PER_FRAME);
    let loop_state = if fixed_time_step > 0.0 {
        Some(match existing {
            Some(state) => state,
            None => {
                let state =
                    create_loop_state(fixed_time_step, max_delta_time, max_updates_per_frame);
                app.write().unwrap().loop_state = Some(state.clone());
                state
            }
        })
    } else {
        existing
    };
    if fixed_time_step > 0.0 {
        if let Some(state) = &loop_state {
            let mut guard = state.write().unwrap();
            guard.fixed_time_step = fixed_time_step;
            guard.max_updates_per_frame = max_updates_per_frame;
            if options.max_delta_time.is_some() {
                guard.max_delta_time = max_delta_time;
            }
        }
    }
    let fixed_step_state = if fixed_time_step > 0.0 {
        loop_state.as_ref()
    } else {
        None
    };
    apply_app_loop_step(
        app,
        delta_time,
        loop_state.as_ref(),
        fixed_step_state,
        max_delta_time,
    );
}

/// Stops the loop: cancels the pending frame, clears any pause and the loop state, and marks it not
/// running.
pub fn stop_app_loop(app: &Ref<AppLoop>) {
    remove_app_loop_observer(app, &AppLoopObserverKey::Loop);
    let mut guard = app.write().unwrap();
    guard
        .observers
        .retain(|(entry, _)| !matches!(entry, AppLoopObserverKey::Paused));
    guard.loop_state = None;
    guard.is_running = false;
}

/// Unregisters `win`, clearing the main-window override when it pointed at `win`.
pub fn unregister_app_loop_window(app: &Ref<AppLoop>, win: &Ref<AppWindow>) {
    let mut guard = app.write().unwrap();
    if let Some(index) = guard
        .windows
        .iter()
        .position(|existing| Arc::ptr_eq(existing, win))
    {
        guard.windows.remove(index);
    }
    if guard
        .main_window
        .as_ref()
        .is_some_and(|main| Arc::ptr_eq(main, win))
    {
        guard.main_window = None;
    }
}

impl HostAppExitCapability {
    pub fn attach_app_loop_exit(&self, app: &Ref<AppLoop>) {
        attach_app_loop_exit(self, app);
    }
}

impl HostAppLoopCapability {
    pub fn start_app_loop(
        &self,
        host_lifecycle: &HostLifecycleCapability,
        app: &Ref<AppLoop>,
        options: Option<&AppLoopOptions>,
    ) {
        start_app_loop(self, host_lifecycle, app, options);
    }
}

impl AppLoopMethods for Ref<AppLoop> {
    fn attach_app_loop_lifecycle(&self, win: &Ref<AppWindow>) {
        attach_app_loop_lifecycle(self, win);
    }

    fn detach_app_loop_exit(&self) {
        detach_app_loop_exit(self);
    }

    fn dispose_app_loop(&self) {
        dispose_app_loop(self);
    }

    fn enable_app_loop_lifecycle_signals(&self) {
        enable_app_loop_lifecycle_signals(self);
    }

    fn for_each_app_loop_window(&self, visitor: &mut dyn FnMut(&Ref<AppWindow>)) {
        for_each_app_loop_window(self, visitor);
    }

    // flight-lint: allow(f64) D1: frame rates are JS numbers
    fn get_app_loop_frame_rate(&self) -> f64 {
        return get_app_loop_frame_rate(self);
    }

    fn get_app_loop_main_window(&self) -> Option<Ref<AppWindow>> {
        return get_app_loop_main_window(self);
    }

    fn get_app_loop_windows(&self, out: &mut Vec<Ref<AppWindow>>) {
        get_app_loop_windows(out, self);
    }

    fn is_app_loop_running(&self) -> bool {
        return is_app_loop_running(self);
    }

    fn pause_app_loop(&self) {
        pause_app_loop(self);
    }

    fn register_app_loop_window(&self, win: &Ref<AppWindow>) {
        register_app_loop_window(self, win);
    }

    fn resume_app_loop(&self) {
        resume_app_loop(self);
    }

    fn set_app_loop_main_window(&self, win: &Ref<AppWindow>) {
        set_app_loop_main_window(self, win);
    }

    // flight-lint: allow(f64) D1: frame deltas are JS-number milliseconds
    fn step_app_loop(&self, delta_time: f64, options: Option<&AppStepOptions>) {
        step_app_loop(self, delta_time, options);
    }

    fn stop_app_loop(&self) {
        stop_app_loop(self);
    }

    fn unregister_app_loop_window(&self, win: &Ref<AppWindow>) {
        unregister_app_loop_window(self, win);
    }
}
