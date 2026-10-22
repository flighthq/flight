use std::sync::Arc;

use flight_host::ProviderRef;
use flight_useragent::DeviceFormFactor;

// flight-lint: allow(f64) available_memory/total_memory are byte counts (e.g. 8_000_000_000) that need exact integers far beyond f32's 2^24; TS number (double)
/// Device identity and environment snapshot (TS `DeviceInfo`): plain data, filled into a caller-owned
/// `out` by `get_device_info`. Unknown or unavailable fields are sentinels ("" / -1 / false).
/// `form_factor` is the open `DeviceFormFactor` string domain owned by flight-useragent.
#[derive(Clone, Debug, PartialEq)]
pub struct DeviceInfo {
    pub arch: String,
    /// Available memory in bytes, or -1. f64: byte counts exceed f32's exact-integer range (2^24)
    /// long before real memory sizes, and TS carries them as a double.
    pub available_memory: f64,
    pub board_name: String,
    pub color_gamut: String,
    /// Logical CPU core count, or -1 (an integer count; TS number).
    pub cpu_cores: i32,
    /// System font scale factor, or -1.
    pub font_scale: f32,
    pub form_factor: DeviceFormFactor,
    pub gpu_renderer: String,
    pub gpu_vendor: String,
    pub is_hdr: bool,
    pub is_jailbroken: bool,
    pub is_low_end_device: bool,
    pub is_rooted: bool,
    pub is_virtual: bool,
    pub manufacturer: String,
    pub marketing_name: String,
    pub model: String,
    pub os_build: String,
    pub os_name: String,
    pub os_version: String,
    pub platform_string: String,
    pub product_name: String,
    pub supported_abis: Vec<String>,
    /// Total memory in bytes, or -1 (f64 for the same reason as `available_memory`).
    pub total_memory: f64,
    pub web_view_version: String,
}

/// Edge insets in CSS pixels that keep content clear of notches, rounded corners and system bars
/// (TS `SafeAreaInsets`). Plain data.
#[derive(Clone, Debug, PartialEq)]
pub struct SafeAreaInsets {
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
    pub left: f32,
}

/// Input/hardware capability flags (TS `DeviceCapabilities`); unknown capabilities are false. Plain
/// data.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DeviceCapabilities {
    pub has_keyboard: bool,
    pub has_mouse: bool,
    pub has_stylus: bool,
}

/// Built-in display metrics (TS `DeviceDisplayMetrics`); every field is -1 when unreported. Plain
/// data. `color_depth` is an integer bit count; the densities and sizes are f32 (reported values,
/// never accumulated).
#[derive(Clone, Debug, PartialEq)]
pub struct DeviceDisplayMetrics {
    pub color_depth: i32,
    pub density_dpi: f32,
    pub logical_height: f32,
    pub logical_width: f32,
    pub physical_height: f32,
    pub physical_width: f32,
    pub pixel_ratio: f32,
}

/// The device backend (TS `HostDeviceCapability`). Each read fills the caller's `out`; unknown fields
/// resolve to sentinels, never panicking. `refresh` is optional (None = the provider omits it).
#[derive(Clone)]
pub struct HostDeviceCapability {
    pub provider: ProviderRef,
    pub get_capabilities: Arc<dyn Fn(&mut DeviceCapabilities) + Send + Sync>,
    pub get_display_metrics: Arc<dyn Fn(&mut DeviceDisplayMetrics) + Send + Sync>,
    pub get_id: Arc<dyn Fn() -> String + Send + Sync>,
    pub get_info: Arc<dyn Fn(&mut DeviceInfo) + Send + Sync>,
    pub get_safe_area_insets: Arc<dyn Fn(&mut SafeAreaInsets) + Send + Sync>,
    pub refresh: Option<Arc<dyn Fn() + Send + Sync>>,
}

/// Host device capability group (TS `HostDeviceCapabilities` in `Host.ts`).
#[derive(Clone, Default)]
pub struct HostDeviceCapabilities {
    pub info: Option<HostDeviceCapability>,
}
