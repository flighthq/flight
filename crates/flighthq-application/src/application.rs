//! Application lifecycle — main loop, update/render signals, and teardown.
//!
//! The TS reference drives the loop from the browser's `requestAnimationFrame`
//! and wires exit to `beforeunload`. Neither has a portable Rust equivalent at
//! this layer: on native the loop is driven by the host's event loop (winit/tao)
//! and exit is a host signal. So `start_application_loop` here runs a synchronous
//! driver that a host can pump, and exit wiring is delegated to a host backend in
//! a later wave. The frame contract is identical: each tick emits `on_update`
//! with the delta in milliseconds, then `on_render`.

use flighthq_signals::emit_signal;
use flighthq_types::Application;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Creates a new [`Application`] with all lifecycle signals initialized.
pub fn create_application() -> Application {
    Application::default()
}

/// Disposes all internal loop/exit state for `app`. After this call the loop is
/// stopped and the application should not be used again.
pub fn dispose_application(app: &mut Application) {
    stop_application_loop(app);
}

/// Drives the application loop for a single frame: emits `on_update` with the
/// elapsed delta (milliseconds since the previous tick, `0.0` on the first
/// tick), then `on_render`. A native host calls this once per frame from its
/// event loop. Mirrors the body of the TS `tick` closure.
pub fn run_application_frame(app: &Application) {
    let now = Instant::now();
    let delta = {
        let mut guard = loop_state()
            .lock()
            .expect("application loop mutex poisoned");
        // `None` value = active loop that has not ticked yet → delta 0, matching
        // the TS `lastTime < 0 ? 0 : …` first-frame rule.
        let last = guard.get(&app_key(app)).copied().flatten();
        guard.insert(app_key(app), Some(now));
        match last {
            Some(prev) => now.duration_since(prev).as_secs_f64() * 1000.0,
            None => 0.0,
        }
    };
    emit_signal(&app.on_update, &delta);
    emit_signal(&app.on_render, &());
}

/// Starts the application main loop. The TS reference schedules a
/// `requestAnimationFrame` chain; on native the loop is driven by the host
/// event loop, so this marks the loop active and resets the delta clock. The
/// host then calls [`run_application_frame`] each frame. Calling again resets
/// the clock, matching the TS "replaces a previous loop" behavior.
pub fn start_application_loop(app: &Application) {
    let mut guard = loop_state()
        .lock()
        .expect("application loop mutex poisoned");
    // `None` marks the loop active with no prior frame, so the next frame
    // reports delta 0 (mirrors the TS `lastTime = -1` reset).
    guard.insert(app_key(app), None);
}

/// Stops a running application loop. On native this lets the host stop pumping
/// [`run_application_frame`]; it clears the loop's delta clock.
pub fn stop_application_loop(app: &Application) {
    let mut guard = loop_state()
        .lock()
        .expect("application loop mutex poisoned");
    guard.remove(&app_key(app));
}

// ---------------------------------------------------------------------------
// Loop state registry
// ---------------------------------------------------------------------------
//
// `Application` is a plain entity with no identity field, so the loop's
// per-application clock is kept in a side table keyed by the entity's address
// (the same convention `flighthq-lifecycle` uses for its subscription table).
// The stored value is the timestamp of the previous frame.

fn app_key(app: &Application) -> usize {
    app as *const Application as usize
}

fn loop_state() -> &'static Mutex<HashMap<usize, Option<Instant>>> {
    LOOP_STATE.get_or_init(|| Mutex::new(HashMap::new()))
}

static LOOP_STATE: std::sync::OnceLock<Mutex<HashMap<usize, Option<Instant>>>> =
    std::sync::OnceLock::new();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_signals::{SignalConnectOptions, connect_signal};
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn create_application_has_all_signals() {
        let app = create_application();
        let _ = &app.on_exit;
        let _ = &app.on_render;
        let _ = &app.on_update;
    }

    #[test]
    fn run_application_frame_emits_update_then_render() {
        let app = create_application();
        let renders = Arc::new(AtomicUsize::new(0));
        let updates = Arc::new(AtomicUsize::new(0));
        let r = Arc::clone(&renders);
        let u = Arc::clone(&updates);
        let _g1 = connect_signal(
            &app.on_render,
            Arc::new(move |_: &()| {
                r.fetch_add(1, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        let _g2 = connect_signal(
            &app.on_update,
            Arc::new(move |_: &f64| {
                u.fetch_add(1, Ordering::SeqCst);
            }),
            SignalConnectOptions::default(),
        );
        start_application_loop(&app);
        run_application_frame(&app);
        run_application_frame(&app);
        assert_eq!(renders.load(Ordering::SeqCst), 2);
        assert_eq!(updates.load(Ordering::SeqCst), 2);
        stop_application_loop(&app);
    }

    #[test]
    fn run_application_frame_first_delta_is_zero() {
        let app = create_application();
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
        start_application_loop(&app);
        run_application_frame(&app);
        assert_eq!(*first.lock().unwrap(), Some(0.0));
        stop_application_loop(&app);
    }

    #[test]
    fn dispose_application_stops_loop() {
        let mut app = create_application();
        start_application_loop(&app);
        dispose_application(&mut app);
        // After dispose the next frame restarts the clock at delta 0.
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
        run_application_frame(&app);
        assert_eq!(*first.lock().unwrap(), Some(0.0));
    }
}
