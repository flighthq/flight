mod device;
mod types;

pub mod contract;

// Public lane: the ten functions the pinned TS `index.ts` names, plus the device-owned types their
// signatures require. DeviceFormFactor is owned by flight-useragent and imported from there.
pub use contract::DeviceCapabilities;
pub use contract::DeviceDisplayMetrics;
pub use contract::DeviceInfo;
pub use contract::HostDeviceCapabilities;
pub use contract::HostDeviceCapability;
pub use contract::SafeAreaInsets;
pub use contract::create_device_capabilities;
pub use contract::create_device_display_metrics;
pub use contract::create_device_info;
pub use contract::create_safe_area_insets;
pub use contract::get_device_capabilities;
pub use contract::get_device_display_metrics;
pub use contract::get_device_id;
pub use contract::get_device_info;
pub use contract::get_safe_area_insets;
pub use contract::refresh_device_info;
