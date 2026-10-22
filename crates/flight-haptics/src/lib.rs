mod haptics;
mod host_explain;
mod types;

pub mod contract;

// Public lane: the ten functions exported by the pinned TS `index.ts`, plus the types now owned
// by haptics after dissolving @flighthq/types. D9 enum string tables stay contract-only.
pub use contract::cancel_device_vibration;
pub use contract::get_haptics_capabilities;
pub use contract::is_haptics_supported;
pub use contract::prepare_haptics;
pub use contract::trigger_haptic_impact;
pub use contract::trigger_haptic_notification;
pub use contract::trigger_haptic_selection;
pub use contract::vibrate_device;
pub use contract::vibrate_device_pattern;
pub use contract::vibrate_device_waveform;

pub use contract::HapticImpactStyle;
pub use contract::HapticNotificationType;
pub use contract::HapticsCapabilities;
pub use contract::HapticsOperation;
pub use contract::HostHapticsCapabilities;
pub use contract::HostHapticsCapability;
