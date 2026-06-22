//! Power free functions and backend management.

use std::sync::{Arc, Mutex};

use flighthq_signals::emit_signal;
use flighthq_types::{Power, PowerBackend, PowerStatus};

// ---------------------------------------------------------------------------
// Default stub backend
// ---------------------------------------------------------------------------

struct StubPowerBackend;

impl PowerBackend for StubPowerBackend {
    fn get_status<'a>(&self, out: &'a mut PowerStatus) -> &'a mut PowerStatus {
        out.battery_level = -1.0;
        out.is_charging = false;
        out.is_low_power = false;
        out
    }

    fn subscribe(&self, _listener: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn subscribe_suspend(
        &self,
        _listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn subscribe_resume(
        &self,
        _listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn set_keep_awake(&self, _enabled: bool) -> bool {
        false
    }
}

// ---------------------------------------------------------------------------
// Backend registry
// ---------------------------------------------------------------------------

/// Returns the active power backend. Falls back to the no-op stub when no
/// backend has been installed.
pub fn get_power_backend() -> Arc<dyn PowerBackend> {
    let guard = BACKEND.lock().expect("power backend mutex poisoned");
    match guard.as_ref() {
        Some(b) => Arc::clone(b),
        None => Arc::new(StubPowerBackend),
    }
}

/// Installs a native host power backend. Pass `None` to fall back to the
/// built-in stub.
pub fn set_power_backend(backend: Option<Arc<dyn PowerBackend>>) {
    let mut guard = BACKEND.lock().expect("power backend mutex poisoned");
    *guard = backend;
}

// ---------------------------------------------------------------------------
// Entity construction
// ---------------------------------------------------------------------------

/// Allocates a [`Power`] event entity with inert signals. Call
/// [`attach_power`] to begin delivery.
pub fn create_power() -> Power {
    Power::default()
}

/// Allocates a zeroed [`PowerStatus`], suitable as the `out` for
/// [`get_power_status`].
pub fn create_power_status() -> PowerStatus {
    PowerStatus {
        battery_level: -1.0,
        is_charging: false,
        is_low_power: false,
    }
}

// ---------------------------------------------------------------------------
// Public free functions
// ---------------------------------------------------------------------------

/// Begins delivering power changes to `power`'s signals by subscribing to the
/// active backend. On each change it reads a fresh status, emits `on_change`,
/// and emits `on_charging` / `on_discharging` on charging transitions; suspend
/// and resume are delivered via `on_suspend` / `on_resume`. Idempotent: a prior
/// subscription is torn down first. Pair with [`detach_power`] or
/// [`dispose_power`].
pub fn attach_power(power: &Power) {
    detach_power(power);
    let backend = get_power_backend();
    let mut scratch = create_power_status();
    backend.get_status(&mut scratch);
    let was_charging = Arc::new(Mutex::new(scratch.is_charging));

    let change_backend = Arc::clone(&backend);
    let on_change = power.on_change.clone();
    let on_charging = power.on_charging.clone();
    let on_discharging = power.on_discharging.clone();
    let was_charging_clone = Arc::clone(&was_charging);

    let unsubscribe_change = backend.subscribe(Box::new(move || {
        let mut status = PowerStatus::default();
        change_backend.get_status(&mut status);
        let prev = {
            let mut guard = was_charging_clone.lock().unwrap();
            let prev = *guard;
            *guard = status.is_charging;
            prev
        };
        emit_signal(&on_change, &status);
        if status.is_charging && !prev {
            emit_signal(&on_charging, &());
        } else if !status.is_charging && prev {
            emit_signal(&on_discharging, &());
        }
    }));

    let on_suspend = power.on_suspend.clone();
    let unsubscribe_suspend =
        backend.subscribe_suspend(Box::new(move || emit_signal(&on_suspend, &())));

    let on_resume = power.on_resume.clone();
    let unsubscribe_resume =
        backend.subscribe_resume(Box::new(move || emit_signal(&on_resume, &())));

    let unsubscribe: Box<dyn Fn() + Send + Sync> = Box::new(move || {
        unsubscribe_change();
        unsubscribe_suspend();
        unsubscribe_resume();
    });

    let mut guard = SUBSCRIPTIONS
        .lock()
        .expect("power subscriptions mutex poisoned");
    guard.push((power as *const Power as usize, unsubscribe));
}

/// Stops delivery to `power` and forgets its subscription. Safe to call when
/// not attached.
pub fn detach_power(power: &Power) {
    let key = power as *const Power as usize;
    let mut guard = SUBSCRIPTIONS
        .lock()
        .expect("power subscriptions mutex poisoned");
    if let Some(pos) = guard.iter().position(|(k, _)| *k == key) {
        let (_, unsub) = guard.remove(pos);
        unsub();
    }
}

/// Releases `power` for garbage collection by detaching its backend
/// subscription. The signals remain plain GC-managed memory afterward.
pub fn dispose_power(power: &Power) {
    detach_power(power);
}

/// Fills `out` with the current power snapshot and returns it.
pub fn get_power_status<'a>(out: &'a mut PowerStatus) -> &'a mut PowerStatus {
    get_power_backend().get_status(out)
}

/// Requests or releases a screen keep-awake lock; returns whether the request
/// was honored.
pub fn set_power_keep_awake(enabled: bool) -> bool {
    get_power_backend().set_keep_awake(enabled)
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

static BACKEND: Mutex<Option<Arc<dyn PowerBackend>>> = Mutex::new(None);

// Subscription list: (Power address, unsubscribe fn).
static SUBSCRIPTIONS: Mutex<Vec<(usize, Box<dyn Fn() + Send + Sync>)>> = Mutex::new(Vec::new());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    // --- create_power ---

    #[test]
    fn create_power_returns_default_entity() {
        let _power = create_power();
    }

    // --- create_power_status ---

    #[test]
    fn create_power_status_returns_zeroed_status() {
        let status = create_power_status();
        assert_eq!(status.battery_level, -1.0);
        assert!(!status.is_charging);
        assert!(!status.is_low_power);
    }

    // --- get_power_backend ---

    #[test]
    #[serial]
    fn get_power_backend_returns_stub_when_unset() {
        set_power_backend(None);
        let _b = get_power_backend();
    }

    // --- get_power_status ---

    #[test]
    #[serial]
    fn get_power_status_fills_out_parameter() {
        set_power_backend(None);
        let mut out = create_power_status();
        out.battery_level = 0.5;
        get_power_status(&mut out);
        // Stub reports battery_level=-1.
        assert_eq!(out.battery_level, -1.0);
    }

    // --- set_power_backend ---

    #[test]
    #[serial]
    fn set_power_backend_installs_backend() {
        struct FullBattery;
        impl PowerBackend for FullBattery {
            fn get_status<'a>(&self, out: &'a mut PowerStatus) -> &'a mut PowerStatus {
                out.battery_level = 1.0;
                out.is_charging = true;
                out
            }
            fn subscribe(&self, _l: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync> {
                Box::new(|| {})
            }
            fn subscribe_suspend(
                &self,
                _l: Box<dyn Fn() + Send + Sync>,
            ) -> Box<dyn Fn() + Send + Sync> {
                Box::new(|| {})
            }
            fn subscribe_resume(
                &self,
                _l: Box<dyn Fn() + Send + Sync>,
            ) -> Box<dyn Fn() + Send + Sync> {
                Box::new(|| {})
            }
            fn set_keep_awake(&self, _enabled: bool) -> bool {
                true
            }
        }
        set_power_backend(Some(Arc::new(FullBattery)));
        let mut out = create_power_status();
        get_power_status(&mut out);
        assert_eq!(out.battery_level, 1.0);
        assert!(out.is_charging);
        set_power_backend(None);
    }

    // --- set_power_keep_awake ---

    #[test]
    #[serial]
    fn set_power_keep_awake_returns_false_with_stub() {
        set_power_backend(None);
        assert!(!set_power_keep_awake(true));
    }
}
