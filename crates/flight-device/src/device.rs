use flight_entity::NonEntityCreateResult;
use flight_useragent::DEVICE_FORM_FACTOR_UNKNOWN;

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::{Arc, Mutex};

    use super::*;

    fn host(refreshes: Arc<Mutex<usize>>) -> HostDeviceCapability {
        return HostDeviceCapability {
            provider: Arc::new(()),
            get_capabilities: Arc::new(|out: &mut DeviceCapabilities| out.has_stylus = true),
            get_display_metrics: Arc::new(|out: &mut DeviceDisplayMetrics| out.pixel_ratio = 3.0),
            get_id: Arc::new(|| "id-7".to_string()),
            get_info: Arc::new(|out: &mut DeviceInfo| out.model = "Tab".to_string()),
            get_safe_area_insets: Arc::new(|out: &mut SafeAreaInsets| out.left = 12.0),
            refresh: Some(Arc::new(move || *refreshes.lock().unwrap() += 1)),
        };
    }

    fn quiet() -> HostDeviceCapability {
        return host(Arc::new(Mutex::new(0)));
    }

    #[test]
    fn device_capabilities_new_matches_create_device_capabilities() {
        assert_eq!(DeviceCapabilities::new(), create_device_capabilities());
    }

    #[test]
    fn device_display_metrics_new_matches_create_device_display_metrics() {
        assert_eq!(DeviceDisplayMetrics::new(), create_device_display_metrics());
        assert_eq!(DeviceDisplayMetrics::new().pixel_ratio, -1.0);
    }

    #[test]
    fn device_info_new_matches_create_device_info() {
        assert_eq!(DeviceInfo::new(), create_device_info());
    }

    #[test]
    fn safe_area_insets_new_matches_create_safe_area_insets() {
        assert_eq!(SafeAreaInsets::new(), create_safe_area_insets());
    }

    #[test]
    fn host_device_capability_capabilities_matches_get_device_capabilities() {
        let c = quiet();
        let (mut a, mut b) = (create_device_capabilities(), create_device_capabilities());
        c.capabilities(&mut a);
        get_device_capabilities(&mut b, &c);
        assert_eq!(a, b);
        assert!(a.has_stylus);
    }

    #[test]
    fn host_device_capability_display_metrics_matches_get_device_display_metrics() {
        let c = quiet();
        let (mut a, mut b) = (
            create_device_display_metrics(),
            create_device_display_metrics(),
        );
        c.display_metrics(&mut a);
        get_device_display_metrics(&mut b, &c);
        assert_eq!(a, b);
        assert_eq!(a.pixel_ratio, 3.0);
    }

    #[test]
    fn host_device_capability_id_matches_get_device_id() {
        let c = quiet();
        assert_eq!(c.id(), get_device_id(&c));
        assert_eq!(c.id(), "id-7");
    }

    #[test]
    fn host_device_capability_info_matches_get_device_info() {
        let c = quiet();
        let (mut a, mut b) = (create_device_info(), create_device_info());
        c.info(&mut a);
        get_device_info(&mut b, &c);
        assert_eq!(a, b);
        assert_eq!(a.model, "Tab");
    }

    #[test]
    fn host_device_capability_refresh_device_info_matches_refresh_device_info() {
        let (ra, rb) = (Arc::new(Mutex::new(0)), Arc::new(Mutex::new(0)));
        host(ra.clone()).refresh_device_info();
        refresh_device_info(&host(rb.clone()));
        assert_eq!(*ra.lock().unwrap(), *rb.lock().unwrap());
        assert_eq!(*ra.lock().unwrap(), 1);
    }

    #[test]
    fn host_device_capability_safe_area_insets_matches_get_safe_area_insets() {
        let c = quiet();
        let (mut a, mut b) = (create_safe_area_insets(), create_safe_area_insets());
        c.safe_area_insets(&mut a);
        get_safe_area_insets(&mut b, &c);
        assert_eq!(a, b);
        assert_eq!(a.left, 12.0);
    }
}

/// A zeroed capabilities descriptor: every flag false.
pub fn create_device_capabilities() -> NonEntityCreateResult<DeviceCapabilities> {
    return DeviceCapabilities {
        has_keyboard: false,
        has_mouse: false,
        has_stylus: false,
    };
}

/// A zeroed display-metrics descriptor: every field starts at the -1 "not reported" sentinel, so a
/// host that supplies only some leaves the rest visibly unknown.
pub fn create_device_display_metrics() -> NonEntityCreateResult<DeviceDisplayMetrics> {
    return DeviceDisplayMetrics {
        color_depth: -1,
        density_dpi: -1.0,
        logical_height: -1.0,
        logical_width: -1.0,
        physical_height: -1.0,
        physical_width: -1.0,
        pixel_ratio: -1.0,
    };
}

/// A zeroed device-info descriptor: "" strings, -1 numbers, false flags, no ABIs, and the
/// `DEVICE_FORM_FACTOR_UNKNOWN` form factor.
pub fn create_device_info() -> NonEntityCreateResult<DeviceInfo> {
    return DeviceInfo {
        arch: String::new(),
        available_memory: -1.0,
        board_name: String::new(),
        color_gamut: String::new(),
        cpu_cores: -1,
        font_scale: -1.0,
        form_factor: DEVICE_FORM_FACTOR_UNKNOWN.to_string(),
        gpu_renderer: String::new(),
        gpu_vendor: String::new(),
        is_hdr: false,
        is_jailbroken: false,
        is_low_end_device: false,
        is_rooted: false,
        is_virtual: false,
        manufacturer: String::new(),
        marketing_name: String::new(),
        model: String::new(),
        os_build: String::new(),
        os_name: String::new(),
        os_version: String::new(),
        platform_string: String::new(),
        product_name: String::new(),
        supported_abis: Vec::new(),
        total_memory: -1.0,
        web_view_version: String::new(),
    };
}

/// Zeroed safe-area edges.
pub fn create_safe_area_insets() -> NonEntityCreateResult<SafeAreaInsets> {
    return SafeAreaInsets {
        top: 0.0,
        right: 0.0,
        bottom: 0.0,
        left: 0.0,
    };
}

/// Clones a `DeviceCapabilities` value (D23 value type: copy and clone).
// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): value types carry copy and clone
pub fn clone_device_capabilities(source: &DeviceCapabilities) -> DeviceCapabilities {
    let mut out = create_device_capabilities();
    copy_device_capabilities(&mut out, source);
    return out;
}

/// Clones a `DeviceDisplayMetrics` value (D23 value type: copy and clone).
// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): value types carry copy and clone
pub fn clone_device_display_metrics(source: &DeviceDisplayMetrics) -> DeviceDisplayMetrics {
    let mut out = create_device_display_metrics();
    copy_device_display_metrics(&mut out, source);
    return out;
}

/// Clones a `DeviceInfo` value (D23 value type: copy and clone).
// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): value types carry copy and clone
pub fn clone_device_info(source: &DeviceInfo) -> DeviceInfo {
    let mut out = create_device_info();
    copy_device_info(&mut out, source);
    return out;
}

/// Clones a `SafeAreaInsets` value (D23 value type: copy and clone).
// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): value types carry copy and clone
pub fn clone_safe_area_insets(source: &SafeAreaInsets) -> SafeAreaInsets {
    let mut out = create_safe_area_insets();
    copy_safe_area_insets(&mut out, source);
    return out;
}

/// Copies every field of `source` into `out`, reusing `out`'s string and list storage.
// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): value types carry copy and clone
pub fn copy_device_capabilities(out: &mut DeviceCapabilities, source: &DeviceCapabilities) {
    out.has_keyboard = source.has_keyboard;
    out.has_mouse = source.has_mouse;
    out.has_stylus = source.has_stylus;
}

/// Copies every field of `source` into `out`, reusing `out`'s string and list storage.
// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): value types carry copy and clone
pub fn copy_device_display_metrics(out: &mut DeviceDisplayMetrics, source: &DeviceDisplayMetrics) {
    out.color_depth = source.color_depth;
    out.density_dpi = source.density_dpi;
    out.logical_height = source.logical_height;
    out.logical_width = source.logical_width;
    out.physical_height = source.physical_height;
    out.physical_width = source.physical_width;
    out.pixel_ratio = source.pixel_ratio;
}

/// Copies every field of `source` into `out`, reusing `out`'s string and list storage.
// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): value types carry copy and clone
pub fn copy_device_info(out: &mut DeviceInfo, source: &DeviceInfo) {
    out.arch.clone_from(&source.arch);
    out.available_memory = source.available_memory;
    out.board_name.clone_from(&source.board_name);
    out.color_gamut.clone_from(&source.color_gamut);
    out.cpu_cores = source.cpu_cores;
    out.font_scale = source.font_scale;
    out.form_factor.clone_from(&source.form_factor);
    out.gpu_renderer.clone_from(&source.gpu_renderer);
    out.gpu_vendor.clone_from(&source.gpu_vendor);
    out.is_hdr = source.is_hdr;
    out.is_jailbroken = source.is_jailbroken;
    out.is_low_end_device = source.is_low_end_device;
    out.is_rooted = source.is_rooted;
    out.is_virtual = source.is_virtual;
    out.manufacturer.clone_from(&source.manufacturer);
    out.marketing_name.clone_from(&source.marketing_name);
    out.model.clone_from(&source.model);
    out.os_build.clone_from(&source.os_build);
    out.os_name.clone_from(&source.os_name);
    out.os_version.clone_from(&source.os_version);
    out.platform_string.clone_from(&source.platform_string);
    out.product_name.clone_from(&source.product_name);
    out.supported_abis.clone_from(&source.supported_abis);
    out.total_memory = source.total_memory;
    out.web_view_version.clone_from(&source.web_view_version);
}

/// Copies every field of `source` into `out`, reusing `out`'s string and list storage.
// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): value types carry copy and clone
pub fn copy_safe_area_insets(out: &mut SafeAreaInsets, source: &SafeAreaInsets) {
    out.top = source.top;
    out.right = source.right;
    out.bottom = source.bottom;
    out.left = source.left;
}

/// Fills `out` with the device's capability flags through the supplied provider.
// flight-lint: allow(conform-params) D9b: TS takes `out` last and returns it; Rust takes `out` first and returns nothing
pub fn get_device_capabilities(out: &mut DeviceCapabilities, host_device: &HostDeviceCapability) {
    (host_device.get_capabilities)(out);
}

/// Fills `out` with the device's built-in display metrics through the supplied provider.
// flight-lint: allow(conform-params) D9b: TS takes `out` last and returns it; Rust takes `out` first and returns nothing
pub fn get_device_display_metrics(
    out: &mut DeviceDisplayMetrics,
    host_device: &HostDeviceCapability,
) {
    (host_device.get_display_metrics)(out);
}

/// The provider's device id.
pub fn get_device_id(host_device: &HostDeviceCapability) -> String {
    return (host_device.get_id)();
}

/// Fills `out` with the device identity snapshot through the supplied provider.
// flight-lint: allow(conform-params) D9b: TS takes `out` last and returns it; Rust takes `out` first and returns nothing
pub fn get_device_info(out: &mut DeviceInfo, host_device: &HostDeviceCapability) {
    (host_device.get_info)(out);
}

/// Fills `out` with the safe-area insets through the supplied provider.
// flight-lint: allow(conform-params) D9b: TS takes `out` last and returns it; Rust takes `out` first and returns nothing
pub fn get_safe_area_insets(out: &mut SafeAreaInsets, host_device: &HostDeviceCapability) {
    (host_device.get_safe_area_insets)(out);
}

/// Asks the provider to refresh its cached snapshot, when it implements `refresh` (TS
/// `hostDevice.refresh?.()`); a no-op otherwise.
pub fn refresh_device_info(host_device: &HostDeviceCapability) {
    if let Some(refresh) = &host_device.refresh {
        refresh();
    }
}

impl DeviceCapabilities {
    pub fn new() -> Self {
        return create_device_capabilities();
    }
}

impl DeviceDisplayMetrics {
    pub fn new() -> Self {
        return create_device_display_metrics();
    }
}

impl DeviceInfo {
    pub fn new() -> Self {
        return create_device_info();
    }
}

// The capability's optional `refresh` field shares the short name, so the delegate keeps the fuller
// free-function name (D18 collision rule) rather than shadow the raw provider callback.
impl HostDeviceCapability {
    pub fn capabilities(&self, out: &mut DeviceCapabilities) {
        get_device_capabilities(out, self);
    }

    pub fn display_metrics(&self, out: &mut DeviceDisplayMetrics) {
        get_device_display_metrics(out, self);
    }

    pub fn id(&self) -> String {
        return get_device_id(self);
    }

    pub fn info(&self, out: &mut DeviceInfo) {
        get_device_info(out, self);
    }

    pub fn refresh_device_info(&self) {
        refresh_device_info(self);
    }

    pub fn safe_area_insets(&self, out: &mut SafeAreaInsets) {
        get_safe_area_insets(out, self);
    }
}

impl SafeAreaInsets {
    pub fn new() -> Self {
        return create_safe_area_insets();
    }
}
