//! `flighthq-sensors` — device motion and orientation sensor readings and
//! signals over a swappable web/native backend.
//!
//! The [`Sensors`] entity holds four signals that fire with live accelerometer,
//! gyroscope, magnetometer, and orientation readings. Call [`attach_sensors`]
//! to wire up the active backend, and [`detach_sensors`] or
//! [`dispose_sensors`] to stop delivery.

pub mod sensors;

pub use sensors::{
    attach_sensors, create_motion_reading, create_orientation_reading, create_sensors,
    detach_sensors, dispose_sensors, get_sensors_backend, request_sensors_permission,
    set_sensors_backend,
};
