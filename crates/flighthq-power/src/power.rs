//! Power free functions and backend management.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use flighthq_signals::emit_signal;
use flighthq_types::{
    Power, PowerBackend, PowerBatteryHealth, PowerBatteryHealthState, PowerIdleState,
    PowerKeepAwakeMode, PowerStatus, PowerThermalState,
};

// ---------------------------------------------------------------------------
// Default stub backend
// ---------------------------------------------------------------------------

// Native default backend. Reports no battery (battery_level = -1) and inert
// subscriptions; a native host installs its own via `set_power_backend`. This
// is the in-crate analogue of TS's `createWebPowerBackend`, which is browser-
// bound and lives in `host-web`.
struct StubPowerBackend;

impl PowerBackend for StubPowerBackend {
    fn get_status<'a>(&self, out: &'a mut PowerStatus) -> &'a mut PowerStatus {
        out.battery_level = -1.0;
        out.charging_time = -1.0;
        out.discharging_time = -1.0;
        out.is_battery_low = false;
        out.is_charging = false;
        out.is_low_power = false;
        out.is_on_battery = false;
        out.thermal_state = PowerThermalState::Unknown;
        out
    }

    fn get_battery_health<'a>(
        &self,
        _out: &'a mut PowerBatteryHealth,
    ) -> Option<&'a mut PowerBatteryHealth> {
        None
    }

    fn get_system_idle_state(&self, _threshold_seconds: f32) -> PowerIdleState {
        PowerIdleState::Unknown
    }

    fn get_system_idle_time(&self) -> f32 {
        -1.0
    }

    fn is_keep_awake_active(&self) -> bool {
        false
    }

    fn subscribe(&self, _listener: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn subscribe_lock_screen(
        &self,
        _listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn subscribe_low_power_mode_change(
        &self,
        _listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
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

    fn subscribe_thermal_state_change(
        &self,
        _listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn subscribe_unlock_screen(
        &self,
        _listener: Box<dyn Fn() + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn set_keep_awake(&self, _enabled: bool, _mode: PowerKeepAwakeMode) -> bool {
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

/// Allocates a zeroed [`PowerBatteryHealth`] with sentinel values, suitable as
/// the `out` for [`get_power_battery_health`].
pub fn create_power_battery_health() -> PowerBatteryHealth {
    PowerBatteryHealth {
        capacity_wear_level: -1.0,
        cycle_count: -1,
        health_state: PowerBatteryHealthState::Unknown,
        temperature_celsius: -1.0,
        voltage: -1.0,
    }
}

/// Allocates a zeroed [`PowerStatus`] with sentinel values, suitable as the
/// `out` for [`get_power_status`].
pub fn create_power_status() -> PowerStatus {
    PowerStatus {
        battery_level: -1.0,
        charging_time: -1.0,
        discharging_time: -1.0,
        is_battery_low: false,
        is_charging: false,
        is_low_power: false,
        is_on_battery: false,
        thermal_state: PowerThermalState::Unknown,
    }
}

// ---------------------------------------------------------------------------
// Public free functions
// ---------------------------------------------------------------------------

/// Begins delivering power changes to `power`'s signals by subscribing to the
/// active backend. On each change it reads a fresh status, emits `on_change`,
/// and emits `on_charging` / `on_discharging` on charging transitions; lock,
/// unlock, low-power-mode, suspend, resume, and thermal changes are delivered
/// via their respective signals.
///
/// For `on_idle_state_change`, a polling loop is started at the rate set by
/// [`set_power_idle_polling_interval_ms`] (default 5000ms); the poll only emits
/// when at least one listener is connected. `idle_threshold_seconds` (default
/// via [`attach_power`]; the TS default is 60) controls what the backend
/// reports as idle vs active. Idempotent: a prior subscription is torn down
/// first. Pair with [`detach_power`] or [`dispose_power`].
pub fn attach_power(power: &Power, idle_threshold_seconds: f32) {
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

    let on_lock_screen = power.on_lock_screen.clone();
    let unsubscribe_lock_screen =
        backend.subscribe_lock_screen(Box::new(move || emit_signal(&on_lock_screen, &())));

    let on_low_power_mode_change = power.on_low_power_mode_change.clone();
    let unsubscribe_low_power_mode_change =
        backend.subscribe_low_power_mode_change(Box::new(move || {
            emit_signal(&on_low_power_mode_change, &())
        }));

    let on_resume = power.on_resume.clone();
    let unsubscribe_resume =
        backend.subscribe_resume(Box::new(move || emit_signal(&on_resume, &())));

    let on_suspend = power.on_suspend.clone();
    let unsubscribe_suspend =
        backend.subscribe_suspend(Box::new(move || emit_signal(&on_suspend, &())));

    let on_thermal_state_change = power.on_thermal_state_change.clone();
    let unsubscribe_thermal_state_change =
        backend.subscribe_thermal_state_change(Box::new(move || {
            emit_signal(&on_thermal_state_change, &())
        }));

    let on_unlock_screen = power.on_unlock_screen.clone();
    let unsubscribe_unlock_screen =
        backend.subscribe_unlock_screen(Box::new(move || emit_signal(&on_unlock_screen, &())));

    // Idle state polling. A background thread polls at the configured interval
    // and emits `on_idle_state_change` on transitions, guarded so it only emits
    // when at least one slot is connected (mirroring the TS setInterval poll).
    // The TS `setInterval` is the browser event loop; here a thread plays that
    // role. The interval is captured once at attach, matching TS.
    let idle_backend = Arc::clone(&backend);
    let on_idle_state_change = power.on_idle_state_change.clone();
    let interval_ms = get_power_idle_polling_interval_ms();
    let idle_stop = Arc::new(AtomicBool::new(false));
    let idle_stop_thread = Arc::clone(&idle_stop);
    let idle_handle = thread::spawn(move || {
        let mut last_state = idle_backend.get_system_idle_state(idle_threshold_seconds);
        while !idle_stop_thread.load(Ordering::Acquire) {
            thread::sleep(Duration::from_millis(interval_ms));
            if idle_stop_thread.load(Ordering::Acquire) {
                break;
            }
            if !on_idle_state_change.has_listeners() {
                continue;
            }
            let current = idle_backend.get_system_idle_state(idle_threshold_seconds);
            if current != last_state {
                last_state = current;
                emit_signal(&on_idle_state_change, &());
            }
        }
    });

    let idle_join = Mutex::new(Some(idle_handle));
    let unsubscribe: Box<dyn Fn() + Send + Sync> = Box::new(move || {
        unsubscribe_change();
        unsubscribe_lock_screen();
        unsubscribe_low_power_mode_change();
        unsubscribe_resume();
        unsubscribe_suspend();
        unsubscribe_thermal_state_change();
        unsubscribe_unlock_screen();
        idle_stop.store(true, Ordering::Release);
        if let Some(handle) = idle_join.lock().unwrap().take() {
            let _ = handle.join();
        }
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
    let unsub = {
        let mut guard = SUBSCRIPTIONS
            .lock()
            .expect("power subscriptions mutex poisoned");
        guard
            .iter()
            .position(|(k, _)| *k == key)
            .map(|pos| guard.remove(pos).1)
    };
    // Run the unsubscribe (which joins the idle thread) without holding the
    // subscriptions lock, so the polling thread can finish cleanly.
    if let Some(unsub) = unsub {
        unsub();
    }
}

/// Releases `power` for garbage collection by detaching its backend
/// subscription. The signals remain plain GC-managed memory afterward.
pub fn dispose_power(power: &Power) {
    detach_power(power);
}

/// Returns the battery health detail from the active backend, writing into
/// `out` and returning it, or `None` when the backend does not report health.
pub fn get_power_battery_health(out: &mut PowerBatteryHealth) -> Option<&mut PowerBatteryHealth> {
    get_power_backend().get_battery_health(out)
}

/// Returns the current idle-state polling interval in milliseconds (default
/// 5000).
pub fn get_power_idle_polling_interval_ms() -> u64 {
    IDLE_POLLING_INTERVAL_MS.load(Ordering::Acquire)
}

/// Fills `out` with the current power snapshot and returns it.
pub fn get_power_status(out: &mut PowerStatus) -> &mut PowerStatus {
    get_power_backend().get_status(out)
}

/// Returns the current system idle state at the given threshold in seconds.
pub fn get_power_system_idle_state(threshold_seconds: f32) -> PowerIdleState {
    get_power_backend().get_system_idle_state(threshold_seconds)
}

/// Returns the elapsed seconds since the last user input event, or `-1` when
/// unsupported.
pub fn get_power_system_idle_time() -> f32 {
    get_power_backend().get_system_idle_time()
}

/// Returns the current thermal state from the active backend.
pub fn get_power_thermal_state() -> PowerThermalState {
    let mut scratch = create_power_status();
    get_power_backend().get_status(&mut scratch);
    scratch.thermal_state
}

/// Returns true when a keep-awake lock is currently held by the active backend.
pub fn has_power_keep_awake() -> bool {
    get_power_backend().is_keep_awake_active()
}

/// Sets the interval at which [`attach_power`] polls the backend for idle state
/// changes. The default is 5000ms; lower it for more responsive idle detection
/// at the cost of more frequent backend calls. Only affects [`Power`] entities
/// attached after this call.
pub fn set_power_idle_polling_interval_ms(interval_ms: u64) {
    IDLE_POLLING_INTERVAL_MS.store(interval_ms, Ordering::Release);
}

/// Requests or releases a keep-awake lock for the given mode; returns whether
/// the request was honored.
pub fn set_power_keep_awake(enabled: bool, mode: PowerKeepAwakeMode) -> bool {
    get_power_backend().set_keep_awake(enabled, mode)
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

static BACKEND: Mutex<Option<Arc<dyn PowerBackend>>> = Mutex::new(None);

static IDLE_POLLING_INTERVAL_MS: AtomicU64 = AtomicU64::new(5000);

// Subscription list: (Power address, unsubscribe fn).
static SUBSCRIPTIONS: Mutex<Vec<(usize, Box<dyn Fn() + Send + Sync>)>> = Mutex::new(Vec::new());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_signals::connect_signal;
    use serial_test::serial;
    use std::sync::atomic::AtomicUsize;

    // Connects a bare-notification listener and returns its guard. The guard
    // must be kept alive — dropping it disconnects the slot.
    fn connect_bare(
        signal: &flighthq_signals::Signal<()>,
        f: impl Fn() + Send + Sync + 'static,
    ) -> flighthq_signals::SlotGuard<()> {
        connect_signal(signal, Arc::new(move |_: &()| f()), Default::default())
    }

    // A configurable test backend mirroring the TS `fakeBackend`.
    struct FakeBackend {
        charging: bool,
        keep_awake: Mutex<bool>,
        idle_state: Mutex<PowerIdleState>,
        lock_listener: Mutex<Option<Box<dyn Fn() + Send + Sync>>>,
        low_power_listener: Mutex<Option<Box<dyn Fn() + Send + Sync>>>,
        thermal_listener: Mutex<Option<Box<dyn Fn() + Send + Sync>>>,
        unlock_listener: Mutex<Option<Box<dyn Fn() + Send + Sync>>>,
        idle_poll_count: AtomicUsize,
    }

    impl FakeBackend {
        fn new() -> Arc<Self> {
            Arc::new(Self {
                charging: false,
                keep_awake: Mutex::new(false),
                idle_state: Mutex::new(PowerIdleState::Active),
                lock_listener: Mutex::new(None),
                low_power_listener: Mutex::new(None),
                thermal_listener: Mutex::new(None),
                unlock_listener: Mutex::new(None),
                idle_poll_count: AtomicUsize::new(0),
            })
        }
    }

    impl PowerBackend for FakeBackend {
        fn get_status<'a>(&self, out: &'a mut PowerStatus) -> &'a mut PowerStatus {
            out.battery_level = 0.5;
            out.charging_time = -1.0;
            out.discharging_time = 3600.0;
            out.is_battery_low = false;
            out.is_charging = self.charging;
            out.is_low_power = false;
            out.is_on_battery = !self.charging;
            out.thermal_state = PowerThermalState::Nominal;
            out
        }
        fn get_battery_health<'a>(
            &self,
            _out: &'a mut PowerBatteryHealth,
        ) -> Option<&'a mut PowerBatteryHealth> {
            None
        }
        fn get_system_idle_state(&self, _threshold_seconds: f32) -> PowerIdleState {
            self.idle_poll_count.fetch_add(1, Ordering::AcqRel);
            *self.idle_state.lock().unwrap()
        }
        fn get_system_idle_time(&self) -> f32 {
            42.0
        }
        fn is_keep_awake_active(&self) -> bool {
            *self.keep_awake.lock().unwrap()
        }
        fn subscribe(&self, _l: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync> {
            Box::new(|| {})
        }
        fn subscribe_lock_screen(
            &self,
            l: Box<dyn Fn() + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            *self.lock_listener.lock().unwrap() = Some(l);
            Box::new(|| {})
        }
        fn subscribe_low_power_mode_change(
            &self,
            l: Box<dyn Fn() + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            *self.low_power_listener.lock().unwrap() = Some(l);
            Box::new(|| {})
        }
        fn subscribe_suspend(
            &self,
            _l: Box<dyn Fn() + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            Box::new(|| {})
        }
        fn subscribe_resume(&self, _l: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync> {
            Box::new(|| {})
        }
        fn subscribe_thermal_state_change(
            &self,
            l: Box<dyn Fn() + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            *self.thermal_listener.lock().unwrap() = Some(l);
            Box::new(|| {})
        }
        fn subscribe_unlock_screen(
            &self,
            l: Box<dyn Fn() + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            *self.unlock_listener.lock().unwrap() = Some(l);
            Box::new(|| {})
        }
        fn set_keep_awake(&self, enabled: bool, _mode: PowerKeepAwakeMode) -> bool {
            *self.keep_awake.lock().unwrap() = enabled;
            true
        }
    }

    // --- attach_power ---

    #[test]
    #[serial]
    fn attach_power_emits_lock_and_unlock() {
        let backend = FakeBackend::new();
        set_power_backend(Some(backend.clone()));
        let power = create_power();
        let locks = Arc::new(AtomicUsize::new(0));
        let unlocks = Arc::new(AtomicUsize::new(0));
        let l = locks.clone();
        let u = unlocks.clone();
        let _g1 = connect_bare(&power.on_lock_screen, move || {
            l.fetch_add(1, Ordering::AcqRel);
        });
        let _g2 = connect_bare(&power.on_unlock_screen, move || {
            u.fetch_add(1, Ordering::AcqRel);
        });
        attach_power(&power, 30.0);
        (backend.lock_listener.lock().unwrap().as_ref().unwrap())();
        (backend.unlock_listener.lock().unwrap().as_ref().unwrap())();
        assert_eq!(locks.load(Ordering::Acquire), 1);
        assert_eq!(unlocks.load(Ordering::Acquire), 1);
        detach_power(&power);
        set_power_backend(None);
    }

    #[test]
    #[serial]
    fn attach_power_emits_low_power_and_thermal_changes() {
        let backend = FakeBackend::new();
        set_power_backend(Some(backend.clone()));
        let power = create_power();
        let low = Arc::new(AtomicUsize::new(0));
        let therm = Arc::new(AtomicUsize::new(0));
        let lc = low.clone();
        let tc = therm.clone();
        let _g1 = connect_bare(&power.on_low_power_mode_change, move || {
            lc.fetch_add(1, Ordering::AcqRel);
        });
        let _g2 = connect_bare(&power.on_thermal_state_change, move || {
            tc.fetch_add(1, Ordering::AcqRel);
        });
        attach_power(&power, 30.0);
        (backend.low_power_listener.lock().unwrap().as_ref().unwrap())();
        (backend.thermal_listener.lock().unwrap().as_ref().unwrap())();
        assert_eq!(low.load(Ordering::Acquire), 1);
        assert_eq!(therm.load(Ordering::Acquire), 1);
        detach_power(&power);
        set_power_backend(None);
    }

    #[test]
    #[serial]
    fn attach_power_polls_idle_state_when_listener_connected() {
        let backend = FakeBackend::new();
        set_power_backend(Some(backend.clone()));
        let power = create_power();
        let changes = Arc::new(AtomicUsize::new(0));
        let c = changes.clone();
        let _g = connect_bare(&power.on_idle_state_change, move || {
            c.fetch_add(1, Ordering::AcqRel);
        });
        set_power_idle_polling_interval_ms(20);
        attach_power(&power, 30.0);
        // Let the polling thread capture its baseline state (Active) before the
        // transition, so the Active -> Idle change is observed by a poll tick.
        thread::sleep(Duration::from_millis(60));
        *backend.idle_state.lock().unwrap() = PowerIdleState::Idle;
        thread::sleep(Duration::from_millis(120));
        assert!(changes.load(Ordering::Acquire) >= 1);
        dispose_power(&power);
        set_power_idle_polling_interval_ms(5000);
        set_power_backend(None);
    }

    #[test]
    #[serial]
    fn attach_power_stops_polling_after_detach() {
        let backend = FakeBackend::new();
        set_power_backend(Some(backend.clone()));
        let power = create_power();
        let _g = connect_bare(&power.on_idle_state_change, || {});
        set_power_idle_polling_interval_ms(20);
        attach_power(&power, 30.0);
        thread::sleep(Duration::from_millis(60));
        detach_power(&power);
        let count_after_detach = backend.idle_poll_count.load(Ordering::Acquire);
        thread::sleep(Duration::from_millis(80));
        assert_eq!(
            backend.idle_poll_count.load(Ordering::Acquire),
            count_after_detach
        );
        set_power_idle_polling_interval_ms(5000);
        set_power_backend(None);
    }

    // --- create_power ---

    #[test]
    fn create_power_returns_default_entity() {
        let _power = create_power();
    }

    // --- create_power_battery_health ---

    #[test]
    fn create_power_battery_health_returns_sentinels() {
        let health = create_power_battery_health();
        assert_eq!(health.capacity_wear_level, -1.0);
        assert_eq!(health.cycle_count, -1);
        assert_eq!(health.health_state, PowerBatteryHealthState::Unknown);
        assert_eq!(health.temperature_celsius, -1.0);
        assert_eq!(health.voltage, -1.0);
    }

    // --- create_power_status ---

    #[test]
    fn create_power_status_returns_zeroed_status() {
        let status = create_power_status();
        assert_eq!(status.battery_level, -1.0);
        assert_eq!(status.charging_time, -1.0);
        assert_eq!(status.discharging_time, -1.0);
        assert!(!status.is_battery_low);
        assert!(!status.is_charging);
        assert!(!status.is_low_power);
        assert!(!status.is_on_battery);
        assert_eq!(status.thermal_state, PowerThermalState::Unknown);
    }

    // --- detach_power ---

    #[test]
    fn detach_power_is_safe_when_unattached() {
        let power = create_power();
        detach_power(&power);
    }

    // --- dispose_power ---

    #[test]
    fn dispose_power_is_idempotent() {
        let power = create_power();
        dispose_power(&power);
        dispose_power(&power);
    }

    // --- get_power_backend ---

    #[test]
    #[serial]
    fn get_power_backend_returns_stub_when_unset() {
        set_power_backend(None);
        let _b = get_power_backend();
    }

    // --- get_power_battery_health ---

    #[test]
    #[serial]
    fn get_power_battery_health_returns_none_from_stub() {
        set_power_backend(None);
        let mut out = create_power_battery_health();
        assert!(get_power_battery_health(&mut out).is_none());
    }

    #[test]
    #[serial]
    fn get_power_battery_health_returns_out_when_supported() {
        struct HealthBackend;
        impl PowerBackend for HealthBackend {
            fn get_status<'a>(&self, out: &'a mut PowerStatus) -> &'a mut PowerStatus {
                out
            }
            fn get_battery_health<'a>(
                &self,
                out: &'a mut PowerBatteryHealth,
            ) -> Option<&'a mut PowerBatteryHealth> {
                out.capacity_wear_level = 0.9;
                out.cycle_count = 120;
                out.health_state = PowerBatteryHealthState::Good;
                out.temperature_celsius = 30.0;
                out.voltage = 12.1;
                Some(out)
            }
            fn get_system_idle_state(&self, _t: f32) -> PowerIdleState {
                PowerIdleState::Unknown
            }
            fn get_system_idle_time(&self) -> f32 {
                -1.0
            }
            fn is_keep_awake_active(&self) -> bool {
                false
            }
            fn subscribe(&self, _l: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync> {
                Box::new(|| {})
            }
            fn subscribe_lock_screen(
                &self,
                _l: Box<dyn Fn() + Send + Sync>,
            ) -> Box<dyn Fn() + Send + Sync> {
                Box::new(|| {})
            }
            fn subscribe_low_power_mode_change(
                &self,
                _l: Box<dyn Fn() + Send + Sync>,
            ) -> Box<dyn Fn() + Send + Sync> {
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
            fn subscribe_thermal_state_change(
                &self,
                _l: Box<dyn Fn() + Send + Sync>,
            ) -> Box<dyn Fn() + Send + Sync> {
                Box::new(|| {})
            }
            fn subscribe_unlock_screen(
                &self,
                _l: Box<dyn Fn() + Send + Sync>,
            ) -> Box<dyn Fn() + Send + Sync> {
                Box::new(|| {})
            }
            fn set_keep_awake(&self, _enabled: bool, _mode: PowerKeepAwakeMode) -> bool {
                false
            }
        }
        set_power_backend(Some(Arc::new(HealthBackend)));
        let mut out = create_power_battery_health();
        assert!(get_power_battery_health(&mut out).is_some());
        assert_eq!(out.health_state, PowerBatteryHealthState::Good);
        assert_eq!(out.cycle_count, 120);
        set_power_backend(None);
    }

    // --- get_power_idle_polling_interval_ms ---

    #[test]
    #[serial]
    fn get_power_idle_polling_interval_ms_returns_default() {
        set_power_idle_polling_interval_ms(5000);
        assert_eq!(get_power_idle_polling_interval_ms(), 5000);
    }

    // --- get_power_status ---

    #[test]
    #[serial]
    fn get_power_status_fills_out_parameter() {
        set_power_backend(None);
        let mut out = create_power_status();
        out.battery_level = 0.5;
        get_power_status(&mut out);
        // Stub reports battery_level = -1.
        assert_eq!(out.battery_level, -1.0);
    }

    #[test]
    #[serial]
    fn get_power_status_fills_new_fields_from_backend() {
        set_power_backend(Some(FakeBackend::new()));
        let mut out = create_power_status();
        get_power_status(&mut out);
        assert_eq!(out.discharging_time, 3600.0);
        assert!(out.is_on_battery);
        assert_eq!(out.thermal_state, PowerThermalState::Nominal);
        set_power_backend(None);
    }

    // --- get_power_system_idle_state ---

    #[test]
    #[serial]
    fn get_power_system_idle_state_delegates_to_backend() {
        set_power_backend(Some(FakeBackend::new()));
        assert_eq!(get_power_system_idle_state(30.0), PowerIdleState::Active);
        set_power_backend(None);
    }

    // --- get_power_system_idle_time ---

    #[test]
    #[serial]
    fn get_power_system_idle_time_delegates_to_backend() {
        set_power_backend(Some(FakeBackend::new()));
        assert_eq!(get_power_system_idle_time(), 42.0);
        set_power_backend(None);
    }

    // --- get_power_thermal_state ---

    #[test]
    #[serial]
    fn get_power_thermal_state_returns_backend_state() {
        set_power_backend(Some(FakeBackend::new()));
        assert_eq!(get_power_thermal_state(), PowerThermalState::Nominal);
        set_power_backend(None);
    }

    // --- has_power_keep_awake ---

    #[test]
    #[serial]
    fn has_power_keep_awake_delegates_to_backend() {
        let backend = FakeBackend::new();
        set_power_backend(Some(backend.clone()));
        *backend.keep_awake.lock().unwrap() = false;
        assert!(!has_power_keep_awake());
        *backend.keep_awake.lock().unwrap() = true;
        assert!(has_power_keep_awake());
        set_power_backend(None);
    }

    #[test]
    #[serial]
    fn has_power_keep_awake_false_with_stub() {
        set_power_backend(None);
        assert!(!has_power_keep_awake());
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
            fn get_battery_health<'a>(
                &self,
                _out: &'a mut PowerBatteryHealth,
            ) -> Option<&'a mut PowerBatteryHealth> {
                None
            }
            fn get_system_idle_state(&self, _t: f32) -> PowerIdleState {
                PowerIdleState::Unknown
            }
            fn get_system_idle_time(&self) -> f32 {
                -1.0
            }
            fn is_keep_awake_active(&self) -> bool {
                false
            }
            fn subscribe(&self, _l: Box<dyn Fn() + Send + Sync>) -> Box<dyn Fn() + Send + Sync> {
                Box::new(|| {})
            }
            fn subscribe_lock_screen(
                &self,
                _l: Box<dyn Fn() + Send + Sync>,
            ) -> Box<dyn Fn() + Send + Sync> {
                Box::new(|| {})
            }
            fn subscribe_low_power_mode_change(
                &self,
                _l: Box<dyn Fn() + Send + Sync>,
            ) -> Box<dyn Fn() + Send + Sync> {
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
            fn subscribe_thermal_state_change(
                &self,
                _l: Box<dyn Fn() + Send + Sync>,
            ) -> Box<dyn Fn() + Send + Sync> {
                Box::new(|| {})
            }
            fn subscribe_unlock_screen(
                &self,
                _l: Box<dyn Fn() + Send + Sync>,
            ) -> Box<dyn Fn() + Send + Sync> {
                Box::new(|| {})
            }
            fn set_keep_awake(&self, _enabled: bool, _mode: PowerKeepAwakeMode) -> bool {
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

    // --- set_power_idle_polling_interval_ms ---

    #[test]
    #[serial]
    fn set_power_idle_polling_interval_ms_updates_getter() {
        set_power_idle_polling_interval_ms(1000);
        assert_eq!(get_power_idle_polling_interval_ms(), 1000);
        set_power_idle_polling_interval_ms(5000);
    }

    // --- set_power_keep_awake ---

    #[test]
    #[serial]
    fn set_power_keep_awake_returns_false_with_stub() {
        set_power_backend(None);
        assert!(!set_power_keep_awake(
            true,
            PowerKeepAwakeMode::PreventDisplaySleep
        ));
    }

    #[test]
    #[serial]
    fn set_power_keep_awake_passes_mode_to_backend() {
        let backend = FakeBackend::new();
        set_power_backend(Some(backend.clone()));
        assert!(set_power_keep_awake(
            true,
            PowerKeepAwakeMode::PreventDisplaySleep
        ));
        assert!(*backend.keep_awake.lock().unwrap());
        set_power_backend(None);
    }
}
