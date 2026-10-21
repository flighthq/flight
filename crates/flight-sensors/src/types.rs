use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, FlightError};
use flight_signals::Signal;

pub use flight_hostcapability::ProviderRef;

/// Reported confidence of a sensor reading (TS `SensorAccuracy`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum SensorAccuracy {
    High,
    Low,
    Medium,
    #[default]
    Unknown,
}

/// Current permission state for a gated sensor (TS `SensorsPermissionState`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SensorsPermissionState {
    Denied,
    Granted,
    Prompt,
    Unsupported,
}

/// The optional gated-sensor selector accepted by `getSensorsPermissionState`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SensorsPermissionSensor {
    Magnetometer,
    Motion,
    Orientation,
}

/// Options for one provider subscription. `frequency` is requested hertz when supported.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SensorSubscribeOptions {
    pub frequency: Option<f32>,
}

/// Fields shared by every reading. This source base interface is plain data; concrete reading
/// entities flatten these fields so their public shapes remain identical to the TS interfaces.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SensorReading {
    pub accuracy: SensorAccuracy,
    pub interval: f32,
    pub timestamp: f32,
}

/// Ambient illuminance in lux (TS `AmbientLightReading`, an Entity).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct AmbientLightReading {
    runtime: EntityRuntimeSlot,
    pub accuracy: SensorAccuracy,
    pub illuminance: f32,
    pub interval: f32,
    pub timestamp: f32,
}

/// A three-axis acceleration, gravity or magnetic-field reading (TS `MotionReading`, an Entity).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct MotionReading {
    runtime: EntityRuntimeSlot,
    pub accuracy: SensorAccuracy,
    pub interval: f32,
    pub timestamp: f32,
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

/// Device orientation as ZXY Euler angles in degrees (TS `OrientationReading`, an Entity).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct OrientationReading {
    runtime: EntityRuntimeSlot,
    pub absolute: bool,
    pub accuracy: SensorAccuracy,
    pub alpha: f32,
    pub beta: f32,
    pub gamma: f32,
    pub heading: f32,
    pub interval: f32,
    pub timestamp: f32,
}

/// Barometric pressure and its derived altitude (TS `PressureReading`, an Entity).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct PressureReading {
    runtime: EntityRuntimeSlot,
    pub accuracy: SensorAccuracy,
    pub altitude: f32,
    pub interval: f32,
    pub pressure: f32,
    pub timestamp: f32,
}

/// Near/far proximity plus optional distances in centimeters (TS `ProximityReading`, an Entity).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ProximityReading {
    runtime: EntityRuntimeSlot,
    pub accuracy: SensorAccuracy,
    pub distance: f32,
    pub interval: f32,
    pub max: f32,
    pub near: bool,
    pub timestamp: f32,
}

/// Device orientation as a unit quaternion (TS `QuaternionReading`, an Entity).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct QuaternionReading {
    runtime: EntityRuntimeSlot,
    pub accuracy: SensorAccuracy,
    pub interval: f32,
    pub timestamp: f32,
    pub w: f32,
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

/// Angular velocity in degrees per second (TS `RotationRateReading`, an Entity).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct RotationRateReading {
    runtime: EntityRuntimeSlot,
    pub accuracy: SensorAccuracy,
    pub alpha: f32,
    pub beta: f32,
    pub gamma: f32,
    pub interval: f32,
    pub timestamp: f32,
}

/// The exact release returned by one provider subscription.
pub type SensorUnsubscribe = Arc<dyn Fn() + Send + Sync>;

/// One scratch-reading listener. Providers may reuse the reading after the call returns.
pub type AmbientLightListener = Arc<dyn Fn(&AmbientLightReading) + Send + Sync>;
pub type MotionListener = Arc<dyn Fn(&MotionReading) + Send + Sync>;
pub type OrientationListener = Arc<dyn Fn(&OrientationReading) + Send + Sync>;
pub type PressureListener = Arc<dyn Fn(&PressureReading) + Send + Sync>;
pub type ProximityListener = Arc<dyn Fn(&ProximityReading) + Send + Sync>;
pub type QuaternionListener = Arc<dyn Fn(&QuaternionReading) + Send + Sync>;
pub type RotationMotionListener = Arc<dyn Fn(&MotionReading, &RotationRateReading) + Send + Sync>;

/// Permission-state provider result. `Err` is the original rejected-Promise payload.
// flight-lint: allow(contract-vocabulary) D15/D10: Result preserves a rejected permission Promise as FlightError
pub type SensorsPermissionStateResult = Result<SensorsPermissionState, FlightError>;

/// Boxed Send future returned by `get_permission_state` (D15).
pub type SensorsPermissionStateFuture =
    Pin<Box<dyn Future<Output = SensorsPermissionStateResult> + Send>>;

/// Permission-request provider result. `Err` is the original rejected-Promise payload.
// flight-lint: allow(contract-vocabulary) D15/D10: Result preserves a rejected permission Promise as FlightError
pub type SensorsPermissionRequestResult = Result<bool, FlightError>;

/// Boxed Send future returned by `request_permission` (D15).
pub type SensorsPermissionRequestFuture =
    Pin<Box<dyn Future<Output = SensorsPermissionRequestResult> + Send>>;

/// Host sensor queries and streams (TS `HostSensorsCapability`). The provider owns scratch
/// readings and invokes listeners synchronously; every subscribe returns its exact release.
#[derive(Clone)]
pub struct HostSensorsCapability {
    pub get_permission_state:
        Arc<dyn Fn(Option<SensorsPermissionSensor>) -> SensorsPermissionStateFuture + Send + Sync>,
    pub is_ambient_light_supported: Arc<dyn Fn() -> bool + Send + Sync>,
    pub is_barometer_supported: Arc<dyn Fn() -> bool + Send + Sync>,
    pub is_gravity_supported: Arc<dyn Fn() -> bool + Send + Sync>,
    pub is_gyroscope_supported: Arc<dyn Fn() -> bool + Send + Sync>,
    pub is_linear_acceleration_supported: Arc<dyn Fn() -> bool + Send + Sync>,
    pub is_magnetometer_supported: Arc<dyn Fn() -> bool + Send + Sync>,
    pub is_motion_supported: Arc<dyn Fn() -> bool + Send + Sync>,
    pub is_orientation_supported: Arc<dyn Fn() -> bool + Send + Sync>,
    pub is_proximity_supported: Arc<dyn Fn() -> bool + Send + Sync>,
    pub provider: ProviderRef,
    pub request_permission: Arc<dyn Fn() -> SensorsPermissionRequestFuture + Send + Sync>,
    pub subscribe_absolute_orientation: Arc<
        dyn Fn(OrientationListener, Option<SensorSubscribeOptions>) -> SensorUnsubscribe
            + Send
            + Sync,
    >,
    pub subscribe_ambient_light: Arc<
        dyn Fn(AmbientLightListener, Option<SensorSubscribeOptions>) -> SensorUnsubscribe
            + Send
            + Sync,
    >,
    pub subscribe_barometer: Arc<
        dyn Fn(PressureListener, Option<SensorSubscribeOptions>) -> SensorUnsubscribe + Send + Sync,
    >,
    pub subscribe_gravity: Arc<
        dyn Fn(MotionListener, Option<SensorSubscribeOptions>) -> SensorUnsubscribe + Send + Sync,
    >,
    pub subscribe_linear_acceleration: Arc<
        dyn Fn(MotionListener, Option<SensorSubscribeOptions>) -> SensorUnsubscribe + Send + Sync,
    >,
    pub subscribe_magnetometer: Arc<
        dyn Fn(MotionListener, Option<SensorSubscribeOptions>) -> SensorUnsubscribe + Send + Sync,
    >,
    pub subscribe_motion: Arc<
        dyn Fn(RotationMotionListener, Option<SensorSubscribeOptions>) -> SensorUnsubscribe
            + Send
            + Sync,
    >,
    pub subscribe_orientation: Arc<
        dyn Fn(OrientationListener, Option<SensorSubscribeOptions>) -> SensorUnsubscribe
            + Send
            + Sync,
    >,
    pub subscribe_proximity: Arc<
        dyn Fn(ProximityListener, Option<SensorSubscribeOptions>) -> SensorUnsubscribe
            + Send
            + Sync,
    >,
    pub subscribe_quaternion: Arc<
        dyn Fn(QuaternionListener, Option<SensorSubscribeOptions>) -> SensorUnsubscribe
            + Send
            + Sync,
    >,
}

/// Optional aggregate slot owned by `HostSensorsCapabilities` in `Host.ts`.
#[derive(Clone, Default)]
pub struct HostSensorsCapabilities {
    pub query: Option<HostSensorsCapability>,
}

/// Device sensor event entity. Its runtime binding owns the active provider release bundle.
#[derive(Default)]
pub struct Sensors {
    runtime: EntityRuntimeSlot,
    pub on_absolute_orientation: Signal<OrientationReading>,
    pub on_accelerometer: Signal<MotionReading>,
    pub on_ambient_light: Signal<AmbientLightReading>,
    pub on_barometer: Signal<PressureReading>,
    pub on_gravity: Signal<MotionReading>,
    pub on_gyroscope: Signal<RotationRateReading>,
    pub on_linear_acceleration: Signal<MotionReading>,
    pub on_magnetometer: Signal<MotionReading>,
    pub on_orientation: Signal<OrientationReading>,
    pub on_proximity: Signal<ProximityReading>,
    pub on_quaternion: Signal<QuaternionReading>,
}

/// Exact releases held by one attached Sensors entity. The field order follows unsubscribe order.
#[derive(Clone)]
pub(crate) struct SensorsSubscription {
    pub(crate) absolute_orientation: SensorUnsubscribe,
    pub(crate) ambient_light: SensorUnsubscribe,
    pub(crate) barometer: SensorUnsubscribe,
    pub(crate) gravity: SensorUnsubscribe,
    pub(crate) linear_acceleration: SensorUnsubscribe,
    pub(crate) magnetometer: SensorUnsubscribe,
    pub(crate) motion: SensorUnsubscribe,
    pub(crate) orientation: SensorUnsubscribe,
    pub(crate) proximity: SensorUnsubscribe,
    pub(crate) quaternion: SensorUnsubscribe,
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS SensorAccuracy string union
pub fn get_sensor_accuracy_string(value: SensorAccuracy) -> &'static str {
    return match value {
        SensorAccuracy::High => "high",
        SensorAccuracy::Low => "low",
        SensorAccuracy::Medium => "medium",
        SensorAccuracy::Unknown => "unknown",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the optional TS gated-sensor string union
pub fn get_sensors_permission_sensor_string(value: SensorsPermissionSensor) -> &'static str {
    return match value {
        SensorsPermissionSensor::Magnetometer => "magnetometer",
        SensorsPermissionSensor::Motion => "motion",
        SensorsPermissionSensor::Orientation => "orientation",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS SensorsPermissionState string union
pub fn get_sensors_permission_state_string(value: SensorsPermissionState) -> &'static str {
    return match value {
        SensorsPermissionState::Denied => "denied",
        SensorsPermissionState::Granted => "granted",
        SensorsPermissionState::Prompt => "prompt",
        SensorsPermissionState::Unsupported => "unsupported",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS SensorAccuracy string union
pub fn parse_sensor_accuracy(value: &str) -> Option<SensorAccuracy> {
    return match value {
        "high" => Some(SensorAccuracy::High),
        "low" => Some(SensorAccuracy::Low),
        "medium" => Some(SensorAccuracy::Medium),
        "unknown" => Some(SensorAccuracy::Unknown),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the optional TS gated-sensor string union
pub fn parse_sensors_permission_sensor(value: &str) -> Option<SensorsPermissionSensor> {
    return match value {
        "magnetometer" => Some(SensorsPermissionSensor::Magnetometer),
        "motion" => Some(SensorsPermissionSensor::Motion),
        "orientation" => Some(SensorsPermissionSensor::Orientation),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS SensorsPermissionState string union
pub fn parse_sensors_permission_state(value: &str) -> Option<SensorsPermissionState> {
    return match value {
        "denied" => Some(SensorsPermissionState::Denied),
        "granted" => Some(SensorsPermissionState::Granted),
        "prompt" => Some(SensorsPermissionState::Prompt),
        "unsupported" => Some(SensorsPermissionState::Unsupported),
        _ => None,
    };
}

flight_entity::impl_entity!(AmbientLightReading);
flight_entity::impl_entity!(MotionReading);
flight_entity::impl_entity!(OrientationReading);
flight_entity::impl_entity!(PressureReading);
flight_entity::impl_entity!(ProximityReading);
flight_entity::impl_entity!(QuaternionReading);
flight_entity::impl_entity!(RotationRateReading);
flight_entity::impl_entity!(Sensors);
