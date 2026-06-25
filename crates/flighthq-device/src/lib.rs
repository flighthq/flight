//! `flighthq-device` — static device and OS identity over a swappable backend.
//!
//! Free functions report the device model, manufacturer, OS, memory, and
//! safe-area insets by delegating to the active [`DeviceBackend`]. A native
//! default backend is lazily installed so every function works without a host;
//! values a plain host cannot know are returned as sentinels (`""`, `-1`, zero
//! insets). A real host replaces it via [`device::set_device_backend`].

pub mod device;

pub use device::{
    create_device_capabilities, create_device_display_metrics, create_device_info,
    create_native_device_backend, create_safe_area_insets, get_device_backend,
    get_device_capabilities, get_device_display_metrics, get_device_id, get_device_info,
    get_safe_area_insets, refresh_device_info, set_device_backend,
};
