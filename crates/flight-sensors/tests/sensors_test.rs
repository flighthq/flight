use std::future::Future;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, Waker};

use flight_entity::{FlightError, FlightErrorKind, has_entity_binding, has_entity_runtime};
use flight_sensors::contract::*;
use flight_signals::{connect_signal, has_signal_slots};

struct Listeners {
    absolute_orientation: Option<OrientationListener>,
    ambient_light: Option<AmbientLightListener>,
    barometer: Option<PressureListener>,
    gravity: Option<MotionListener>,
    linear_acceleration: Option<MotionListener>,
    magnetometer: Option<MotionListener>,
    motion: Option<RotationMotionListener>,
    orientation: Option<OrientationListener>,
    proximity: Option<ProximityListener>,
    quaternion: Option<QuaternionListener>,
}

struct Support {
    ambient_light: bool,
    barometer: bool,
    gravity: bool,
    gyroscope: bool,
    linear_acceleration: bool,
    magnetometer: bool,
    motion: bool,
    orientation: bool,
    proximity: bool,
}

struct ProviderState {
    listeners: Mutex<Listeners>,
    options_were_none: Mutex<Vec<bool>>,
    permission_error: Mutex<Option<FlightError>>,
    permission_sensor: Mutex<Option<Option<SensorsPermissionSensor>>>,
    permission_state: Mutex<SensorsPermissionState>,
    request_error: Mutex<Option<FlightError>>,
    request_result: Mutex<bool>,
    subscribe_order: Mutex<Vec<&'static str>>,
    support: Mutex<Support>,
    throw_on_subscribe: Mutex<Option<&'static str>>,
    throw_on_unsubscribe: Mutex<Option<&'static str>>,
    unsubscribe_order: Mutex<Vec<&'static str>>,
}

impl ProviderState {
    fn new() -> Self {
        return ProviderState {
            listeners: Mutex::new(Listeners {
                absolute_orientation: None,
                ambient_light: None,
                barometer: None,
                gravity: None,
                linear_acceleration: None,
                magnetometer: None,
                motion: None,
                orientation: None,
                proximity: None,
                quaternion: None,
            }),
            options_were_none: Mutex::new(Vec::new()),
            permission_error: Mutex::new(None),
            permission_sensor: Mutex::new(None),
            permission_state: Mutex::new(SensorsPermissionState::Granted),
            request_error: Mutex::new(None),
            request_result: Mutex::new(true),
            subscribe_order: Mutex::new(Vec::new()),
            support: Mutex::new(Support {
                ambient_light: false,
                barometer: false,
                gravity: false,
                gyroscope: false,
                linear_acceleration: false,
                magnetometer: false,
                motion: false,
                orientation: false,
                proximity: false,
            }),
            throw_on_subscribe: Mutex::new(None),
            throw_on_unsubscribe: Mutex::new(None),
            unsubscribe_order: Mutex::new(Vec::new()),
        };
    }

    fn fire_absolute_orientation(&self, reading: &OrientationReading) {
        let listener = self.listeners.lock().unwrap().absolute_orientation.clone();
        if let Some(listener) = listener {
            listener(reading);
        }
    }

    fn fire_ambient_light(&self, reading: &AmbientLightReading) {
        let listener = self.listeners.lock().unwrap().ambient_light.clone();
        if let Some(listener) = listener {
            listener(reading);
        }
    }

    fn fire_barometer(&self, reading: &PressureReading) {
        let listener = self.listeners.lock().unwrap().barometer.clone();
        if let Some(listener) = listener {
            listener(reading);
        }
    }

    fn fire_gravity(&self, reading: &MotionReading) {
        let listener = self.listeners.lock().unwrap().gravity.clone();
        if let Some(listener) = listener {
            listener(reading);
        }
    }

    fn fire_linear_acceleration(&self, reading: &MotionReading) {
        let listener = self.listeners.lock().unwrap().linear_acceleration.clone();
        if let Some(listener) = listener {
            listener(reading);
        }
    }

    fn fire_magnetometer(&self, reading: &MotionReading) {
        let listener = self.listeners.lock().unwrap().magnetometer.clone();
        if let Some(listener) = listener {
            listener(reading);
        }
    }

    fn fire_motion(&self, acceleration: &MotionReading, rotation_rate: &RotationRateReading) {
        let listener = self.listeners.lock().unwrap().motion.clone();
        if let Some(listener) = listener {
            listener(acceleration, rotation_rate);
        }
    }

    fn fire_orientation(&self, reading: &OrientationReading) {
        let listener = self.listeners.lock().unwrap().orientation.clone();
        if let Some(listener) = listener {
            listener(reading);
        }
    }

    fn fire_proximity(&self, reading: &ProximityReading) {
        let listener = self.listeners.lock().unwrap().proximity.clone();
        if let Some(listener) = listener {
            listener(reading);
        }
    }

    fn fire_quaternion(&self, reading: &QuaternionReading) {
        let listener = self.listeners.lock().unwrap().quaternion.clone();
        if let Some(listener) = listener {
            listener(reading);
        }
    }

    fn record_subscribe(&self, name: &'static str, options: Option<SensorSubscribeOptions>) {
        self.subscribe_order.lock().unwrap().push(name);
        self.options_were_none
            .lock()
            .unwrap()
            .push(options.is_none());
        if *self.throw_on_subscribe.lock().unwrap() == Some(name) {
            panic!("subscribe failed: {name}");
        }
    }

    fn record_unsubscribe(&self, name: &'static str) {
        self.unsubscribe_order.lock().unwrap().push(name);
        if *self.throw_on_unsubscribe.lock().unwrap() == Some(name) {
            panic!("unsubscribe failed: {name}");
        }
    }
}

fn block_on<F: Future>(future: F) -> F::Output {
    let mut future = Box::pin(future);
    let mut context = Context::from_waker(Waker::noop());
    loop {
        match future.as_mut().poll(&mut context) {
            Poll::Ready(value) => return value,
            Poll::Pending => std::thread::yield_now(),
        }
    }
}

fn provider(state: &Arc<ProviderState>) -> HostSensorsCapability {
    let get_permission = state.clone();
    let request_permission = state.clone();
    let ambient_support = state.clone();
    let barometer_support = state.clone();
    let gravity_support = state.clone();
    let gyroscope_support = state.clone();
    let linear_support = state.clone();
    let magnetometer_support = state.clone();
    let motion_support = state.clone();
    let orientation_support = state.clone();
    let proximity_support = state.clone();
    let absolute_subscription = state.clone();
    let ambient_subscription = state.clone();
    let barometer_subscription = state.clone();
    let gravity_subscription = state.clone();
    let linear_subscription = state.clone();
    let magnetometer_subscription = state.clone();
    let motion_subscription = state.clone();
    let orientation_subscription = state.clone();
    let proximity_subscription = state.clone();
    let quaternion_subscription = state.clone();
    return HostSensorsCapability {
        get_permission_state: Arc::new(move |sensor: Option<SensorsPermissionSensor>| {
            *get_permission.permission_sensor.lock().unwrap() = Some(sensor);
            let result = match get_permission.permission_error.lock().unwrap().clone() {
                Some(error) => Err(error),
                None => Ok(*get_permission.permission_state.lock().unwrap()),
            };
            return Box::pin(async move { result });
        }),
        is_ambient_light_supported: Arc::new(move || {
            ambient_support.support.lock().unwrap().ambient_light
        }),
        is_barometer_supported: Arc::new(move || {
            barometer_support.support.lock().unwrap().barometer
        }),
        is_gravity_supported: Arc::new(move || gravity_support.support.lock().unwrap().gravity),
        is_gyroscope_supported: Arc::new(move || {
            gyroscope_support.support.lock().unwrap().gyroscope
        }),
        is_linear_acceleration_supported: Arc::new(move || {
            linear_support.support.lock().unwrap().linear_acceleration
        }),
        is_magnetometer_supported: Arc::new(move || {
            magnetometer_support.support.lock().unwrap().magnetometer
        }),
        is_motion_supported: Arc::new(move || motion_support.support.lock().unwrap().motion),
        is_orientation_supported: Arc::new(move || {
            orientation_support.support.lock().unwrap().orientation
        }),
        is_proximity_supported: Arc::new(move || {
            proximity_support.support.lock().unwrap().proximity
        }),
        provider: state.clone() as ProviderRef,
        request_permission: Arc::new(move || {
            let result = match request_permission.request_error.lock().unwrap().clone() {
                Some(error) => Err(error),
                None => Ok(*request_permission.request_result.lock().unwrap()),
            };
            return Box::pin(async move { result });
        }),
        subscribe_absolute_orientation: Arc::new(move |listener, options| {
            absolute_subscription.record_subscribe("absolute_orientation", options);
            absolute_subscription
                .listeners
                .lock()
                .unwrap()
                .absolute_orientation = Some(listener);
            let release_state = absolute_subscription.clone();
            return Arc::new(move || {
                release_state.record_unsubscribe("absolute_orientation");
                release_state.listeners.lock().unwrap().absolute_orientation = None;
            });
        }),
        subscribe_ambient_light: Arc::new(move |listener, options| {
            ambient_subscription.record_subscribe("ambient_light", options);
            ambient_subscription.listeners.lock().unwrap().ambient_light = Some(listener);
            let release_state = ambient_subscription.clone();
            return Arc::new(move || {
                release_state.record_unsubscribe("ambient_light");
                release_state.listeners.lock().unwrap().ambient_light = None;
            });
        }),
        subscribe_barometer: Arc::new(move |listener, options| {
            barometer_subscription.record_subscribe("barometer", options);
            barometer_subscription.listeners.lock().unwrap().barometer = Some(listener);
            let release_state = barometer_subscription.clone();
            return Arc::new(move || {
                release_state.record_unsubscribe("barometer");
                release_state.listeners.lock().unwrap().barometer = None;
            });
        }),
        subscribe_gravity: Arc::new(move |listener, options| {
            gravity_subscription.record_subscribe("gravity", options);
            gravity_subscription.listeners.lock().unwrap().gravity = Some(listener);
            let release_state = gravity_subscription.clone();
            return Arc::new(move || {
                release_state.record_unsubscribe("gravity");
                release_state.listeners.lock().unwrap().gravity = None;
            });
        }),
        subscribe_linear_acceleration: Arc::new(move |listener, options| {
            linear_subscription.record_subscribe("linear_acceleration", options);
            linear_subscription
                .listeners
                .lock()
                .unwrap()
                .linear_acceleration = Some(listener);
            let release_state = linear_subscription.clone();
            return Arc::new(move || {
                release_state.record_unsubscribe("linear_acceleration");
                release_state.listeners.lock().unwrap().linear_acceleration = None;
            });
        }),
        subscribe_magnetometer: Arc::new(move |listener, options| {
            magnetometer_subscription.record_subscribe("magnetometer", options);
            magnetometer_subscription
                .listeners
                .lock()
                .unwrap()
                .magnetometer = Some(listener);
            let release_state = magnetometer_subscription.clone();
            return Arc::new(move || {
                release_state.record_unsubscribe("magnetometer");
                release_state.listeners.lock().unwrap().magnetometer = None;
            });
        }),
        subscribe_motion: Arc::new(move |listener, options| {
            motion_subscription.record_subscribe("motion", options);
            motion_subscription.listeners.lock().unwrap().motion = Some(listener);
            let release_state = motion_subscription.clone();
            return Arc::new(move || {
                release_state.record_unsubscribe("motion");
                release_state.listeners.lock().unwrap().motion = None;
            });
        }),
        subscribe_orientation: Arc::new(move |listener, options| {
            orientation_subscription.record_subscribe("orientation", options);
            orientation_subscription
                .listeners
                .lock()
                .unwrap()
                .orientation = Some(listener);
            let release_state = orientation_subscription.clone();
            return Arc::new(move || {
                release_state.record_unsubscribe("orientation");
                release_state.listeners.lock().unwrap().orientation = None;
            });
        }),
        subscribe_proximity: Arc::new(move |listener, options| {
            proximity_subscription.record_subscribe("proximity", options);
            proximity_subscription.listeners.lock().unwrap().proximity = Some(listener);
            let release_state = proximity_subscription.clone();
            return Arc::new(move || {
                release_state.record_unsubscribe("proximity");
                release_state.listeners.lock().unwrap().proximity = None;
            });
        }),
        subscribe_quaternion: Arc::new(move |listener, options| {
            quaternion_subscription.record_subscribe("quaternion", options);
            quaternion_subscription.listeners.lock().unwrap().quaternion = Some(listener);
            let release_state = quaternion_subscription.clone();
            return Arc::new(move || {
                release_state.record_unsubscribe("quaternion");
                release_state.listeners.lock().unwrap().quaternion = None;
            });
        }),
    };
}

fn rejected(message: &str) -> FlightError {
    return FlightError {
        kind: FlightErrorKind::TypeError,
        message: message.to_string(),
    };
}

fn assert_close(actual: f32, expected: f64, tolerance: f64) {
    assert!(
        (f64::from(actual) - expected).abs() <= tolerance,
        "{actual} != {expected}"
    );
}

mod attach_sensors {
    use super::*;

    #[test]
    fn emits_every_provider_stream_and_motion_pair_in_source_order() {
        let state = Arc::new(ProviderState::new());
        let mut sensors = create_sensors();
        let counts = Arc::new(Mutex::new([0_usize; 11]));
        let motion_order = Arc::new(Mutex::new(Vec::new()));
        let captured = counts.clone();
        let order = motion_order.clone();
        connect_signal(
            &sensors.on_accelerometer,
            Arc::new(move |_: &MotionReading| {
                captured.lock().unwrap()[0] += 1;
                order.lock().unwrap().push("accelerometer");
            }),
            None,
        );
        let captured = counts.clone();
        let order = motion_order.clone();
        connect_signal(
            &sensors.on_gyroscope,
            Arc::new(move |_: &RotationRateReading| {
                captured.lock().unwrap()[1] += 1;
                order.lock().unwrap().push("gyroscope");
            }),
            None,
        );
        let captured = counts.clone();
        connect_signal(
            &sensors.on_linear_acceleration,
            Arc::new(move |_: &MotionReading| captured.lock().unwrap()[2] += 1),
            None,
        );
        let captured = counts.clone();
        connect_signal(
            &sensors.on_gravity,
            Arc::new(move |_: &MotionReading| captured.lock().unwrap()[3] += 1),
            None,
        );
        let captured = counts.clone();
        connect_signal(
            &sensors.on_orientation,
            Arc::new(move |_: &OrientationReading| captured.lock().unwrap()[4] += 1),
            None,
        );
        let captured = counts.clone();
        connect_signal(
            &sensors.on_absolute_orientation,
            Arc::new(move |_: &OrientationReading| captured.lock().unwrap()[5] += 1),
            None,
        );
        let captured = counts.clone();
        connect_signal(
            &sensors.on_magnetometer,
            Arc::new(move |_: &MotionReading| captured.lock().unwrap()[6] += 1),
            None,
        );
        let captured = counts.clone();
        connect_signal(
            &sensors.on_ambient_light,
            Arc::new(move |_: &AmbientLightReading| captured.lock().unwrap()[7] += 1),
            None,
        );
        let captured = counts.clone();
        connect_signal(
            &sensors.on_barometer,
            Arc::new(move |_: &PressureReading| captured.lock().unwrap()[8] += 1),
            None,
        );
        let captured = counts.clone();
        connect_signal(
            &sensors.on_proximity,
            Arc::new(move |_: &ProximityReading| captured.lock().unwrap()[9] += 1),
            None,
        );
        let captured = counts.clone();
        connect_signal(
            &sensors.on_quaternion,
            Arc::new(move |_: &QuaternionReading| captured.lock().unwrap()[10] += 1),
            None,
        );
        attach_sensors(&provider(&state), &mut sensors);
        state.fire_motion(&create_motion_reading(), &create_rotation_rate_reading());
        state.fire_linear_acceleration(&create_motion_reading());
        state.fire_gravity(&create_motion_reading());
        state.fire_orientation(&create_orientation_reading());
        state.fire_absolute_orientation(&create_orientation_reading());
        state.fire_magnetometer(&create_motion_reading());
        state.fire_ambient_light(&create_ambient_light_reading());
        state.fire_barometer(&create_pressure_reading());
        state.fire_proximity(&create_proximity_reading());
        state.fire_quaternion(&create_quaternion_reading());
        assert_eq!(*counts.lock().unwrap(), [1; 11]);
        assert_eq!(
            *motion_order.lock().unwrap(),
            ["accelerometer", "gyroscope"]
        );
    }

    #[test]
    fn preserves_provider_scratch_identity_and_passes_no_subscription_options() {
        let state = Arc::new(ProviderState::new());
        let host = provider(&state);
        let provider_ref = state.clone() as ProviderRef;
        assert!(Arc::ptr_eq(&host.provider, &provider_ref));
        let mut sensors = create_sensors();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured = seen.clone();
        connect_signal(
            &sensors.on_gravity,
            Arc::new(move |reading: &MotionReading| {
                captured
                    .lock()
                    .unwrap()
                    .push(reading as *const MotionReading as usize);
            }),
            None,
        );
        attach_sensors(&host, &mut sensors);
        let reading = create_motion_reading();
        state.fire_gravity(&reading);
        state.fire_gravity(&reading);
        assert_eq!(
            *seen.lock().unwrap(),
            [(&reading as *const MotionReading as usize); 2]
        );
        assert_eq!(*state.options_were_none.lock().unwrap(), [true; 10]);
    }

    #[test]
    fn subscribes_in_exact_order_and_does_not_release_partial_work_when_subscribe_throws() {
        let state = Arc::new(ProviderState::new());
        *state.throw_on_subscribe.lock().unwrap() = Some("gravity");
        let mut sensors = create_sensors();
        let result = catch_unwind(AssertUnwindSafe(|| {
            attach_sensors(&provider(&state), &mut sensors)
        }));
        assert!(result.is_err());
        assert_eq!(
            *state.subscribe_order.lock().unwrap(),
            ["motion", "linear_acceleration", "gravity"]
        );
        assert!(state.unsubscribe_order.lock().unwrap().is_empty());
        assert!(!has_entity_binding(&sensors));
    }

    #[test]
    fn reattach_consumes_the_prior_bundle_before_subscribing_again() {
        let state = Arc::new(ProviderState::new());
        let host = provider(&state);
        let mut sensors = create_sensors();
        attach_sensors(&host, &mut sensors);
        attach_sensors(&host, &mut sensors);
        assert_eq!(state.subscribe_order.lock().unwrap().len(), 20);
        assert_eq!(state.unsubscribe_order.lock().unwrap().len(), 10);
        let seen = Arc::new(Mutex::new(0));
        let captured = seen.clone();
        connect_signal(
            &sensors.on_accelerometer,
            Arc::new(move |_: &MotionReading| *captured.lock().unwrap() += 1),
            None,
        );
        state.fire_motion(&create_motion_reading(), &create_rotation_rate_reading());
        assert_eq!(*seen.lock().unwrap(), 1);
    }
}

mod compute_euler_from_quaternion {
    use super::*;

    #[test]
    fn matches_a_double_precision_reference_and_propagates_metadata() {
        let mut quaternion = create_quaternion_reading();
        quaternion.x = 0.31;
        quaternion.y = -0.22;
        quaternion.z = 0.17;
        quaternion.w = 0.9;
        quaternion.interval = 20.0;
        quaternion.timestamp = 99_999.0;
        quaternion.accuracy = SensorAccuracy::High;
        let mut out = create_orientation_reading();
        compute_euler_from_quaternion(&mut out, &quaternion);
        let x = f64::from(quaternion.x);
        let y = f64::from(quaternion.y);
        let z = f64::from(quaternion.z);
        let w = f64::from(quaternion.w);
        let sin_beta = 2.0 * (w * x - y * z);
        let beta = if sin_beta.abs() >= 1.0 {
            sin_beta.signum() * std::f64::consts::FRAC_PI_2
        } else {
            sin_beta.asin()
        };
        let alpha = (2.0 * (w * z + x * y)).atan2(1.0 - 2.0 * (x * x + z * z));
        let gamma = (2.0 * (w * y + x * z)).atan2(1.0 - 2.0 * (x * x + y * y));
        assert_close(out.alpha, alpha.to_degrees().rem_euclid(360.0), 0.0001);
        assert_close(out.beta, beta.to_degrees(), 0.0001);
        assert_close(out.gamma, gamma.to_degrees(), 0.0001);
        assert_eq!(
            (out.interval, out.timestamp, out.accuracy),
            (20.0, 99_999.0, SensorAccuracy::High)
        );
    }
}

mod compute_gravity_from_orientation {
    use super::*;

    #[test]
    fn matches_a_double_precision_reference_and_propagates_metadata() {
        let mut orientation = create_orientation_reading();
        orientation.beta = 27.5;
        orientation.gamma = -18.25;
        orientation.interval = 10.0;
        orientation.timestamp = 5_000.0;
        orientation.accuracy = SensorAccuracy::Medium;
        let mut out = create_motion_reading();
        compute_gravity_from_orientation(&mut out, &orientation);
        let beta = f64::from(orientation.beta).to_radians();
        let gamma = f64::from(orientation.gamma).to_radians();
        assert_close(out.x, 9.80665 * beta.cos() * gamma.sin(), 0.00001);
        assert_close(out.y, -9.80665 * beta.sin(), 0.00001);
        assert_close(out.z, 9.80665 * beta.cos() * gamma.cos(), 0.00001);
        assert_eq!(
            (out.interval, out.timestamp, out.accuracy),
            (10.0, 5_000.0, SensorAccuracy::Medium)
        );
    }
}

mod compute_quaternion_from_orientation_reading {
    use super::*;

    #[test]
    fn matches_the_source_zxy_formula_and_propagates_all_metadata() {
        let mut orientation = create_orientation_reading();
        orientation.alpha = 73.0;
        orientation.beta = -21.0;
        orientation.gamma = 14.0;
        orientation.interval = 16.0;
        orientation.timestamp = 12_345.0;
        orientation.accuracy = SensorAccuracy::Low;
        let mut out = create_quaternion_reading();
        compute_quaternion_from_orientation_reading(&mut out, &orientation);
        let alpha = f64::from(orientation.alpha).to_radians() * 0.5;
        let beta = f64::from(orientation.beta).to_radians() * 0.5;
        let gamma = f64::from(orientation.gamma).to_radians() * 0.5;
        assert_close(
            out.x,
            alpha.sin() * beta.sin() * gamma.cos() - alpha.cos() * beta.cos() * gamma.sin(),
            0.000001,
        );
        assert_close(
            out.y,
            alpha.sin() * beta.cos() * gamma.sin() + alpha.cos() * beta.sin() * gamma.cos(),
            0.000001,
        );
        assert_close(
            out.z,
            alpha.cos() * beta.cos() * gamma.sin() - alpha.sin() * beta.sin() * gamma.cos(),
            0.000001,
        );
        assert_close(
            out.w,
            alpha.cos() * beta.cos() * gamma.cos() + alpha.sin() * beta.sin() * gamma.sin(),
            0.000001,
        );
        assert_eq!(
            (out.interval, out.timestamp, out.accuracy),
            (16.0, 12_345.0, SensorAccuracy::Low)
        );
    }
}

mod compute_rotation_matrix_from_quaternion {
    use super::*;

    #[test]
    fn writes_the_column_major_matrix_and_grows_a_short_number_array() {
        let mut quaternion = create_quaternion_reading();
        quaternion.x = 0.2;
        quaternion.y = -0.3;
        quaternion.z = 0.4;
        quaternion.w = 0.8;
        let mut out = Vec::new();
        compute_rotation_matrix_from_quaternion(&mut out, &quaternion);
        assert_eq!(out.len(), 9);
        let x = f64::from(quaternion.x);
        let y = f64::from(quaternion.y);
        let z = f64::from(quaternion.z);
        let w = f64::from(quaternion.w);
        let expected = [
            1.0 - 2.0 * (y * y + z * z),
            2.0 * (x * y + w * z),
            2.0 * (x * z - w * y),
            2.0 * (x * y - w * z),
            1.0 - 2.0 * (x * x + z * z),
            2.0 * (y * z + w * x),
            2.0 * (x * z + w * y),
            2.0 * (y * z - w * x),
            1.0 - 2.0 * (x * x + y * y),
        ];
        for (actual, expected) in out.iter().zip(expected) {
            assert_close(*actual, expected, 0.000001);
        }
    }
}

mod compute_screen_relative_orientation {
    use super::*;

    #[test]
    fn rotates_beta_gamma_and_propagates_every_other_field() {
        let mut orientation = create_orientation_reading();
        orientation.alpha = 35.0;
        orientation.beta = 20.0;
        orientation.gamma = 10.0;
        orientation.absolute = true;
        orientation.heading = 45.0;
        orientation.interval = 16.0;
        orientation.timestamp = 1_000.0;
        orientation.accuracy = SensorAccuracy::High;
        let mut out = create_orientation_reading();
        compute_screen_relative_orientation(&mut out, &orientation, 90.0);
        assert_close(out.beta, -10.0, 0.00001);
        assert_close(out.gamma, 20.0, 0.00001);
        assert_eq!(out.alpha, 35.0);
        assert!(out.absolute);
        assert_eq!(
            (out.heading, out.interval, out.timestamp, out.accuracy),
            (45.0, 16.0, 1_000.0, SensorAccuracy::High)
        );
    }
}

mod compute_world_acceleration_from_device_acceleration {
    use super::*;

    #[test]
    fn matches_the_source_rotation_formula_and_propagates_acceleration_metadata() {
        let mut acceleration = create_motion_reading();
        acceleration.x = 1.25;
        acceleration.y = -2.5;
        acceleration.z = 0.75;
        acceleration.interval = 8.0;
        acceleration.timestamp = 42_000.0;
        acceleration.accuracy = SensorAccuracy::Low;
        let mut quaternion = create_quaternion_reading();
        quaternion.x = 0.1;
        quaternion.y = 0.2;
        quaternion.z = -0.3;
        quaternion.w = 0.9;
        let mut out = create_motion_reading();
        compute_world_acceleration_from_device_acceleration(&mut out, &acceleration, &quaternion);
        let ax = f64::from(acceleration.x);
        let ay = f64::from(acceleration.y);
        let az = f64::from(acceleration.z);
        let qx = f64::from(quaternion.x);
        let qy = f64::from(quaternion.y);
        let qz = f64::from(quaternion.z);
        let qw = f64::from(quaternion.w);
        let cross = [qy * az - qz * ay, qz * ax - qx * az, qx * ay - qy * ax];
        let cross_cross = [
            qy * cross[2] - qz * cross[1],
            qz * cross[0] - qx * cross[2],
            qx * cross[1] - qy * cross[0],
        ];
        assert_close(
            out.x,
            ax + 2.0 * qw * cross[0] + 2.0 * cross_cross[0],
            0.000001,
        );
        assert_close(
            out.y,
            ay + 2.0 * qw * cross[1] + 2.0 * cross_cross[1],
            0.000001,
        );
        assert_close(
            out.z,
            az + 2.0 * qw * cross[2] + 2.0 * cross_cross[2],
            0.000001,
        );
        assert_eq!(
            (out.interval, out.timestamp, out.accuracy),
            (8.0, 42_000.0, SensorAccuracy::Low)
        );
    }
}

mod create_ambient_light_reading {
    use super::*;

    #[test]
    fn creates_the_source_sentinels_with_an_empty_runtime() {
        let out = create_ambient_light_reading();
        assert_eq!(
            (out.illuminance, out.interval, out.timestamp, out.accuracy),
            (0.0, -1.0, -1.0, SensorAccuracy::Unknown)
        );
        assert!(!has_entity_runtime(&out));
    }
}

mod create_motion_reading {
    use super::*;

    #[test]
    fn creates_the_source_sentinels_with_an_empty_runtime() {
        let out = create_motion_reading();
        assert_eq!(
            (
                out.x,
                out.y,
                out.z,
                out.interval,
                out.timestamp,
                out.accuracy
            ),
            (0.0, 0.0, 0.0, -1.0, -1.0, SensorAccuracy::Unknown)
        );
        assert!(!has_entity_runtime(&out));
    }
}

mod create_orientation_reading {
    use super::*;

    #[test]
    fn creates_the_source_sentinels_with_an_empty_runtime() {
        let out = create_orientation_reading();
        assert_eq!(
            (out.alpha, out.beta, out.gamma, out.heading),
            (0.0, 0.0, 0.0, -1.0)
        );
        assert!(!out.absolute);
        assert_eq!(
            (out.interval, out.timestamp, out.accuracy),
            (-1.0, -1.0, SensorAccuracy::Unknown)
        );
        assert!(!has_entity_runtime(&out));
    }
}

mod create_pressure_reading {
    use super::*;

    #[test]
    fn creates_the_source_sentinels_with_an_empty_runtime() {
        let out = create_pressure_reading();
        assert_eq!(
            (
                out.altitude,
                out.pressure,
                out.interval,
                out.timestamp,
                out.accuracy
            ),
            (-1.0, 0.0, -1.0, -1.0, SensorAccuracy::Unknown)
        );
        assert!(!has_entity_runtime(&out));
    }
}

mod create_proximity_reading {
    use super::*;

    #[test]
    fn creates_the_source_sentinels_with_an_empty_runtime() {
        let out = create_proximity_reading();
        assert_eq!(
            (
                out.distance,
                out.max,
                out.near,
                out.interval,
                out.timestamp,
                out.accuracy
            ),
            (-1.0, -1.0, false, -1.0, -1.0, SensorAccuracy::Unknown)
        );
        assert!(!has_entity_runtime(&out));
    }
}

mod create_quaternion_reading {
    use super::*;

    #[test]
    fn creates_identity_and_source_sentinels_with_an_empty_runtime() {
        let out = create_quaternion_reading();
        assert_eq!((out.w, out.x, out.y, out.z), (1.0, 0.0, 0.0, 0.0));
        assert_eq!(
            (out.interval, out.timestamp, out.accuracy),
            (-1.0, -1.0, SensorAccuracy::Unknown)
        );
        assert!(!has_entity_runtime(&out));
    }
}

mod create_rotation_rate_reading {
    use super::*;

    #[test]
    fn creates_the_source_sentinels_with_an_empty_runtime() {
        let out = create_rotation_rate_reading();
        assert_eq!(
            (
                out.alpha,
                out.beta,
                out.gamma,
                out.interval,
                out.timestamp,
                out.accuracy
            ),
            (0.0, 0.0, 0.0, -1.0, -1.0, SensorAccuracy::Unknown)
        );
        assert!(!has_entity_runtime(&out));
    }
}

mod create_sensors {
    use super::*;

    #[test]
    fn creates_eleven_inert_signals_with_an_empty_runtime() {
        let out = create_sensors();
        assert!(!has_signal_slots(&out.on_absolute_orientation));
        assert!(!has_signal_slots(&out.on_accelerometer));
        assert!(!has_signal_slots(&out.on_ambient_light));
        assert!(!has_signal_slots(&out.on_barometer));
        assert!(!has_signal_slots(&out.on_gravity));
        assert!(!has_signal_slots(&out.on_gyroscope));
        assert!(!has_signal_slots(&out.on_linear_acceleration));
        assert!(!has_signal_slots(&out.on_magnetometer));
        assert!(!has_signal_slots(&out.on_orientation));
        assert!(!has_signal_slots(&out.on_proximity));
        assert!(!has_signal_slots(&out.on_quaternion));
        assert!(!has_entity_runtime(&out));
    }
}

mod detach_sensors {
    use super::*;

    #[test]
    fn is_safe_unattached_and_stops_delivery_after_an_exact_ordered_release() {
        let state = Arc::new(ProviderState::new());
        let mut sensors = create_sensors();
        detach_sensors(&mut sensors);
        attach_sensors(&provider(&state), &mut sensors);
        detach_sensors(&mut sensors);
        assert_eq!(
            *state.unsubscribe_order.lock().unwrap(),
            [
                "absolute_orientation",
                "ambient_light",
                "barometer",
                "gravity",
                "linear_acceleration",
                "magnetometer",
                "motion",
                "orientation",
                "proximity",
                "quaternion"
            ]
        );
        let seen = Arc::new(Mutex::new(0));
        let captured = seen.clone();
        connect_signal(
            &sensors.on_accelerometer,
            Arc::new(move |_: &MotionReading| *captured.lock().unwrap() += 1),
            None,
        );
        state.fire_motion(&create_motion_reading(), &create_rotation_rate_reading());
        assert_eq!(*seen.lock().unwrap(), 0);
        assert!(!has_entity_binding(&sensors));
    }

    #[test]
    fn stops_at_the_first_throw_and_forgets_the_bundle_only_after_a_complete_retry() {
        let state = Arc::new(ProviderState::new());
        let mut sensors = create_sensors();
        attach_sensors(&provider(&state), &mut sensors);
        *state.throw_on_unsubscribe.lock().unwrap() = Some("barometer");
        let result = catch_unwind(AssertUnwindSafe(|| detach_sensors(&mut sensors)));
        assert!(result.is_err());
        assert_eq!(
            *state.unsubscribe_order.lock().unwrap(),
            ["absolute_orientation", "ambient_light", "barometer"]
        );
        assert!(has_entity_binding(&sensors));
        *state.throw_on_unsubscribe.lock().unwrap() = None;
        detach_sensors(&mut sensors);
        assert_eq!(state.unsubscribe_order.lock().unwrap().len(), 13);
        assert!(!has_entity_binding(&sensors));
    }
}

mod dispose_sensors {
    use super::*;

    #[test]
    fn delegates_to_the_same_release_without_clearing_signals() {
        let state = Arc::new(ProviderState::new());
        let mut sensors = create_sensors();
        connect_signal(
            &sensors.on_accelerometer,
            Arc::new(|_: &MotionReading| {}),
            None,
        );
        attach_sensors(&provider(&state), &mut sensors);
        dispose_sensors(&mut sensors);
        assert_eq!(state.unsubscribe_order.lock().unwrap().len(), 10);
        assert!(has_signal_slots(&sensors.on_accelerometer));
    }
}

mod get_sensors_permission_state {
    use super::*;

    #[test]
    fn forwards_the_optional_sensor_and_preserves_rejection() {
        let state = Arc::new(ProviderState::new());
        *state.permission_state.lock().unwrap() = SensorsPermissionState::Prompt;
        let host = provider(&state);
        assert_eq!(
            block_on(get_sensors_permission_state(
                &host,
                Some(SensorsPermissionSensor::Orientation)
            )),
            Ok(SensorsPermissionState::Prompt)
        );
        assert_eq!(
            *state.permission_sensor.lock().unwrap(),
            Some(Some(SensorsPermissionSensor::Orientation))
        );
        let error = rejected("permission query failed");
        *state.permission_error.lock().unwrap() = Some(error.clone());
        assert_eq!(
            block_on(get_sensors_permission_state(&host, None)),
            Err(error)
        );
        assert_eq!(*state.permission_sensor.lock().unwrap(), Some(None));
    }
}

mod has_accelerometer {
    use super::*;

    #[test]
    fn delegates_to_motion_support() {
        let state = Arc::new(ProviderState::new());
        state.support.lock().unwrap().motion = true;
        assert!(has_accelerometer(&provider(&state)));
    }
}

mod has_ambient_light_sensor {
    use super::*;

    #[test]
    fn delegates_to_ambient_light_support() {
        let state = Arc::new(ProviderState::new());
        state.support.lock().unwrap().ambient_light = true;
        assert!(has_ambient_light_sensor(&provider(&state)));
    }
}

mod has_barometer {
    use super::*;

    #[test]
    fn delegates_to_barometer_support() {
        let state = Arc::new(ProviderState::new());
        state.support.lock().unwrap().barometer = true;
        assert!(has_barometer(&provider(&state)));
    }
}

mod has_gravity_sensor {
    use super::*;

    #[test]
    fn delegates_to_gravity_support() {
        let state = Arc::new(ProviderState::new());
        state.support.lock().unwrap().gravity = true;
        assert!(has_gravity_sensor(&provider(&state)));
    }
}

mod has_gyroscope {
    use super::*;

    #[test]
    fn delegates_to_gyroscope_support() {
        let state = Arc::new(ProviderState::new());
        state.support.lock().unwrap().gyroscope = true;
        assert!(has_gyroscope(&provider(&state)));
    }
}

mod has_linear_acceleration_sensor {
    use super::*;

    #[test]
    fn delegates_to_linear_acceleration_support() {
        let state = Arc::new(ProviderState::new());
        state.support.lock().unwrap().linear_acceleration = true;
        assert!(has_linear_acceleration_sensor(&provider(&state)));
    }
}

mod has_magnetometer {
    use super::*;

    #[test]
    fn delegates_to_magnetometer_support() {
        let state = Arc::new(ProviderState::new());
        state.support.lock().unwrap().magnetometer = true;
        assert!(has_magnetometer(&provider(&state)));
    }
}

mod has_orientation_sensor {
    use super::*;

    #[test]
    fn delegates_to_orientation_support() {
        let state = Arc::new(ProviderState::new());
        state.support.lock().unwrap().orientation = true;
        assert!(has_orientation_sensor(&provider(&state)));
    }
}

mod has_proximity_sensor {
    use super::*;

    #[test]
    fn delegates_to_proximity_support() {
        let state = Arc::new(ProviderState::new());
        state.support.lock().unwrap().proximity = true;
        assert!(has_proximity_sensor(&provider(&state)));
    }
}

mod initialize_ambient_light_reading {
    use super::*;

    #[test]
    fn restores_every_source_sentinel() {
        let mut out = create_ambient_light_reading();
        out.illuminance = 4.0;
        initialize_ambient_light_reading(&mut out);
        assert_eq!(
            (out.illuminance, out.interval, out.timestamp, out.accuracy),
            (0.0, -1.0, -1.0, SensorAccuracy::Unknown)
        );
    }
}

mod initialize_motion_reading {
    use super::*;

    #[test]
    fn restores_every_source_sentinel() {
        let mut out = create_motion_reading();
        out.x = 4.0;
        out.accuracy = SensorAccuracy::High;
        initialize_motion_reading(&mut out);
        assert_eq!(
            (
                out.x,
                out.y,
                out.z,
                out.interval,
                out.timestamp,
                out.accuracy
            ),
            (0.0, 0.0, 0.0, -1.0, -1.0, SensorAccuracy::Unknown)
        );
    }
}

mod initialize_orientation_reading {
    use super::*;

    #[test]
    fn restores_every_source_sentinel() {
        let mut out = create_orientation_reading();
        out.absolute = true;
        out.heading = 90.0;
        initialize_orientation_reading(&mut out);
        assert_eq!(
            (out.alpha, out.beta, out.gamma, out.heading, out.absolute),
            (0.0, 0.0, 0.0, -1.0, false)
        );
        assert_eq!(
            (out.interval, out.timestamp, out.accuracy),
            (-1.0, -1.0, SensorAccuracy::Unknown)
        );
    }
}

mod initialize_pressure_reading {
    use super::*;

    #[test]
    fn restores_every_source_sentinel() {
        let mut out = create_pressure_reading();
        out.pressure = 1013.0;
        initialize_pressure_reading(&mut out);
        assert_eq!(
            (
                out.altitude,
                out.pressure,
                out.interval,
                out.timestamp,
                out.accuracy
            ),
            (-1.0, 0.0, -1.0, -1.0, SensorAccuracy::Unknown)
        );
    }
}

mod initialize_proximity_reading {
    use super::*;

    #[test]
    fn restores_every_source_sentinel() {
        let mut out = create_proximity_reading();
        out.near = true;
        initialize_proximity_reading(&mut out);
        assert_eq!(
            (
                out.distance,
                out.max,
                out.near,
                out.interval,
                out.timestamp,
                out.accuracy
            ),
            (-1.0, -1.0, false, -1.0, -1.0, SensorAccuracy::Unknown)
        );
    }
}

mod initialize_quaternion_reading {
    use super::*;

    #[test]
    fn restores_identity_and_every_source_sentinel() {
        let mut out = create_quaternion_reading();
        out.w = 0.0;
        out.x = 1.0;
        initialize_quaternion_reading(&mut out);
        assert_eq!((out.w, out.x, out.y, out.z), (1.0, 0.0, 0.0, 0.0));
        assert_eq!(
            (out.interval, out.timestamp, out.accuracy),
            (-1.0, -1.0, SensorAccuracy::Unknown)
        );
    }
}

mod initialize_rotation_rate_reading {
    use super::*;

    #[test]
    fn restores_every_source_sentinel() {
        let mut out = create_rotation_rate_reading();
        out.alpha = 5.0;
        initialize_rotation_rate_reading(&mut out);
        assert_eq!(
            (
                out.alpha,
                out.beta,
                out.gamma,
                out.interval,
                out.timestamp,
                out.accuracy
            ),
            (0.0, 0.0, 0.0, -1.0, -1.0, SensorAccuracy::Unknown)
        );
    }
}

mod initialize_sensors {
    use super::*;

    #[test]
    fn replaces_signals_and_detaches_an_existing_bundle() {
        let state = Arc::new(ProviderState::new());
        let mut out = create_sensors();
        attach_sensors(&provider(&state), &mut out);
        initialize_sensors(&mut out);
        assert!(!has_entity_binding(&out));
        assert!(!has_signal_slots(&out.on_accelerometer));
    }
}

mod is_sensors_supported {
    use super::*;

    #[test]
    fn delegates_to_motion_support() {
        let state = Arc::new(ProviderState::new());
        assert!(!is_sensors_supported(&provider(&state)));
        state.support.lock().unwrap().motion = true;
        assert!(is_sensors_supported(&provider(&state)));
    }
}

mod request_sensors_permission {
    use super::*;

    #[test]
    fn forwards_the_boolean_and_preserves_rejection() {
        let state = Arc::new(ProviderState::new());
        *state.request_result.lock().unwrap() = false;
        let host = provider(&state);
        assert_eq!(block_on(request_sensors_permission(&host)), Ok(false));
        let error = rejected("permission request failed");
        *state.request_error.lock().unwrap() = Some(error.clone());
        assert_eq!(block_on(request_sensors_permission(&host)), Err(error));
    }
}
