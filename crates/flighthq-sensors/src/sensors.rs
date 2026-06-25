//! Sensors free functions and backend management.
//!
//! Device motion, orientation, and magnetometer readings delivered to a
//! [`Sensors`] event entity over a swappable backend. Sensors are a mobile
//! capability with no std default; the built-in backend returns clean
//! sentinels (no-op subscriptions, granted permission) until a host installs
//! a real one via [`set_sensors_backend`].

use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};

use flighthq_signals::emit_signal;
use flighthq_types::{MotionReading, OrientationReading, Sensors, SensorsBackend};

// ---------------------------------------------------------------------------
// Default stub backend
// ---------------------------------------------------------------------------

// No-op default. std cannot read accelerometer/gyroscope/magnetometer hardware,
// so every subscription returns a no-op unsubscribe and permission is granted
// (the host does not gate sensors here). A native/mobile host replaces this.
struct StubSensorsBackend;

impl SensorsBackend for StubSensorsBackend {
    fn subscribe_motion(
        &self,
        _listener: Box<dyn Fn(MotionReading, MotionReading) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn subscribe_orientation(
        &self,
        _listener: Box<dyn Fn(OrientationReading) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn subscribe_magnetometer(
        &self,
        _listener: Box<dyn Fn(MotionReading) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn request_permission(&self) -> Pin<Box<dyn Future<Output = bool> + Send>> {
        // The default host does not gate sensors, so permission is granted.
        Box::pin(async { true })
    }
}

// ---------------------------------------------------------------------------
// Public free functions
// ---------------------------------------------------------------------------

/// Begins delivering sensor readings to `sensors`'s signals by subscribing to
/// the active backend's motion, orientation, and magnetometer streams. The
/// motion listener emits `on_accelerometer` and `on_gyroscope`; the
/// orientation listener emits `on_orientation`; the magnetometer listener
/// emits `on_magnetometer`.
///
/// Idempotent: a prior subscription is torn down first. Pair with
/// [`detach_sensors`] / [`dispose_sensors`].
pub fn attach_sensors(sensors: &Sensors) {
    detach_sensors(sensors);
    let backend = get_sensors_backend();

    let on_accelerometer = sensors.on_accelerometer.clone();
    let on_gyroscope = sensors.on_gyroscope.clone();
    let unsubscribe_motion =
        backend.subscribe_motion(Box::new(move |acceleration, rotation_rate| {
            emit_signal(&on_accelerometer, &acceleration);
            emit_signal(&on_gyroscope, &rotation_rate);
        }));

    let on_orientation = sensors.on_orientation.clone();
    let unsubscribe_orientation = backend.subscribe_orientation(Box::new(move |orientation| {
        emit_signal(&on_orientation, &orientation);
    }));

    let on_magnetometer = sensors.on_magnetometer.clone();
    let unsubscribe_magnetometer = backend.subscribe_magnetometer(Box::new(move |reading| {
        emit_signal(&on_magnetometer, &reading);
    }));

    let unsubscribe: SensorsUnsubscribe = Box::new(move || {
        unsubscribe_motion();
        unsubscribe_orientation();
        unsubscribe_magnetometer();
    });

    let mut guard = SUBSCRIPTIONS
        .lock()
        .expect("sensors subscriptions mutex poisoned");
    guard.push((sensors as *const Sensors as usize, unsubscribe));
}

/// Allocates a zeroed [`MotionReading`].
pub fn create_motion_reading() -> MotionReading {
    MotionReading::default()
}

/// Allocates a zeroed [`OrientationReading`]. `heading` is `-1.0` (unknown) and
/// `absolute` is `false` until a reading arrives.
pub fn create_orientation_reading() -> OrientationReading {
    OrientationReading {
        heading: -1.0,
        ..Default::default()
    }
}

/// Allocates a [`Sensors`] event entity with inert signals; call
/// [`attach_sensors`] to start delivery.
pub fn create_sensors() -> Sensors {
    Sensors::default()
}

/// Stops delivery to `sensors` and forgets its subscription. Safe to call when
/// not attached.
pub fn detach_sensors(sensors: &Sensors) {
    let key = sensors as *const Sensors as usize;
    let mut guard = SUBSCRIPTIONS
        .lock()
        .expect("sensors subscriptions mutex poisoned");
    if let Some(pos) = guard.iter().position(|(k, _)| *k == key) {
        let (_, unsubscribe) = guard.remove(pos);
        unsubscribe();
    }
}

/// Releases `sensors` by detaching its backend subscriptions. The signals
/// remain plain memory afterwards and are freed when the last reference is
/// dropped.
pub fn dispose_sensors(sensors: &Sensors) {
    detach_sensors(sensors);
}

/// Returns the active sensors backend, or a lazily-installed no-op stub. There
/// is always a backend.
pub fn get_sensors_backend() -> Arc<dyn SensorsBackend> {
    let guard = BACKEND.lock().expect("sensors backend mutex poisoned");
    match guard.as_ref() {
        Some(b) => Arc::clone(b),
        None => Arc::new(StubSensorsBackend),
    }
}

/// Requests sensor permission where the host gates it (e.g. iOS). Resolves
/// `true` when granted or when the host does not gate sensors.
pub async fn request_sensors_permission() -> bool {
    get_sensors_backend().request_permission().await
}

/// Installs a native host sensors backend. Pass `None` to fall back to the
/// built-in no-op stub.
pub fn set_sensors_backend(backend: Option<Arc<dyn SensorsBackend>>) {
    let mut guard = BACKEND.lock().expect("sensors backend mutex poisoned");
    *guard = backend;
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

static BACKEND: Mutex<Option<Arc<dyn SensorsBackend>>> = Mutex::new(None);

// Combined unsubscribe handle returned by a backend subscription (TS `() => void`).
type SensorsUnsubscribe = Box<dyn Fn() + Send + Sync>;

// Subscription list: (Sensors address, combined unsubscribe fn).
static SUBSCRIPTIONS: Mutex<Vec<(usize, SensorsUnsubscribe)>> = Mutex::new(Vec::new());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::task::{Context, Poll, RawWaker, RawWakerVTable, Waker};

    use flighthq_signals::connect_signal;

    type MotionSlot = Arc<Mutex<Option<Box<dyn Fn(MotionReading, MotionReading) + Send + Sync>>>>;
    type OrientationSlot = Arc<Mutex<Option<Box<dyn Fn(OrientationReading) + Send + Sync>>>>;
    type MagnetometerSlot = Arc<Mutex<Option<Box<dyn Fn(MotionReading) + Send + Sync>>>>;

    // A fake backend that captures the listeners so a test can fire readings.
    struct FakeBackend {
        motion: MotionSlot,
        orientation: OrientationSlot,
        magnetometer: MagnetometerSlot,
    }

    impl FakeBackend {
        fn new() -> Self {
            FakeBackend {
                motion: Arc::new(Mutex::new(None)),
                orientation: Arc::new(Mutex::new(None)),
                magnetometer: Arc::new(Mutex::new(None)),
            }
        }

        fn fire_motion(&self, acceleration: MotionReading, rotation_rate: MotionReading) {
            if let Some(l) = self.motion.lock().unwrap().as_ref() {
                l(acceleration, rotation_rate);
            }
        }

        fn fire_orientation(&self, orientation: OrientationReading) {
            if let Some(l) = self.orientation.lock().unwrap().as_ref() {
                l(orientation);
            }
        }

        fn fire_magnetometer(&self, reading: MotionReading) {
            if let Some(l) = self.magnetometer.lock().unwrap().as_ref() {
                l(reading);
            }
        }
    }

    impl SensorsBackend for FakeBackend {
        fn subscribe_motion(
            &self,
            listener: Box<dyn Fn(MotionReading, MotionReading) + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            *self.motion.lock().unwrap() = Some(listener);
            let slot = Arc::clone(&self.motion);
            Box::new(move || {
                *slot.lock().unwrap() = None;
            })
        }

        fn subscribe_orientation(
            &self,
            listener: Box<dyn Fn(OrientationReading) + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            *self.orientation.lock().unwrap() = Some(listener);
            let slot = Arc::clone(&self.orientation);
            Box::new(move || {
                *slot.lock().unwrap() = None;
            })
        }

        fn subscribe_magnetometer(
            &self,
            listener: Box<dyn Fn(MotionReading) + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            *self.magnetometer.lock().unwrap() = Some(listener);
            let slot = Arc::clone(&self.magnetometer);
            Box::new(move || {
                *slot.lock().unwrap() = None;
            })
        }

        fn request_permission(&self) -> Pin<Box<dyn Future<Output = bool> + Send>> {
            Box::pin(async { true })
        }
    }

    // Minimal synchronous executor for futures that complete without yielding.
    fn block_on<F: Future>(mut future: F) -> F::Output {
        fn raw_waker() -> RawWaker {
            fn no_op(_: *const ()) {}
            fn clone(_: *const ()) -> RawWaker {
                raw_waker()
            }
            RawWaker::new(
                std::ptr::null(),
                &RawWakerVTable::new(clone, no_op, no_op, no_op),
            )
        }
        let waker = unsafe { Waker::from_raw(raw_waker()) };
        let mut cx = Context::from_waker(&waker);
        // Safety: the future is not moved after being pinned.
        let mut future = unsafe { Pin::new_unchecked(&mut future) };
        loop {
            if let Poll::Ready(value) = future.as_mut().poll(&mut cx) {
                return value;
            }
        }
    }

    #[test]
    #[serial]
    fn attach_sensors_emits_all_streams() {
        let backend = Arc::new(FakeBackend::new());
        set_sensors_backend(Some(Arc::clone(&backend) as Arc<dyn SensorsBackend>));

        let sensors = create_sensors();
        let accel = Arc::new(AtomicUsize::new(0));
        let gyro = Arc::new(AtomicUsize::new(0));
        let orient = Arc::new(AtomicUsize::new(0));
        let magnet = Arc::new(AtomicUsize::new(0));

        let a = Arc::clone(&accel);
        let _g_accel = connect_signal(
            &sensors.on_accelerometer,
            Arc::new(move |_: &MotionReading| {
                a.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );
        let g = Arc::clone(&gyro);
        let _g_gyro = connect_signal(
            &sensors.on_gyroscope,
            Arc::new(move |_: &MotionReading| {
                g.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );
        let o = Arc::clone(&orient);
        let _g_orient = connect_signal(
            &sensors.on_orientation,
            Arc::new(move |_: &OrientationReading| {
                o.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );
        let m = Arc::clone(&magnet);
        let _g_magnet = connect_signal(
            &sensors.on_magnetometer,
            Arc::new(move |_: &MotionReading| {
                m.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );

        attach_sensors(&sensors);
        backend.fire_motion(create_motion_reading(), create_motion_reading());
        backend.fire_orientation(create_orientation_reading());
        backend.fire_magnetometer(create_motion_reading());

        assert_eq!(accel.load(Ordering::SeqCst), 1);
        assert_eq!(gyro.load(Ordering::SeqCst), 1);
        assert_eq!(orient.load(Ordering::SeqCst), 1);
        assert_eq!(magnet.load(Ordering::SeqCst), 1);

        detach_sensors(&sensors);
        set_sensors_backend(None);
    }

    #[test]
    fn create_motion_reading_returns_zeroed() {
        let r = create_motion_reading();
        assert_eq!(r.x, 0.0);
        assert_eq!(r.y, 0.0);
        assert_eq!(r.z, 0.0);
    }

    #[test]
    fn create_orientation_reading_has_unknown_heading() {
        let r = create_orientation_reading();
        assert_eq!(r.alpha, 0.0);
        assert_eq!(r.beta, 0.0);
        assert_eq!(r.gamma, 0.0);
        assert!(!r.absolute);
        assert_eq!(r.heading, -1.0);
    }

    #[test]
    fn create_sensors_returns_inert_entity() {
        let s = create_sensors();
        // Signals start with no listeners; emitting is a no-op and must not panic.
        emit_signal(&s.on_accelerometer, &create_motion_reading());
        emit_signal(&s.on_gyroscope, &create_motion_reading());
        emit_signal(&s.on_magnetometer, &create_motion_reading());
        emit_signal(&s.on_orientation, &create_orientation_reading());
    }

    #[test]
    #[serial]
    fn detach_sensors_stops_delivery() {
        let backend = Arc::new(FakeBackend::new());
        set_sensors_backend(Some(Arc::clone(&backend) as Arc<dyn SensorsBackend>));

        let sensors = create_sensors();
        let accel = Arc::new(AtomicUsize::new(0));
        let a = Arc::clone(&accel);
        let _guard = connect_signal(
            &sensors.on_accelerometer,
            Arc::new(move |_: &MotionReading| {
                a.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );

        attach_sensors(&sensors);
        detach_sensors(&sensors);
        backend.fire_motion(create_motion_reading(), create_motion_reading());

        assert_eq!(accel.load(Ordering::SeqCst), 0);
        set_sensors_backend(None);
    }

    #[test]
    fn detach_sensors_is_safe_when_not_attached() {
        let sensors = create_sensors();
        detach_sensors(&sensors);
    }

    #[test]
    #[serial]
    fn dispose_sensors_detaches() {
        let backend = Arc::new(FakeBackend::new());
        set_sensors_backend(Some(Arc::clone(&backend) as Arc<dyn SensorsBackend>));
        let sensors = create_sensors();
        attach_sensors(&sensors);
        dispose_sensors(&sensors);
        // A second fire reaches no listener (subscription was torn down).
        backend.fire_motion(create_motion_reading(), create_motion_reading());
        set_sensors_backend(None);
    }

    #[test]
    #[serial]
    fn get_sensors_backend_falls_back_to_stub() {
        set_sensors_backend(None);
        // The stub backend's subscriptions are no-ops returning a no-op unsubscribe.
        let backend = get_sensors_backend();
        let unsubscribe = backend.subscribe_motion(Box::new(|_, _| {}));
        unsubscribe();
        let unsubscribe = backend.subscribe_orientation(Box::new(|_| {}));
        unsubscribe();
        let unsubscribe = backend.subscribe_magnetometer(Box::new(|_| {}));
        unsubscribe();
    }

    #[test]
    #[serial]
    fn request_sensors_permission_grants_by_default() {
        set_sensors_backend(None);
        // The default backend does not gate sensors, so permission is granted.
        assert!(block_on(request_sensors_permission()));
    }

    #[test]
    #[serial]
    fn set_sensors_backend_installs_and_clears() {
        set_sensors_backend(Some(Arc::new(FakeBackend::new())));
        let _ = get_sensors_backend();
        set_sensors_backend(None);
        // Falls back to the stub rather than panicking.
        let _ = get_sensors_backend();
    }
}
