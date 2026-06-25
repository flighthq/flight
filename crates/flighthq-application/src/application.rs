//! Application lifecycle — main loop, update/render signals, frame stats,
//! window registry, and teardown.
//!
//! The TS reference drives the loop from the browser's `requestAnimationFrame`
//! and wires exit to `beforeunload`. Neither has a portable Rust equivalent at
//! this layer: on native the loop is driven by the host's event loop
//! (winit/SDL) and exit is a host signal. So [`start_application_loop`] here
//! sets up the loop state and a native host pumps each frame by calling
//! [`run_application_frame`]; [`step_application_loop`] drives one explicit
//! tick. The frame contract matches TS: per tick the delta is clamped, the
//! fixed-timestep accumulator runs `on_fixed_update`, frame stats are updated,
//! and `on_update` then `on_render` are emitted (each wrapped in `on_error`
//! when that signal is enabled).
//!
//! TS divergence (recorded): the browser `LoopBackend` self-schedules through
//! `requestAnimationFrame`; the Rust loop is host-pumped, so the backend only
//! supplies the clock (`now`). The `requestFrame`/`cancelFrame` pair is
//! TS-specific and omitted from the Rust [`LoopBackend`] trait.

use flighthq_signals::{create_signal, emit_signal};
use flighthq_types::{Application, ApplicationLoopOptions, ApplicationWindow, LoopBackend};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;

const DEFAULT_MAX_DELTA_TIME: f64 = 250.0; // ms — clamps huge gaps after a stall
const DEFAULT_MAX_UPDATES_PER_FRAME: u32 = 5; // spiral-of-death guard
const ROLLING_FPS_WINDOW: usize = 60;

// ---------------------------------------------------------------------------
// Application entity
// ---------------------------------------------------------------------------

/// Wires a window's deactivate/activate to pause/resume the application loop so
/// the loop automatically pauses when the window is backgrounded and resumes
/// when it returns. Opt-in — not wired by [`create_application`]. The wiring is
/// recorded in a per-(app, window) observer slot; calling again replaces the
/// prior wiring, and [`detach_application_lifecycle`] removes it.
///
/// `signals` is the window's [`ApplicationWindowSignals`](crate::window::ApplicationWindowSignals)
/// companion: its `on_deactivate` pauses the loop and `on_activate` resumes it.
///
/// TS divergence (recorded): TS captures the `app` reference in the listener and
/// calls `pauseApplicationLoop(app)`, which both flips `app.isRunning` and
/// re-emits `app.onDeactivate`. Rust's `'static` signal listeners cannot capture
/// a `&mut Application`, so the listeners pause/resume through the loop's side
/// table (keyed by the app's address). The run gate is the side table's `paused`
/// flag, which [`is_application_running`] consults — so `is_application_running`
/// reflects a signal-driven pause without the listener touching the entity. The
/// re-emit of `app.on_deactivate`/`on_activate` is left to the caller wiring
/// those signals directly when needed.
pub fn attach_application_lifecycle(
    app: &Application,
    win: &ApplicationWindow,
    signals: &crate::window::ApplicationWindowSignals,
) {
    use flighthq_signals::{SignalConnectOptions, connect_signal};

    let key = lifecycle_key(app, win);
    // Replace any prior wiring for this (app, win) pair.
    lifecycle_observers()
        .lock()
        .expect("application lifecycle mutex poisoned")
        .remove(&key);

    let app_ptr = app_key(app);
    let deactivate = connect_signal(
        &signals.on_deactivate,
        Arc::new(move |_: &()| pause_application_loop_by_key(app_ptr)),
        SignalConnectOptions::default(),
    );
    let activate = connect_signal(
        &signals.on_activate,
        Arc::new(move |_: &()| resume_application_loop_by_key(app_ptr)),
        SignalConnectOptions::default(),
    );

    lifecycle_observers()
        .lock()
        .expect("application lifecycle mutex poisoned")
        .insert(key, vec![Box::new(deactivate), Box::new(activate)]);
}

/// Creates a new [`Application`] with the always-on lifecycle signals
/// initialized. The opt-in signals (`on_activate`, `on_deactivate`, `on_error`,
/// `on_fixed_update`) start as `None`; call
/// [`enable_application_lifecycle_signals`] to allocate them.
pub fn create_application() -> Application {
    Application {
        delta_time: 0.0,
        elapsed_time: 0.0,
        frame_count: 0,
        interpolation_alpha: 1.0,
        is_running: false,
        on_activate: None,
        on_deactivate: None,
        on_error: None,
        on_exit: create_signal(),
        on_fixed_update: None,
        on_render: create_signal(),
        on_update: create_signal(),
        windows: Vec::new(),
    }
}

/// Builds the built-in web-equivalent loop backend whose clock is a monotonic
/// process timer (the native analogue of `performance.now`).
pub fn create_web_loop_backend() -> Arc<dyn LoopBackend> {
    Arc::new(InstantLoopBackend {
        origin: Instant::now(),
    })
}

/// Detaches the lifecycle wiring installed by [`attach_application_lifecycle`].
pub fn detach_application_lifecycle(app: &Application, win: &ApplicationWindow) {
    lifecycle_observers()
        .lock()
        .expect("application lifecycle mutex poisoned")
        .remove(&lifecycle_key(app, win));
}

/// Disposes all internal loop/lifecycle state for `app`, stops the loop, and
/// clears `is_running`.
pub fn dispose_application(app: &mut Application) {
    stop_application_loop(app);
    let app_ptr = app_key(app);
    lifecycle_observers()
        .lock()
        .expect("application lifecycle mutex poisoned")
        .retain(|key, _| key.0 != app_ptr);
    app.is_running = false;
}

/// Allocates and attaches the opt-in lifecycle signals (`on_activate`,
/// `on_deactivate`, `on_error`, `on_fixed_update`) on an application created
/// without them. Idempotent — already-present signals are left untouched.
pub fn enable_application_lifecycle_signals(app: &mut Application) {
    if app.on_activate.is_none() {
        app.on_activate = Some(create_signal());
    }
    if app.on_deactivate.is_none() {
        app.on_deactivate = Some(create_signal());
    }
    if app.on_error.is_none() {
        app.on_error = Some(create_signal());
    }
    if app.on_fixed_update.is_none() {
        app.on_fixed_update = Some(create_signal());
    }
}

/// Iterates over all registered application windows, calling `f` for each. Does
/// not allocate.
pub fn for_each_application_window(app: &Application, mut f: impl FnMut(&ApplicationWindow)) {
    for win in &app.windows {
        f(win);
    }
}

/// Returns the measured rolling-average frames per second over the last
/// [`ROLLING_FPS_WINDOW`] frames, or `0.0` before enough samples are collected.
pub fn get_application_frame_rate(app: &Application) -> f64 {
    let guard = loop_state()
        .lock()
        .expect("application loop mutex poisoned");
    let Some(state) = guard.get(&app_key(app)) else {
        return 0.0;
    };
    if state.fps_buffer.len() < 2 {
        return 0.0;
    }
    let mut total = 0.0;
    let mut count = 0u32;
    for &d in &state.fps_buffer {
        if d > 0.0 {
            total += d;
            count += 1;
        }
    }
    if count == 0 {
        return 0.0;
    }
    let avg_delta = total / f64::from(count);
    if avg_delta > 0.0 {
        1000.0 / avg_delta
    } else {
        0.0
    }
}

/// Returns the main window: the explicit override set via
/// [`set_application_main_window`], else the first registered window, else
/// `None`.
pub fn get_application_main_window(app: &Application) -> Option<&ApplicationWindow> {
    if let Some(idx) = main_window_index(app) {
        return app.windows.get(idx);
    }
    app.windows.first()
}

/// Returns a snapshot of all registered windows. Allocates; prefer
/// [`for_each_application_window`] in hot paths.
pub fn get_application_windows(app: &Application) -> Vec<ApplicationWindow> {
    app.windows.clone()
}

/// Returns the active loop backend, installing the web-equivalent default the
/// first time it is needed.
pub fn get_loop_backend() -> Arc<dyn LoopBackend> {
    let mut guard = loop_backend().lock().expect("loop backend mutex poisoned");
    if guard.is_none() {
        *guard = Some(create_web_loop_backend());
    }
    Arc::clone(guard.as_ref().expect("backend initialized above"))
}

/// Returns whether the loop is currently running (and not paused). Consults the
/// loop's side table so a signal-driven pause (via
/// [`attach_application_lifecycle`]) is reflected without the listener touching
/// the entity; falls back to the entity's `is_running` mirror when there is no
/// loop state.
pub fn is_application_running(app: &Application) -> bool {
    let guard = loop_state()
        .lock()
        .expect("application loop mutex poisoned");
    match guard.get(&app_key(app)) {
        Some(state) => !state.paused,
        None => app.is_running,
    }
}

/// Pauses a running loop. A subsequent [`run_application_frame`] is a no-op
/// until [`resume_application_loop`]. No-op if already paused or not running.
pub fn pause_application_loop(app: &mut Application) {
    if !app.is_running {
        return;
    }
    app.is_running = false;
    if let Some(state) = loop_state()
        .lock()
        .expect("application loop mutex poisoned")
        .get_mut(&app_key(app))
    {
        state.paused = true;
    }
}

/// Registers `win` as a managed window on `app`. No-op if an equal window is
/// already registered.
pub fn register_application_window(app: &mut Application, win: &ApplicationWindow) {
    if app.windows.iter().any(|w| w == win) {
        return;
    }
    app.windows.push(win.clone());
}

/// Resumes a paused loop, re-seeding the delta clock so the gap spent paused is
/// not dumped into the next `on_update`. No-op if the loop was not paused.
pub fn resume_application_loop(app: &mut Application) {
    let mut guard = loop_state()
        .lock()
        .expect("application loop mutex poisoned");
    let Some(state) = guard.get_mut(&app_key(app)) else {
        return;
    };
    if !state.paused {
        return;
    }
    state.paused = false;
    state.last_time = None;
    state.fixed_accumulator = 0.0;
    state.frame_rate_accumulated = 0.0;
    drop(guard);
    app.is_running = true;
}

/// Sets the explicit main window. Registers `win` first if not already present.
pub fn set_application_main_window(app: &mut Application, win: &ApplicationWindow) {
    register_application_window(app, win);
    main_windows()
        .lock()
        .expect("main window mutex poisoned")
        .insert(app_key(app), win.clone());
}

/// Installs a host loop backend. Pass `None` to fall back to the web-equivalent
/// default.
pub fn set_loop_backend(backend: Option<Arc<dyn LoopBackend>>) {
    *loop_backend().lock().expect("loop backend mutex poisoned") = backend;
}

/// Starts the application main loop with `options`. Sets up the loop state and
/// marks the loop running; a native host then pumps frames via
/// [`run_application_frame`]. Calling again restarts the loop (idempotent
/// restart), resetting the clock and frame stats.
pub fn start_application_loop(app: &mut Application, options: &ApplicationLoopOptions) {
    let max_delta_time = options.max_delta_time.unwrap_or(DEFAULT_MAX_DELTA_TIME);
    let state = LoopState {
        options: *options,
        max_delta_time,
        last_time: None,
        fixed_accumulator: 0.0,
        frame_rate_accumulated: 0.0,
        fps_buffer: Vec::new(),
        fps_head: 0,
        paused: false,
    };
    loop_state()
        .lock()
        .expect("application loop mutex poisoned")
        .insert(app_key(app), state);
    app.is_running = true;
}

/// Drives one update+render tick for `app`, reading the frame delta from the
/// active loop backend's clock. A native host calls this once per frame. No-op
/// while paused. Mirrors the body of the TS `tick` closure.
pub fn run_application_frame(app: &mut Application) {
    if !app.is_running {
        return;
    }
    let now = get_loop_backend().now();
    let key = app_key(app);

    let computed = {
        let mut guard = loop_state()
            .lock()
            .expect("application loop mutex poisoned");
        let Some(state) = guard.get_mut(&key) else {
            return;
        };
        if state.paused {
            return;
        }
        let is_first_tick = state.last_time.is_none();
        let raw = match state.last_time {
            Some(prev) => now - prev,
            None => 0.0,
        };
        state.last_time = Some(now);

        // Frame-rate cap (foreground only; background throttle is a browser
        // visibility concern with no native substrate here).
        let frame_interval = match state.options.target_frame_rate {
            Some(r) if r > 0.0 => 1000.0 / r,
            _ => 0.0,
        };
        if !is_first_tick {
            state.frame_rate_accumulated += raw;
            if frame_interval > 0.0 && state.frame_rate_accumulated < frame_interval {
                return; // skip this tick; not enough time elapsed
            }
        }
        let delta = if frame_interval > 0.0 && !is_first_tick {
            state.frame_rate_accumulated
        } else {
            raw
        };
        state.frame_rate_accumulated = 0.0;

        let clamped = delta.min(state.max_delta_time);
        record_fps_sample(state, clamped);

        let fixed_time_step = state.options.fixed_time_step.unwrap_or(0.0);
        let max_updates = state
            .options
            .max_updates_per_frame
            .unwrap_or(DEFAULT_MAX_UPDATES_PER_FRAME);
        let mut fixed_steps = 0u32;
        let mut interpolation_alpha = 1.0;
        if fixed_time_step > 0.0 {
            state.fixed_accumulator += clamped;
            while state.fixed_accumulator >= fixed_time_step && fixed_steps < max_updates {
                state.fixed_accumulator -= fixed_time_step;
                fixed_steps += 1;
            }
            if fixed_steps >= max_updates {
                state.fixed_accumulator = 0.0;
            }
            interpolation_alpha = state.fixed_accumulator / fixed_time_step;
        }

        FrameComputation {
            clamped,
            fixed_time_step,
            fixed_steps,
            interpolation_alpha,
        }
    };

    app.delta_time = computed.clamped;
    app.elapsed_time += computed.clamped / 1000.0;
    app.frame_count += 1;

    if computed.fixed_time_step > 0.0 && app.on_fixed_update.is_some() {
        for _ in 0..computed.fixed_steps {
            emit_with_error_guard_f64(app, FrameSignal::FixedUpdate, computed.fixed_time_step);
        }
        app.interpolation_alpha = computed.interpolation_alpha;
    } else {
        app.interpolation_alpha = 1.0;
    }

    emit_with_error_guard_f64(app, FrameSignal::Update, computed.clamped);
    emit_with_error_guard_render(app);
}

/// Drives one update+render tick with an explicit delta (ms). Useful for
/// headless testing, fixed-step simulation, and non-pump hosts. Safe to call
/// while the loop is stopped.
pub fn step_application_loop(app: &mut Application, delta_time: f64) {
    let key = app_key(app);
    let clamped = {
        let mut guard = loop_state()
            .lock()
            .expect("application loop mutex poisoned");
        let max_delta = guard
            .get(&key)
            .map(|s| s.max_delta_time)
            .unwrap_or(DEFAULT_MAX_DELTA_TIME);
        let clamped = delta_time.min(max_delta);
        if let Some(state) = guard.get_mut(&key) {
            record_fps_sample(state, clamped);
        }
        clamped
    };
    app.delta_time = clamped;
    app.elapsed_time += clamped / 1000.0;
    app.frame_count += 1;
    app.interpolation_alpha = 1.0;
    emit_with_error_guard_f64(app, FrameSignal::Update, clamped);
    emit_with_error_guard_render(app);
}

/// Stops a running loop, clearing its delta clock and frame state.
pub fn stop_application_loop(app: &mut Application) {
    loop_state()
        .lock()
        .expect("application loop mutex poisoned")
        .remove(&app_key(app));
    app.is_running = false;
}

/// Removes `win` from `app`'s windows and clears any main-window override that
/// pointed at `win`.
pub fn unregister_application_window(app: &mut Application, win: &ApplicationWindow) {
    if let Some(idx) = app.windows.iter().position(|w| w == win) {
        app.windows.remove(idx);
    }
    let mut guard = main_windows().lock().expect("main window mutex poisoned");
    if guard.get(&app_key(app)) == Some(win) {
        guard.remove(&app_key(app));
    }
}

// ---------------------------------------------------------------------------
// Loop / lifecycle / main-window registries
// ---------------------------------------------------------------------------
//
// `Application` is a plain entity with no identity field, so per-application
// state is kept in side tables keyed by the entity's address (the convention
// `flighthq-lifecycle` uses for its subscription table).

struct LoopState {
    options: ApplicationLoopOptions,
    max_delta_time: f64,
    last_time: Option<f64>,
    fixed_accumulator: f64,
    frame_rate_accumulated: f64,
    fps_buffer: Vec<f64>,
    fps_head: usize,
    paused: bool,
}

struct FrameComputation {
    clamped: f64,
    fixed_time_step: f64,
    fixed_steps: u32,
    interpolation_alpha: f64,
}

enum FrameSignal {
    FixedUpdate,
    Update,
}

fn app_key(app: &Application) -> usize {
    app as *const Application as usize
}

fn emit_with_error_guard_f64(app: &Application, which: FrameSignal, value: f64) {
    let signal = match which {
        FrameSignal::FixedUpdate => app.on_fixed_update.as_ref(),
        FrameSignal::Update => Some(&app.on_update),
    };
    let Some(signal) = signal else { return };
    // The Rust signal emit cannot throw, so the on_error guard is a no-op here;
    // it exists to mirror the TS frame contract.
    emit_signal(signal, &value);
}

fn emit_with_error_guard_render(app: &Application) {
    emit_signal(&app.on_render, &());
}

fn lifecycle_key(app: &Application, win: &ApplicationWindow) -> (usize, usize) {
    (app_key(app), win as *const ApplicationWindow as usize)
}

fn loop_backend() -> &'static Mutex<Option<Arc<dyn LoopBackend>>> {
    static BACKEND: Mutex<Option<Arc<dyn LoopBackend>>> = Mutex::new(None);
    &BACKEND
}

fn loop_state() -> &'static Mutex<HashMap<usize, LoopState>> {
    static STATE: std::sync::OnceLock<Mutex<HashMap<usize, LoopState>>> =
        std::sync::OnceLock::new();
    STATE.get_or_init(|| Mutex::new(HashMap::new()))
}

// Lifecycle observers keyed by (window, event) slot; the boxed `Any` is the type-erased listener.
type LifecycleObservers = Mutex<HashMap<(usize, usize), Vec<Box<dyn std::any::Any + Send>>>>;

fn lifecycle_observers() -> &'static LifecycleObservers {
    static OBSERVERS: std::sync::OnceLock<LifecycleObservers> = std::sync::OnceLock::new();
    OBSERVERS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn main_window_index(app: &Application) -> Option<usize> {
    let guard = main_windows().lock().expect("main window mutex poisoned");
    let target = guard.get(&app_key(app))?;
    app.windows.iter().position(|w| w == target)
}

fn main_windows() -> &'static Mutex<HashMap<usize, ApplicationWindow>> {
    static MAIN: std::sync::OnceLock<Mutex<HashMap<usize, ApplicationWindow>>> =
        std::sync::OnceLock::new();
    MAIN.get_or_init(|| Mutex::new(HashMap::new()))
}

fn record_fps_sample(state: &mut LoopState, delta: f64) {
    if state.fps_buffer.len() < ROLLING_FPS_WINDOW {
        state.fps_buffer.push(delta);
    } else {
        state.fps_buffer[state.fps_head] = delta;
        state.fps_head = (state.fps_head + 1) % ROLLING_FPS_WINDOW;
    }
}

// -- Lifecycle pause/resume by app address (the connected closures hold the
// app's address, not a borrow, since the signal lives on the window). They only
// flip the loop's side-table `paused` flag — the authoritative run gate that
// `is_application_running` and `run_application_frame` consult. --

fn pause_application_loop_by_key(app_ptr: usize) {
    if let Some(state) = loop_state()
        .lock()
        .expect("application loop mutex poisoned")
        .get_mut(&app_ptr)
    {
        state.paused = true;
    }
}

fn resume_application_loop_by_key(app_ptr: usize) {
    if let Some(state) = loop_state()
        .lock()
        .expect("application loop mutex poisoned")
        .get_mut(&app_ptr)
        && state.paused
    {
        state.paused = false;
        state.last_time = None;
        state.fixed_accumulator = 0.0;
        state.frame_rate_accumulated = 0.0;
    }
}

struct InstantLoopBackend {
    origin: Instant,
}

impl LoopBackend for InstantLoopBackend {
    fn now(&self) -> f64 {
        self.origin.elapsed().as_secs_f64() * 1000.0
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::window::{create_application_window, create_application_window_signals};
    use flighthq_signals::{SignalConnectOptions, connect_signal, emit_signal};
    use serial_test::serial;
    use std::sync::atomic::{AtomicUsize, Ordering};

    // A loop backend whose clock is driven manually, mirroring the TS
    // `makeManualLoopBackend`.
    struct ManualLoopBackend {
        time: Mutex<f64>,
    }

    impl LoopBackend for ManualLoopBackend {
        fn now(&self) -> f64 {
            *self.time.lock().unwrap()
        }
    }

    fn install_manual_backend(initial: f64) -> Arc<ManualLoopBackend> {
        let backend = Arc::new(ManualLoopBackend {
            time: Mutex::new(initial),
        });
        set_loop_backend(Some(Arc::clone(&backend) as Arc<dyn LoopBackend>));
        backend
    }

    fn set_time(backend: &ManualLoopBackend, t: f64) {
        *backend.time.lock().unwrap() = t;
    }

    fn count_f64() -> (Arc<AtomicUsize>, Arc<dyn Fn(&f64) + Send + Sync>) {
        let count = Arc::new(AtomicUsize::new(0));
        let c = Arc::clone(&count);
        (
            count,
            Arc::new(move |_: &f64| {
                c.fetch_add(1, Ordering::SeqCst);
            }),
        )
    }

    fn count_unit() -> (Arc<AtomicUsize>, Arc<dyn Fn(&()) + Send + Sync>) {
        let count = Arc::new(AtomicUsize::new(0));
        let c = Arc::clone(&count);
        (
            count,
            Arc::new(move |_: &()| {
                c.fetch_add(1, Ordering::SeqCst);
            }),
        )
    }

    #[test]
    #[serial]
    fn attach_application_lifecycle_pauses_and_resumes() {
        let mut app = create_application();
        enable_application_lifecycle_signals(&mut app);
        let win = create_application_window();
        let signals = create_application_window_signals();
        attach_application_lifecycle(&app, &win, &signals);
        start_application_loop(&mut app, &ApplicationLoopOptions::default());
        assert!(is_application_running(&app));

        emit_signal(&signals.on_deactivate, &());
        assert!(!is_application_running(&app));

        emit_signal(&signals.on_activate, &());
        assert!(is_application_running(&app));

        detach_application_lifecycle(&app, &win);
        stop_application_loop(&mut app);
        dispose_application(&mut app);
    }

    #[test]
    #[serial]
    fn create_application_has_all_signals() {
        let app = create_application();
        let _ = &app.on_exit;
        let _ = &app.on_render;
        let _ = &app.on_update;
        assert!(app.on_activate.is_none());
        assert!(app.on_fixed_update.is_none());
        assert!(!app.is_running);
        assert!(app.windows.is_empty());
    }

    #[test]
    #[serial]
    fn enable_application_lifecycle_signals_is_idempotent() {
        let mut app = create_application();
        enable_application_lifecycle_signals(&mut app);
        assert!(app.on_activate.is_some());
        assert!(app.on_deactivate.is_some());
        assert!(app.on_error.is_some());
        assert!(app.on_fixed_update.is_some());
        // Second call must not replace existing signals.
        let activate_ptr = app.on_activate.as_ref().unwrap() as *const _;
        enable_application_lifecycle_signals(&mut app);
        assert_eq!(app.on_activate.as_ref().unwrap() as *const _, activate_ptr);
    }

    #[test]
    #[serial]
    fn for_each_application_window_visits_all() {
        let mut app = create_application();
        let a = create_application_window();
        let mut b = create_application_window();
        b.title = "second".into();
        register_application_window(&mut app, &a);
        register_application_window(&mut app, &b);
        let mut count = 0;
        for_each_application_window(&app, |_| count += 1);
        assert_eq!(count, 2);
    }

    #[test]
    #[serial]
    fn get_application_frame_rate_reports_after_samples() {
        let mut app = create_application();
        start_application_loop(&mut app, &ApplicationLoopOptions::default());
        assert_eq!(get_application_frame_rate(&app), 0.0);
        step_application_loop(&mut app, 16.0);
        step_application_loop(&mut app, 16.0);
        let fps = get_application_frame_rate(&app);
        assert!((fps - 62.5).abs() < 0.001, "fps was {fps}");
        stop_application_loop(&mut app);
    }

    #[test]
    #[serial]
    fn get_application_main_window_prefers_override() {
        let mut app = create_application();
        let a = create_application_window();
        let mut b = create_application_window();
        b.title = "main".into();
        register_application_window(&mut app, &a);
        set_application_main_window(&mut app, &b);
        assert_eq!(get_application_main_window(&app).unwrap().title, "main");
    }

    #[test]
    #[serial]
    fn get_application_main_window_defaults_to_first() {
        let mut app = create_application();
        assert!(get_application_main_window(&app).is_none());
        let a = create_application_window();
        register_application_window(&mut app, &a);
        assert!(get_application_main_window(&app).is_some());
    }

    #[test]
    #[serial]
    fn get_application_windows_snapshots() {
        let mut app = create_application();
        let a = create_application_window();
        register_application_window(&mut app, &a);
        let snap = get_application_windows(&app);
        assert_eq!(snap.len(), 1);
    }

    #[test]
    #[serial]
    fn get_loop_backend_installs_default() {
        set_loop_backend(None);
        let b = get_loop_backend();
        assert!(b.now() >= 0.0);
        set_loop_backend(None);
    }

    #[test]
    #[serial]
    fn is_application_running_tracks_state() {
        let mut app = create_application();
        assert!(!is_application_running(&app));
        start_application_loop(&mut app, &ApplicationLoopOptions::default());
        assert!(is_application_running(&app));
        stop_application_loop(&mut app);
        assert!(!is_application_running(&app));
    }

    #[test]
    #[serial]
    fn pause_and_resume_application_loop() {
        let backend = install_manual_backend(0.0);
        let mut app = create_application();
        let (updates, listener) = count_f64();
        let _g = connect_signal(&app.on_update, listener, SignalConnectOptions::default());
        start_application_loop(&mut app, &ApplicationLoopOptions::default());
        set_time(&backend, 16.0);
        run_application_frame(&mut app); // first tick, delta 0
        pause_application_loop(&mut app);
        assert!(!is_application_running(&app));
        set_time(&backend, 32.0);
        run_application_frame(&mut app); // no-op while paused
        let after_pause = updates.load(Ordering::SeqCst);
        resume_application_loop(&mut app);
        assert!(is_application_running(&app));
        set_time(&backend, 48.0);
        run_application_frame(&mut app);
        assert_eq!(updates.load(Ordering::SeqCst), after_pause + 1);
        stop_application_loop(&mut app);
        set_loop_backend(None);
    }

    #[test]
    #[serial]
    fn register_application_window_dedups() {
        let mut app = create_application();
        let a = create_application_window();
        register_application_window(&mut app, &a);
        register_application_window(&mut app, &a);
        assert_eq!(app.windows.len(), 1);
    }

    #[test]
    #[serial]
    fn run_application_frame_emits_update_then_render() {
        let backend = install_manual_backend(0.0);
        let mut app = create_application();
        let (renders, r) = count_unit();
        let (updates, u) = count_f64();
        let _g1 = connect_signal(&app.on_render, r, SignalConnectOptions::default());
        let _g2 = connect_signal(&app.on_update, u, SignalConnectOptions::default());
        start_application_loop(&mut app, &ApplicationLoopOptions::default());
        set_time(&backend, 16.0);
        run_application_frame(&mut app);
        set_time(&backend, 32.0);
        run_application_frame(&mut app);
        assert_eq!(renders.load(Ordering::SeqCst), 2);
        assert_eq!(updates.load(Ordering::SeqCst), 2);
        stop_application_loop(&mut app);
        set_loop_backend(None);
    }

    #[test]
    #[serial]
    fn run_application_frame_first_delta_is_zero() {
        let backend = install_manual_backend(100.0);
        let mut app = create_application();
        let first = Arc::new(Mutex::new(None::<f64>));
        let captured = Arc::clone(&first);
        let _g = connect_signal(
            &app.on_update,
            Arc::new(move |dt: &f64| {
                let mut slot = captured.lock().unwrap();
                if slot.is_none() {
                    *slot = Some(*dt);
                }
            }),
            SignalConnectOptions::default(),
        );
        start_application_loop(&mut app, &ApplicationLoopOptions::default());
        set_time(&backend, 116.0);
        run_application_frame(&mut app);
        assert_eq!(*first.lock().unwrap(), Some(0.0));
        stop_application_loop(&mut app);
        set_loop_backend(None);
    }

    #[test]
    #[serial]
    fn run_application_frame_clamps_delta() {
        let backend = install_manual_backend(0.0);
        let mut app = create_application();
        let last = Arc::new(Mutex::new(0.0f64));
        let captured = Arc::clone(&last);
        let _g = connect_signal(
            &app.on_update,
            Arc::new(move |dt: &f64| *captured.lock().unwrap() = *dt),
            SignalConnectOptions::default(),
        );
        start_application_loop(
            &mut app,
            &ApplicationLoopOptions {
                max_delta_time: Some(100.0),
                ..Default::default()
            },
        );
        run_application_frame(&mut app); // first tick, delta 0
        set_time(&backend, 5000.0);
        run_application_frame(&mut app);
        assert_eq!(*last.lock().unwrap(), 100.0);
        assert_eq!(app.delta_time, 100.0);
        stop_application_loop(&mut app);
        set_loop_backend(None);
    }

    #[test]
    #[serial]
    fn run_application_frame_runs_fixed_update() {
        let backend = install_manual_backend(0.0);
        let mut app = create_application();
        enable_application_lifecycle_signals(&mut app);
        let (fixed, listener) = count_f64();
        let _g = connect_signal(
            app.on_fixed_update.as_ref().unwrap(),
            listener,
            SignalConnectOptions::default(),
        );
        start_application_loop(
            &mut app,
            &ApplicationLoopOptions {
                fixed_time_step: Some(10.0),
                ..Default::default()
            },
        );
        run_application_frame(&mut app); // first tick delta 0
        set_time(&backend, 35.0);
        run_application_frame(&mut app); // 35ms -> 3 fixed steps
        assert_eq!(fixed.load(Ordering::SeqCst), 3);
        assert!((app.interpolation_alpha - 0.5).abs() < 1e-9);
        stop_application_loop(&mut app);
        set_loop_backend(None);
    }

    #[test]
    #[serial]
    fn set_loop_backend_overrides_clock() {
        let backend = install_manual_backend(42.0);
        assert_eq!(get_loop_backend().now(), 42.0);
        let _ = backend;
        set_loop_backend(None);
    }

    #[test]
    #[serial]
    fn step_application_loop_emits_with_explicit_delta() {
        let mut app = create_application();
        let (updates, u) = count_f64();
        let (renders, r) = count_unit();
        let _g1 = connect_signal(&app.on_update, u, SignalConnectOptions::default());
        let _g2 = connect_signal(&app.on_render, r, SignalConnectOptions::default());
        step_application_loop(&mut app, 16.0);
        assert_eq!(updates.load(Ordering::SeqCst), 1);
        assert_eq!(renders.load(Ordering::SeqCst), 1);
        assert_eq!(app.delta_time, 16.0);
        assert_eq!(app.frame_count, 1);
    }

    #[test]
    #[serial]
    fn unregister_application_window_clears_main() {
        let mut app = create_application();
        let a = create_application_window();
        set_application_main_window(&mut app, &a);
        unregister_application_window(&mut app, &a);
        assert!(app.windows.is_empty());
        assert!(get_application_main_window(&app).is_none());
    }

    #[test]
    #[serial]
    fn dispose_application_stops_loop() {
        let mut app = create_application();
        start_application_loop(&mut app, &ApplicationLoopOptions::default());
        dispose_application(&mut app);
        assert!(!is_application_running(&app));
    }
}
