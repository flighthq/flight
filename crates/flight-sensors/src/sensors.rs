use std::sync::Arc;

use flight_entity::{
    allocate_entity, attach_entity_binding, detach_entity_binding, get_entity_binding_as,
};
use flight_math::{DEG_TO_RAD, RAD_TO_DEG};
use flight_signals::{create_signal, emit_signal};

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::{Arc, Mutex};

    use flight_signals::has_signal_slots;

    use super::*;
    use crate::test_support::block_on;

    fn release(counts: &Arc<Mutex<[usize; 2]>>) -> SensorUnsubscribe {
        counts.lock().unwrap()[0] += 1;
        let captured = counts.clone();
        return Arc::new(move || captured.lock().unwrap()[1] += 1);
    }

    fn host(counts: Arc<Mutex<[usize; 2]>>) -> HostSensorsCapability {
        let absolute = counts.clone();
        let ambient = counts.clone();
        let barometer = counts.clone();
        let gravity = counts.clone();
        let linear = counts.clone();
        let magnetometer = counts.clone();
        let motion = counts.clone();
        let orientation = counts.clone();
        let proximity = counts.clone();
        let quaternion = counts.clone();
        return HostSensorsCapability {
            get_permission_state: Arc::new(|_sensor| {
                return Box::pin(async { Ok(SensorsPermissionState::Prompt) });
            }),
            is_ambient_light_supported: Arc::new(|| true),
            is_barometer_supported: Arc::new(|| true),
            is_gravity_supported: Arc::new(|| true),
            is_gyroscope_supported: Arc::new(|| true),
            is_linear_acceleration_supported: Arc::new(|| true),
            is_magnetometer_supported: Arc::new(|| true),
            is_motion_supported: Arc::new(|| true),
            is_orientation_supported: Arc::new(|| true),
            is_proximity_supported: Arc::new(|| true),
            request_permission: Arc::new(|| return Box::pin(async { Ok(true) })),
            subscribe_absolute_orientation: Arc::new(move |_listener, _options| {
                return release(&absolute);
            }),
            subscribe_ambient_light: Arc::new(move |_listener, _options| {
                return release(&ambient);
            }),
            subscribe_barometer: Arc::new(move |_listener, _options| {
                return release(&barometer);
            }),
            subscribe_gravity: Arc::new(move |_listener, _options| {
                return release(&gravity);
            }),
            subscribe_linear_acceleration: Arc::new(move |_listener, _options| {
                return release(&linear);
            }),
            subscribe_magnetometer: Arc::new(move |_listener, _options| {
                return release(&magnetometer);
            }),
            subscribe_motion: Arc::new(move |_listener, _options| {
                return release(&motion);
            }),
            subscribe_orientation: Arc::new(move |_listener, _options| {
                return release(&orientation);
            }),
            subscribe_proximity: Arc::new(move |_listener, _options| {
                return release(&proximity);
            }),
            subscribe_quaternion: Arc::new(move |_listener, _options| {
                return release(&quaternion);
            }),
        };
    }

    #[test]
    fn ambient_light_reading_new_matches_create_ambient_light_reading() {
        assert_eq!(AmbientLightReading::new(), create_ambient_light_reading());
    }

    #[test]
    fn host_get_permission_state_matches_get_sensors_permission_state() {
        let host = host(Arc::new(Mutex::new([0; 2])));
        assert_eq!(
            block_on(host.get_permission_state(Some(SensorsPermissionSensor::Motion))),
            block_on(get_sensors_permission_state(
                &host,
                Some(SensorsPermissionSensor::Motion)
            ))
        );
    }

    #[test]
    fn host_has_accelerometer_matches_has_accelerometer() {
        let host = host(Arc::new(Mutex::new([0; 2])));
        assert_eq!(host.has_accelerometer(), has_accelerometer(&host));
        assert!(host.has_accelerometer());
    }

    #[test]
    fn host_has_ambient_light_sensor_matches_has_ambient_light_sensor() {
        let host = host(Arc::new(Mutex::new([0; 2])));
        assert_eq!(
            host.has_ambient_light_sensor(),
            has_ambient_light_sensor(&host)
        );
        assert!(host.has_ambient_light_sensor());
    }

    #[test]
    fn host_has_barometer_matches_has_barometer() {
        let host = host(Arc::new(Mutex::new([0; 2])));
        assert_eq!(host.has_barometer(), has_barometer(&host));
        assert!(host.has_barometer());
    }

    #[test]
    fn host_has_gravity_sensor_matches_has_gravity_sensor() {
        let host = host(Arc::new(Mutex::new([0; 2])));
        assert_eq!(host.has_gravity_sensor(), has_gravity_sensor(&host));
        assert!(host.has_gravity_sensor());
    }

    #[test]
    fn host_has_gyroscope_matches_has_gyroscope() {
        let host = host(Arc::new(Mutex::new([0; 2])));
        assert_eq!(host.has_gyroscope(), has_gyroscope(&host));
        assert!(host.has_gyroscope());
    }

    #[test]
    fn host_has_linear_acceleration_sensor_matches_has_linear_acceleration_sensor() {
        let host = host(Arc::new(Mutex::new([0; 2])));
        assert_eq!(
            host.has_linear_acceleration_sensor(),
            has_linear_acceleration_sensor(&host)
        );
        assert!(host.has_linear_acceleration_sensor());
    }

    #[test]
    fn host_has_magnetometer_matches_has_magnetometer() {
        let host = host(Arc::new(Mutex::new([0; 2])));
        assert_eq!(host.has_magnetometer(), has_magnetometer(&host));
        assert!(host.has_magnetometer());
    }

    #[test]
    fn host_has_orientation_sensor_matches_has_orientation_sensor() {
        let host = host(Arc::new(Mutex::new([0; 2])));
        assert_eq!(host.has_orientation_sensor(), has_orientation_sensor(&host));
        assert!(host.has_orientation_sensor());
    }

    #[test]
    fn host_has_proximity_sensor_matches_has_proximity_sensor() {
        let host = host(Arc::new(Mutex::new([0; 2])));
        assert_eq!(host.has_proximity_sensor(), has_proximity_sensor(&host));
        assert!(host.has_proximity_sensor());
    }

    #[test]
    fn host_is_supported_matches_is_sensors_supported() {
        let host = host(Arc::new(Mutex::new([0; 2])));
        assert_eq!(host.is_supported(), is_sensors_supported(&host));
        assert!(host.is_supported());
    }

    #[test]
    fn host_request_permission_matches_request_sensors_permission() {
        let host = host(Arc::new(Mutex::new([0; 2])));
        assert_eq!(
            block_on(host.request_permission()),
            block_on(request_sensors_permission(&host))
        );
    }

    #[test]
    fn motion_reading_new_matches_create_motion_reading() {
        assert_eq!(MotionReading::new(), create_motion_reading());
    }

    #[test]
    fn orientation_reading_new_matches_create_orientation_reading() {
        assert_eq!(OrientationReading::new(), create_orientation_reading());
    }

    #[test]
    fn pressure_reading_new_matches_create_pressure_reading() {
        assert_eq!(PressureReading::new(), create_pressure_reading());
    }

    #[test]
    fn proximity_reading_new_matches_create_proximity_reading() {
        assert_eq!(ProximityReading::new(), create_proximity_reading());
    }

    #[test]
    fn quaternion_reading_new_matches_create_quaternion_reading() {
        assert_eq!(QuaternionReading::new(), create_quaternion_reading());
    }

    #[test]
    fn rotation_rate_reading_new_matches_create_rotation_rate_reading() {
        assert_eq!(RotationRateReading::new(), create_rotation_rate_reading());
    }

    #[test]
    fn sensors_attach_matches_attach_sensors() {
        let method_counts = Arc::new(Mutex::new([0; 2]));
        let free_counts = Arc::new(Mutex::new([0; 2]));
        let mut via_method = create_sensors();
        let mut via_free = create_sensors();
        via_method.attach(&host(method_counts.clone()));
        attach_sensors(&host(free_counts.clone()), &mut via_free);
        assert_eq!(*method_counts.lock().unwrap(), *free_counts.lock().unwrap());
        assert_eq!(method_counts.lock().unwrap()[0], 10);
    }

    #[test]
    fn sensors_detach_matches_detach_sensors() {
        let method_counts = Arc::new(Mutex::new([0; 2]));
        let free_counts = Arc::new(Mutex::new([0; 2]));
        let mut via_method = create_sensors();
        let mut via_free = create_sensors();
        attach_sensors(&host(method_counts.clone()), &mut via_method);
        attach_sensors(&host(free_counts.clone()), &mut via_free);
        via_method.detach();
        detach_sensors(&mut via_free);
        assert_eq!(*method_counts.lock().unwrap(), *free_counts.lock().unwrap());
        assert_eq!(method_counts.lock().unwrap()[1], 10);
    }

    #[test]
    fn sensors_dispose_matches_dispose_sensors() {
        let method_counts = Arc::new(Mutex::new([0; 2]));
        let free_counts = Arc::new(Mutex::new([0; 2]));
        let mut via_method = create_sensors();
        let mut via_free = create_sensors();
        attach_sensors(&host(method_counts.clone()), &mut via_method);
        attach_sensors(&host(free_counts.clone()), &mut via_free);
        via_method.dispose();
        dispose_sensors(&mut via_free);
        assert_eq!(*method_counts.lock().unwrap(), *free_counts.lock().unwrap());
        assert_eq!(method_counts.lock().unwrap()[1], 10);
    }

    #[test]
    fn sensors_new_matches_create_sensors() {
        let via_method = Sensors::new();
        let via_free = create_sensors();
        assert_eq!(
            has_signal_slots(&via_method.on_accelerometer),
            has_signal_slots(&via_free.on_accelerometer)
        );
        assert!(!has_signal_slots(&via_method.on_accelerometer));
    }
}

/// Allocates an ambient-light reading with source sentinel values.
pub fn create_ambient_light_reading() -> AmbientLightReading {
    let mut out: AmbientLightReading = allocate_entity();
    initialize_ambient_light_reading(&mut out);
    return out;
}

/// Allocates a three-axis reading with source sentinel values.
pub fn create_motion_reading() -> MotionReading {
    let mut out: MotionReading = allocate_entity();
    initialize_motion_reading(&mut out);
    return out;
}

/// Allocates an Euler-orientation reading with source sentinel values.
pub fn create_orientation_reading() -> OrientationReading {
    let mut out: OrientationReading = allocate_entity();
    initialize_orientation_reading(&mut out);
    return out;
}

/// Allocates a pressure reading with source sentinel values.
pub fn create_pressure_reading() -> PressureReading {
    let mut out: PressureReading = allocate_entity();
    initialize_pressure_reading(&mut out);
    return out;
}

/// Allocates a proximity reading with source sentinel values.
pub fn create_proximity_reading() -> ProximityReading {
    let mut out: ProximityReading = allocate_entity();
    initialize_proximity_reading(&mut out);
    return out;
}

/// Allocates an identity quaternion reading with source sentinel metadata.
pub fn create_quaternion_reading() -> QuaternionReading {
    let mut out: QuaternionReading = allocate_entity();
    initialize_quaternion_reading(&mut out);
    return out;
}

/// Allocates an angular-velocity reading with source sentinel values.
pub fn create_rotation_rate_reading() -> RotationRateReading {
    let mut out: RotationRateReading = allocate_entity();
    initialize_rotation_rate_reading(&mut out);
    return out;
}

/// Allocates an inert sensor event entity. Attach a host to begin delivery.
pub fn create_sensors() -> Sensors {
    let mut out: Sensors = allocate_entity();
    initialize_sensors(&mut out);
    return out;
}

/// Initializes an ambient-light reading to zero with unknown metadata.
pub fn initialize_ambient_light_reading(out: &mut AmbientLightReading) {
    out.accuracy = SensorAccuracy::Unknown;
    out.illuminance = 0.0;
    out.interval = -1.0;
    out.timestamp = -1.0;
}

/// Initializes a three-axis reading to zero with unknown metadata.
pub fn initialize_motion_reading(out: &mut MotionReading) {
    out.accuracy = SensorAccuracy::Unknown;
    out.interval = -1.0;
    out.timestamp = -1.0;
    out.x = 0.0;
    out.y = 0.0;
    out.z = 0.0;
}

/// Initializes an Euler reading to a relative zero rotation with unknown heading and metadata.
pub fn initialize_orientation_reading(out: &mut OrientationReading) {
    out.absolute = false;
    out.accuracy = SensorAccuracy::Unknown;
    out.alpha = 0.0;
    out.beta = 0.0;
    out.gamma = 0.0;
    out.heading = -1.0;
    out.interval = -1.0;
    out.timestamp = -1.0;
}

/// Initializes a pressure reading with zero pressure and unknown altitude and metadata.
pub fn initialize_pressure_reading(out: &mut PressureReading) {
    out.accuracy = SensorAccuracy::Unknown;
    out.altitude = -1.0;
    out.interval = -1.0;
    out.pressure = 0.0;
    out.timestamp = -1.0;
}

/// Initializes a proximity reading with a far state and unknown distances and metadata.
pub fn initialize_proximity_reading(out: &mut ProximityReading) {
    out.accuracy = SensorAccuracy::Unknown;
    out.distance = -1.0;
    out.interval = -1.0;
    out.max = -1.0;
    out.near = false;
    out.timestamp = -1.0;
}

/// Initializes a quaternion reading to identity with unknown metadata.
pub fn initialize_quaternion_reading(out: &mut QuaternionReading) {
    out.accuracy = SensorAccuracy::Unknown;
    out.interval = -1.0;
    out.timestamp = -1.0;
    out.w = 1.0;
    out.x = 0.0;
    out.y = 0.0;
    out.z = 0.0;
}

/// Initializes an angular-velocity reading to zero with unknown metadata.
pub fn initialize_rotation_rate_reading(out: &mut RotationRateReading) {
    out.accuracy = SensorAccuracy::Unknown;
    out.alpha = 0.0;
    out.beta = 0.0;
    out.gamma = 0.0;
    out.interval = -1.0;
    out.timestamp = -1.0;
}

/// Gives a Sensors entity eleven fresh inert signals and no provider binding.
pub fn initialize_sensors(out: &mut Sensors) {
    out.on_absolute_orientation = create_signal();
    out.on_accelerometer = create_signal();
    out.on_ambient_light = create_signal();
    out.on_barometer = create_signal();
    out.on_gravity = create_signal();
    out.on_gyroscope = create_signal();
    out.on_linear_acceleration = create_signal();
    out.on_magnetometer = create_signal();
    out.on_orientation = create_signal();
    out.on_proximity = create_signal();
    out.on_quaternion = create_signal();
    detach_entity_binding(out);
}

/// Subscribes all ten provider streams in source order. Reattaching first consumes the prior exact
/// release bundle. Readings are emitted by reference, so provider scratch identity is preserved.
pub fn attach_sensors(host_sensors: &HostSensorsCapability, sensors: &mut Sensors) {
    detach_sensors(sensors);

    let on_accelerometer = sensors.on_accelerometer.clone();
    let on_gyroscope = sensors.on_gyroscope.clone();
    let motion = (host_sensors.subscribe_motion)(
        Arc::new(
            move |acceleration: &MotionReading, rotation_rate: &RotationRateReading| {
                emit_signal(&on_accelerometer, acceleration);
                emit_signal(&on_gyroscope, rotation_rate);
            },
        ),
        None,
    );

    let on_linear_acceleration = sensors.on_linear_acceleration.clone();
    let linear_acceleration = (host_sensors.subscribe_linear_acceleration)(
        Arc::new(move |reading: &MotionReading| {
            emit_signal(&on_linear_acceleration, reading);
        }),
        None,
    );

    let on_gravity = sensors.on_gravity.clone();
    let gravity = (host_sensors.subscribe_gravity)(
        Arc::new(move |reading: &MotionReading| emit_signal(&on_gravity, reading)),
        None,
    );

    let on_orientation = sensors.on_orientation.clone();
    let orientation = (host_sensors.subscribe_orientation)(
        Arc::new(move |reading: &OrientationReading| {
            emit_signal(&on_orientation, reading);
        }),
        None,
    );

    let on_absolute_orientation = sensors.on_absolute_orientation.clone();
    let absolute_orientation = (host_sensors.subscribe_absolute_orientation)(
        Arc::new(move |reading: &OrientationReading| {
            emit_signal(&on_absolute_orientation, reading);
        }),
        None,
    );

    let on_magnetometer = sensors.on_magnetometer.clone();
    let magnetometer = (host_sensors.subscribe_magnetometer)(
        Arc::new(move |reading: &MotionReading| emit_signal(&on_magnetometer, reading)),
        None,
    );

    let on_ambient_light = sensors.on_ambient_light.clone();
    let ambient_light = (host_sensors.subscribe_ambient_light)(
        Arc::new(move |reading: &AmbientLightReading| {
            emit_signal(&on_ambient_light, reading);
        }),
        None,
    );

    let on_barometer = sensors.on_barometer.clone();
    let barometer = (host_sensors.subscribe_barometer)(
        Arc::new(move |reading: &PressureReading| emit_signal(&on_barometer, reading)),
        None,
    );

    let on_proximity = sensors.on_proximity.clone();
    let proximity = (host_sensors.subscribe_proximity)(
        Arc::new(move |reading: &ProximityReading| emit_signal(&on_proximity, reading)),
        None,
    );

    let on_quaternion = sensors.on_quaternion.clone();
    let quaternion = (host_sensors.subscribe_quaternion)(
        Arc::new(move |reading: &QuaternionReading| emit_signal(&on_quaternion, reading)),
        None,
    );

    attach_entity_binding(
        sensors,
        Box::new(SensorsSubscription {
            absolute_orientation,
            ambient_light,
            barometer,
            gravity,
            linear_acceleration,
            magnetometer,
            motion,
            orientation,
            proximity,
            quaternion,
        }),
    );
}

/// Extracts ZXY Euler angles in degrees and propagates interval, timestamp and accuracy.
pub fn compute_euler_from_quaternion(out: &mut OrientationReading, quaternion: &QuaternionReading) {
    let x = quaternion.x;
    let y = quaternion.y;
    let z = quaternion.z;
    let w = quaternion.w;
    let interval = quaternion.interval;
    let timestamp = quaternion.timestamp;
    let accuracy = quaternion.accuracy;
    let sin_beta = 2.0 * (w * x - y * z);
    let beta = if sin_beta.abs() >= 1.0 {
        sin_beta.signum() * std::f32::consts::FRAC_PI_2
    } else {
        sin_beta.asin()
    };
    let alpha = (2.0 * (w * z + x * y)).atan2(1.0 - 2.0 * (x * x + z * z));
    let gamma = (2.0 * (w * y + x * z)).atan2(1.0 - 2.0 * (x * x + y * y));
    out.alpha = (alpha * RAD_TO_DEG).rem_euclid(360.0);
    out.beta = beta * RAD_TO_DEG;
    out.gamma = gamma * RAD_TO_DEG;
    out.interval = interval;
    out.timestamp = timestamp;
    out.accuracy = accuracy;
}

/// Computes the device-frame projection of standard gravity and propagates reading metadata.
pub fn compute_gravity_from_orientation(out: &mut MotionReading, orientation: &OrientationReading) {
    let beta = orientation.beta * DEG_TO_RAD;
    let gamma = orientation.gamma * DEG_TO_RAD;
    let interval = orientation.interval;
    let timestamp = orientation.timestamp;
    let accuracy = orientation.accuracy;
    let sin_gamma = gamma.sin();
    let cos_gamma = gamma.cos();
    let sin_beta = beta.sin();
    let cos_beta = beta.cos();
    const STANDARD_GRAVITY: f32 = 9.80665;
    out.x = STANDARD_GRAVITY * cos_beta * sin_gamma;
    out.y = -STANDARD_GRAVITY * sin_beta;
    out.z = STANDARD_GRAVITY * cos_beta * cos_gamma;
    out.interval = interval;
    out.timestamp = timestamp;
    out.accuracy = accuracy;
}

/// Computes a ZXY quaternion from Euler angles and propagates reading metadata.
pub fn compute_quaternion_from_orientation_reading(
    out: &mut QuaternionReading,
    orientation: &OrientationReading,
) {
    let alpha = orientation.alpha * DEG_TO_RAD * 0.5;
    let beta = orientation.beta * DEG_TO_RAD * 0.5;
    let gamma = orientation.gamma * DEG_TO_RAD * 0.5;
    let interval = orientation.interval;
    let timestamp = orientation.timestamp;
    let accuracy = orientation.accuracy;
    let cos_alpha = alpha.cos();
    let sin_alpha = alpha.sin();
    let cos_beta = beta.cos();
    let sin_beta = beta.sin();
    let cos_gamma = gamma.cos();
    let sin_gamma = gamma.sin();
    out.x = sin_alpha * sin_beta * cos_gamma - cos_alpha * cos_beta * sin_gamma;
    out.y = sin_alpha * cos_beta * sin_gamma + cos_alpha * sin_beta * cos_gamma;
    out.z = cos_alpha * cos_beta * sin_gamma - sin_alpha * sin_beta * cos_gamma;
    out.w = cos_alpha * cos_beta * cos_gamma + sin_alpha * sin_beta * sin_gamma;
    out.interval = interval;
    out.timestamp = timestamp;
    out.accuracy = accuracy;
}

/// Writes a column-major 3x3 rotation matrix. A short source `number[]` grows to nine entries.
pub fn compute_rotation_matrix_from_quaternion(out: &mut Vec<f32>, quaternion: &QuaternionReading) {
    let x = quaternion.x;
    let y = quaternion.y;
    let z = quaternion.z;
    let w = quaternion.w;
    let x2 = x + x;
    let y2 = y + y;
    let z2 = z + z;
    let xx = x * x2;
    let xy = x * y2;
    let xz = x * z2;
    let yy = y * y2;
    let yz = y * z2;
    let zz = z * z2;
    let wx = w * x2;
    let wy = w * y2;
    let wz = w * z2;
    if out.len() < 9 {
        out.resize(9, 0.0);
    }
    out[0] = 1.0 - (yy + zz);
    out[1] = xy + wz;
    out[2] = xz - wy;
    out[3] = xy - wz;
    out[4] = 1.0 - (xx + zz);
    out[5] = yz + wx;
    out[6] = xz + wy;
    out[7] = yz - wx;
    out[8] = 1.0 - (xx + yy);
}

/// Rotates beta and gamma into screen coordinates and propagates every other source field.
pub fn compute_screen_relative_orientation(
    out: &mut OrientationReading,
    orientation: &OrientationReading,
    screen_angle: f32,
) {
    let alpha = orientation.alpha;
    let beta = orientation.beta;
    let gamma = orientation.gamma;
    let absolute = orientation.absolute;
    let heading = orientation.heading;
    let interval = orientation.interval;
    let timestamp = orientation.timestamp;
    let accuracy = orientation.accuracy;
    let angle = screen_angle * DEG_TO_RAD;
    let sin_angle = angle.sin();
    let cos_angle = angle.cos();
    out.alpha = alpha;
    out.beta = beta * cos_angle - gamma * sin_angle;
    out.gamma = beta * sin_angle + gamma * cos_angle;
    out.absolute = absolute;
    out.heading = heading;
    out.interval = interval;
    out.timestamp = timestamp;
    out.accuracy = accuracy;
}

/// Applies the source quaternion vector-rotation formula and propagates acceleration metadata.
pub fn compute_world_acceleration_from_device_acceleration(
    out: &mut MotionReading,
    acceleration: &MotionReading,
    quaternion: &QuaternionReading,
) {
    let acceleration_x = acceleration.x;
    let acceleration_y = acceleration.y;
    let acceleration_z = acceleration.z;
    let interval = acceleration.interval;
    let timestamp = acceleration.timestamp;
    let accuracy = acceleration.accuracy;
    let quaternion_x = quaternion.x;
    let quaternion_y = quaternion.y;
    let quaternion_z = quaternion.z;
    let quaternion_w = quaternion.w;
    let twice_w = 2.0 * quaternion_w;
    let cross_x = quaternion_y * acceleration_z - quaternion_z * acceleration_y;
    let cross_y = quaternion_z * acceleration_x - quaternion_x * acceleration_z;
    let cross_z = quaternion_x * acceleration_y - quaternion_y * acceleration_x;
    let cross_cross_x = quaternion_y * cross_z - quaternion_z * cross_y;
    let cross_cross_y = quaternion_z * cross_x - quaternion_x * cross_z;
    let cross_cross_z = quaternion_x * cross_y - quaternion_y * cross_x;
    out.x = acceleration_x + twice_w * cross_x + 2.0 * cross_cross_x;
    out.y = acceleration_y + twice_w * cross_y + 2.0 * cross_cross_y;
    out.z = acceleration_z + twice_w * cross_z + 2.0 * cross_cross_z;
    out.interval = interval;
    out.timestamp = timestamp;
    out.accuracy = accuracy;
}

/// Invokes the attached releases in the source's exact order, stopping on the first throw. The
/// binding is forgotten only after every release returns, so a thrown release remains retryable.
pub fn detach_sensors(sensors: &mut Sensors) {
    let subscription = get_entity_binding_as::<SensorsSubscription, Sensors>(sensors).cloned();
    let Some(subscription) = subscription else {
        return;
    };
    (subscription.absolute_orientation)();
    (subscription.ambient_light)();
    (subscription.barometer)();
    (subscription.gravity)();
    (subscription.linear_acceleration)();
    (subscription.magnetometer)();
    (subscription.motion)();
    (subscription.orientation)();
    (subscription.proximity)();
    (subscription.quaternion)();
    detach_entity_binding(sensors);
}

/// Releases the provider subscriptions while leaving the signals as ordinary managed memory.
pub fn dispose_sensors(sensors: &mut Sensors) {
    detach_sensors(sensors);
}

/// Queries a permission state without prompting and preserves provider rejection unchanged.
// flight-lint: allow(contract-vocabulary) D15/D10: Result preserves the rejected TS Promise payload
pub async fn get_sensors_permission_state(
    host_sensors: &HostSensorsCapability,
    sensor: Option<SensorsPermissionSensor>,
) -> SensorsPermissionStateResult {
    return (host_sensors.get_permission_state)(sensor).await;
}

/// True when the combined accelerometer/motion stream is available.
pub fn has_accelerometer(host_sensors: &HostSensorsCapability) -> bool {
    return (host_sensors.is_motion_supported)();
}

/// True when ambient light sensing is available.
pub fn has_ambient_light_sensor(host_sensors: &HostSensorsCapability) -> bool {
    return (host_sensors.is_ambient_light_supported)();
}

/// True when barometric pressure sensing is available.
pub fn has_barometer(host_sensors: &HostSensorsCapability) -> bool {
    return (host_sensors.is_barometer_supported)();
}

/// True when a gravity vector stream is available.
pub fn has_gravity_sensor(host_sensors: &HostSensorsCapability) -> bool {
    return (host_sensors.is_gravity_supported)();
}

/// True when a rotation-rate stream is available.
pub fn has_gyroscope(host_sensors: &HostSensorsCapability) -> bool {
    return (host_sensors.is_gyroscope_supported)();
}

/// True when a gravity-removed acceleration stream is available.
pub fn has_linear_acceleration_sensor(host_sensors: &HostSensorsCapability) -> bool {
    return (host_sensors.is_linear_acceleration_supported)();
}

/// True when a magnetometer stream is available.
pub fn has_magnetometer(host_sensors: &HostSensorsCapability) -> bool {
    return (host_sensors.is_magnetometer_supported)();
}

/// True when an Euler-orientation stream is available.
pub fn has_orientation_sensor(host_sensors: &HostSensorsCapability) -> bool {
    return (host_sensors.is_orientation_supported)();
}

/// True when a proximity stream is available.
pub fn has_proximity_sensor(host_sensors: &HostSensorsCapability) -> bool {
    return (host_sensors.is_proximity_supported)();
}

/// True when either member of the combined motion stream is available.
pub fn is_sensors_supported(host_sensors: &HostSensorsCapability) -> bool {
    return (host_sensors.is_motion_supported)();
}

/// Requests gated sensor permission and preserves provider rejection unchanged.
// flight-lint: allow(contract-vocabulary) D15/D10: Result preserves the rejected TS Promise payload
pub async fn request_sensors_permission(
    host_sensors: &HostSensorsCapability,
) -> SensorsPermissionRequestResult {
    return (host_sensors.request_permission)().await;
}

impl AmbientLightReading {
    pub fn new() -> Self {
        return create_ambient_light_reading();
    }
}

impl HostSensorsCapability {
    pub async fn get_permission_state(
        &self,
        sensor: Option<SensorsPermissionSensor>,
    ) -> SensorsPermissionStateResult {
        return get_sensors_permission_state(self, sensor).await;
    }

    pub fn has_accelerometer(&self) -> bool {
        return has_accelerometer(self);
    }

    pub fn has_ambient_light_sensor(&self) -> bool {
        return has_ambient_light_sensor(self);
    }

    pub fn has_barometer(&self) -> bool {
        return has_barometer(self);
    }

    pub fn has_gravity_sensor(&self) -> bool {
        return has_gravity_sensor(self);
    }

    pub fn has_gyroscope(&self) -> bool {
        return has_gyroscope(self);
    }

    pub fn has_linear_acceleration_sensor(&self) -> bool {
        return has_linear_acceleration_sensor(self);
    }

    pub fn has_magnetometer(&self) -> bool {
        return has_magnetometer(self);
    }

    pub fn has_orientation_sensor(&self) -> bool {
        return has_orientation_sensor(self);
    }

    pub fn has_proximity_sensor(&self) -> bool {
        return has_proximity_sensor(self);
    }

    pub fn is_supported(&self) -> bool {
        return is_sensors_supported(self);
    }

    pub async fn request_permission(&self) -> SensorsPermissionRequestResult {
        return request_sensors_permission(self).await;
    }
}

impl MotionReading {
    pub fn new() -> Self {
        return create_motion_reading();
    }
}

impl OrientationReading {
    pub fn new() -> Self {
        return create_orientation_reading();
    }
}

impl PressureReading {
    pub fn new() -> Self {
        return create_pressure_reading();
    }
}

impl ProximityReading {
    pub fn new() -> Self {
        return create_proximity_reading();
    }
}

impl QuaternionReading {
    pub fn new() -> Self {
        return create_quaternion_reading();
    }
}

impl RotationRateReading {
    pub fn new() -> Self {
        return create_rotation_rate_reading();
    }
}

impl Sensors {
    pub fn new() -> Self {
        return create_sensors();
    }

    pub fn attach(&mut self, host_sensors: &HostSensorsCapability) {
        return attach_sensors(host_sensors, self);
    }

    pub fn detach(&mut self) {
        return detach_sensors(self);
    }

    pub fn dispose(&mut self) {
        return dispose_sensors(self);
    }
}
