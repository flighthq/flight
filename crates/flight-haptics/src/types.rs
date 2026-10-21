use std::sync::Arc;

/// Physical impact styles supported by a haptics provider.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum HapticImpactStyle {
    Light = 0,
    Medium = 1,
    Heavy = 2,
    Soft = 3,
    Rigid = 4,
}

/// Notification feedback categories supported by a haptics provider.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum HapticNotificationType {
    Success = 0,
    Warning = 1,
    Error = 2,
}

/// Snapshot of the features exposed by a selected haptics provider.
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
    pub cancel: Arc<dyn Fn() -> bool + Send + Sync>,
    pub capabilities: Arc<dyn Fn(&mut HapticsCapabilities) + Send + Sync>,
    pub impact: Arc<dyn Fn(HapticImpactStyle, Option<f32>) -> bool + Send + Sync>,
    pub is_supported: Arc<dyn Fn() -> bool + Send + Sync>,
    pub notification: Arc<dyn Fn(HapticNotificationType) -> bool + Send + Sync>,
    pub prepare: Option<Arc<dyn Fn() + Send + Sync>>,
    pub selection: Arc<dyn Fn() -> bool + Send + Sync>,
    pub vibrate: Arc<dyn Fn(f32) -> bool + Send + Sync>,
    pub vibrate_pattern: Arc<dyn Fn(&Vec<f32>) -> bool + Send + Sync>,
    pub vibrate_waveform:
        Option<Arc<dyn Fn(&Vec<f32>, &Vec<f32>, Option<i32>) -> bool + Send + Sync>>,
}

/// Optional haptics provider slot aggregated by the future host package.
#[derive(Clone, Default)]
pub struct HostHapticsCapabilities {
    pub engine: Option<HostHapticsCapability>,
}

/// Every operation exposed by [`HostHapticsCapability`].
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum HapticsOperation {
    Cancel = 0,
    Capabilities = 1,
    Impact = 2,
    IsSupported = 3,
    Notification = 4,
    Prepare = 5,
    Selection = 6,
    Vibrate = 7,
    VibratePattern = 8,
    VibrateWaveform = 9,
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
