//! flight-compiler: string-union HapticImpactStyle HapticNotificationType HapticsOperation
//! flight-compiler: readonly-fields HostHapticsCapabilities
//! flight-compiler: callable-field-parameters HostHapticsCapability capabilities out
//! flight-compiler: callable-field-parameters HostHapticsCapability impact style intensity
//! flight-compiler: callable-field-parameters HostHapticsCapability notification type
//! flight-compiler: callable-field-parameters HostHapticsCapability vibrate durationMs
//! flight-compiler: callable-field-parameters HostHapticsCapability vibrate_pattern pattern
//! flight-compiler: callable-field-parameters HostHapticsCapability vibrate_waveform timings amplitudes repeat

use std::sync::Arc;

/// Physical impact styles supported by a haptics provider.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HapticImpactStyle {
    Light,
    Medium,
    Heavy,
    Soft,
    Rigid,
}

/// Notification feedback categories supported by a haptics provider.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HapticNotificationType {
    Success,
    Warning,
    Error,
}

/// Snapshot of what the supplied provider supports. Filled into a caller-owned `out` value; absent
/// features resolve to `false` rather than throwing.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct HapticsCapabilities {
    pub amplitude_control: bool,
    pub custom_events: bool,
    pub intensity: bool,
    pub patterns: bool,
    pub supported: bool,
}

/// Caller-supplied haptics provider. No native or ambient host is selected by this crate.
#[derive(Clone)]
pub struct HostHapticsCapability {
    /// Cancels any in-progress vibration. Returns `false` when haptics are unavailable.
    pub cancel: Arc<dyn Fn() -> bool + Send + Sync>,
    /// Fills `out` with the provider's capabilities.
    pub capabilities: Arc<dyn Fn(&mut HapticsCapabilities) + Send + Sync>,
    /// Triggers a physical impact, with optional continuous intensity (`0..1`).
    pub impact: Arc<dyn Fn(HapticImpactStyle, Option<f32>) -> bool + Send + Sync>,
    /// Reports whether haptics are available on the current device.
    pub is_supported: Arc<dyn Fn() -> bool + Send + Sync>,
    pub notification: Arc<dyn Fn(HapticNotificationType) -> bool + Send + Sync>,
    /// Warm-up hint to reduce first-trigger latency. Optional; no-op on providers without
    /// pre-allocation.
    pub prepare: Option<Arc<dyn Fn() + Send + Sync>>,
    pub selection: Arc<dyn Fn() -> bool + Send + Sync>,
    pub vibrate: Arc<dyn Fn(f32) -> bool + Send + Sync>,
    /// Vibrates with a pattern `[onMs, offMs, ...]`. Returns `false` on an empty pattern or when
    /// unavailable.
    pub vibrate_pattern: Arc<dyn Fn(&Vec<f32>) -> bool + Send + Sync>,
    /// Amplitude-aware waveform (`Android VibrationEffect.createWaveform`). Optional; callers fall
    /// back to `vibratePattern(timings)` when absent. `repeat` is the loop index into `timings`, or
    /// `-1` for no repeat.
    pub vibrate_waveform:
        Option<Arc<dyn Fn(&Vec<f32>, &Vec<f32>, Option<i32>) -> bool + Send + Sync>>,
}

/// Optional haptics provider slot aggregated by the future host package.
#[derive(Clone, Default)]
pub struct HostHapticsCapabilities {
    pub engine: Option<HostHapticsCapability>,
}

/// Every operation exposed by `HostHapticsCapability`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HapticsOperation {
    Cancel,
    Capabilities,
    Impact,
    IsSupported,
    Notification,
    Prepare,
    Selection,
    Vibrate,
    VibratePattern,
    VibrateWaveform,
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS HapticImpactStyle string union; @flighthq/types exports the union only
pub fn get_haptic_impact_style_string(value: HapticImpactStyle) -> &'static str {
    return match value {
        HapticImpactStyle::Light => "light",
        HapticImpactStyle::Medium => "medium",
        HapticImpactStyle::Heavy => "heavy",
        HapticImpactStyle::Soft => "soft",
        HapticImpactStyle::Rigid => "rigid",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS HapticNotificationType string union; @flighthq/types exports the union only
pub fn get_haptic_notification_type_string(value: HapticNotificationType) -> &'static str {
    return match value {
        HapticNotificationType::Success => "success",
        HapticNotificationType::Warning => "warning",
        HapticNotificationType::Error => "error",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS HapticsOperation keyof union; @flighthq/types exports the union only
pub fn get_haptics_operation_string(value: HapticsOperation) -> &'static str {
    return match value {
        HapticsOperation::Cancel => "cancel",
        HapticsOperation::Capabilities => "capabilities",
        HapticsOperation::Impact => "impact",
        HapticsOperation::IsSupported => "isSupported",
        HapticsOperation::Notification => "notification",
        HapticsOperation::Prepare => "prepare",
        HapticsOperation::Selection => "selection",
        HapticsOperation::Vibrate => "vibrate",
        HapticsOperation::VibratePattern => "vibratePattern",
        HapticsOperation::VibrateWaveform => "vibrateWaveform",
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS HapticImpactStyle string union; @flighthq/types exports the union only
pub fn parse_haptic_impact_style(value: &str) -> Option<HapticImpactStyle> {
    return match value {
        "light" => Some(HapticImpactStyle::Light),
        "medium" => Some(HapticImpactStyle::Medium),
        "heavy" => Some(HapticImpactStyle::Heavy),
        "soft" => Some(HapticImpactStyle::Soft),
        "rigid" => Some(HapticImpactStyle::Rigid),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS HapticNotificationType string union; @flighthq/types exports the union only
pub fn parse_haptic_notification_type(value: &str) -> Option<HapticNotificationType> {
    return match value {
        "success" => Some(HapticNotificationType::Success),
        "warning" => Some(HapticNotificationType::Warning),
        "error" => Some(HapticNotificationType::Error),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 enum-string conversion for the TS HapticsOperation keyof union; @flighthq/types exports the union only
pub fn parse_haptics_operation(value: &str) -> Option<HapticsOperation> {
    return match value {
        "cancel" => Some(HapticsOperation::Cancel),
        "capabilities" => Some(HapticsOperation::Capabilities),
        "impact" => Some(HapticsOperation::Impact),
        "isSupported" => Some(HapticsOperation::IsSupported),
        "notification" => Some(HapticsOperation::Notification),
        "prepare" => Some(HapticsOperation::Prepare),
        "selection" => Some(HapticsOperation::Selection),
        "vibrate" => Some(HapticsOperation::Vibrate),
        "vibratePattern" => Some(HapticsOperation::VibratePattern),
        "vibrateWaveform" => Some(HapticsOperation::VibrateWaveform),
        _ => None,
    };
}
