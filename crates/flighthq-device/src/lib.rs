//! `flighthq-device` — static device and OS identity over a swappable backend.
//!
//! Free functions report the device model, manufacturer, OS, memory, and
//! safe-area insets by delegating to the active [`DeviceBackend`]. A native
//! default backend is lazily installed so every function works without a host;
//! values a plain host cannot know are returned as sentinels (`""`, `-1`, zero
//! insets). A real host replaces it via [`device::set_device_backend`].

pub mod device;

pub use device::{
    create_device_info, create_native_device_backend, create_safe_area_insets, get_device_backend,
    get_device_info, get_device_memory, get_safe_area_insets, set_device_backend,
};
