mod host_explain;
mod sensors;
mod types;

pub mod contract;

// Public lane: the pinned TS `index.ts` functions plus the locally owned types their signatures use.
// Reading constructors, construction initializers and D9e string helpers stay contract-only.
pub use contract::attach_sensors;
pub use contract::compute_euler_from_quaternion;
pub use contract::compute_gravity_from_orientation;
pub use contract::compute_quaternion_from_orientation_reading;
pub use contract::compute_rotation_matrix_from_quaternion;
pub use contract::compute_screen_relative_orientation;
pub use contract::compute_world_acceleration_from_device_acceleration;
pub use contract::create_sensors;
pub use contract::detach_sensors;
pub use contract::dispose_sensors;
pub use contract::get_sensors_permission_state;
pub use contract::has_accelerometer;
pub use contract::has_ambient_light_sensor;
pub use contract::has_barometer;
pub use contract::has_gravity_sensor;
pub use contract::has_gyroscope;
pub use contract::has_linear_acceleration_sensor;
pub use contract::has_magnetometer;
pub use contract::has_orientation_sensor;
pub use contract::has_proximity_sensor;
pub use contract::is_sensors_supported;
pub use contract::request_sensors_permission;

pub use contract::AmbientLightListener;
pub use contract::AmbientLightReading;
pub use contract::HostSensorsCapabilities;
pub use contract::HostSensorsCapability;
pub use contract::MotionListener;
pub use contract::MotionReading;
pub use contract::OrientationListener;
pub use contract::OrientationReading;
pub use contract::PressureListener;
pub use contract::PressureReading;
pub use contract::ProviderRef;
pub use contract::ProximityListener;
pub use contract::ProximityReading;
pub use contract::QuaternionListener;
pub use contract::QuaternionReading;
pub use contract::RotationMotionListener;
pub use contract::RotationRateReading;
pub use contract::SensorAccuracy;
pub use contract::SensorReading;
pub use contract::SensorSubscribeOptions;
pub use contract::SensorUnsubscribe;
pub use contract::Sensors;
pub use contract::SensorsPermissionRequestFuture;
pub use contract::SensorsPermissionRequestResult;
pub use contract::SensorsPermissionSensor;
pub use contract::SensorsPermissionState;
pub use contract::SensorsPermissionStateFuture;
pub use contract::SensorsPermissionStateResult;

#[cfg(test)]
pub(crate) mod test_support {
    use std::future::Future;
    use std::task::{Context, Poll, Waker};

    pub(crate) fn block_on<F: Future>(future: F) -> F::Output {
        let mut future = Box::pin(future);
        let mut context = Context::from_waker(Waker::noop());
        loop {
            match future.as_mut().poll(&mut context) {
                Poll::Ready(value) => return value,
                Poll::Pending => std::thread::yield_now(),
            }
        }
    }
}
