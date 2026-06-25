//! Device identity free functions and backend management.

use flighthq_types::{
    DEVICE_FORM_FACTOR_UNKNOWN, DeviceBackend, DeviceCapabilities, DeviceDisplayMetrics,
    DeviceInfo, SafeAreaInsets,
};
use std::sync::{Arc, Mutex};

/// Allocates a zeroed [`DeviceCapabilities`]; use as the `out` for
/// [`get_device_capabilities`]. All boolean fields default to `false` (unknown).
pub fn create_device_capabilities() -> DeviceCapabilities {
    DeviceCapabilities::default()
}

/// Allocates a zeroed [`DeviceDisplayMetrics`]; use as the `out` for
/// [`get_device_display_metrics`]. All numeric fields default to `-1` when unknown.
pub fn create_device_display_metrics() -> DeviceDisplayMetrics {
    DeviceDisplayMetrics {
        color_depth: -1,
        density_dpi: -1,
        logical_height: -1,
        logical_width: -1,
        physical_height: -1,
        physical_width: -1,
        pixel_ratio: -1.0,
    }
}

/// Allocates a zeroed [`DeviceInfo`]; use as the `out` for [`get_device_info`] or when
/// building a backend. Strings default to `""`, booleans to `false`, arrays to `[]`, and
/// unknown-numeric fields to `-1`. `form_factor` defaults to the unknown sentinel.
pub fn create_device_info() -> DeviceInfo {
    DeviceInfo {
        arch: String::new(),
        available_memory: -1,
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
        total_memory: -1,
        web_view_version: String::new(),
    }
}

/// Builds the default native backend. It reports what the host can know from
/// `std::env::consts` and returns sentinels (`""`, `-1`, `false`, zero insets) for fields
/// a plain host cannot determine. A native host replaces it via [`set_device_backend`].
pub fn create_native_device_backend() -> Arc<dyn DeviceBackend> {
    Arc::new(NativeDeviceBackend)
}

/// Allocates a zeroed [`SafeAreaInsets`] (all edges 0); use as the `out` for
/// [`get_safe_area_insets`].
pub fn create_safe_area_insets() -> SafeAreaInsets {
    SafeAreaInsets::default()
}

/// Returns the active device backend, lazily installing the native default when none has
/// been set. There is always a backend.
pub fn get_device_backend() -> Arc<dyn DeviceBackend> {
    let mut guard = BACKEND.lock().expect("device backend mutex poisoned");
    if guard.is_none() {
        *guard = Some(create_native_device_backend());
    }
    Arc::clone(guard.as_ref().expect("device backend installed above"))
}

/// Fills `out` with the device's input/hardware capability flags and returns it. Reads the
/// active backend.
pub fn get_device_capabilities(out: &mut DeviceCapabilities) -> &mut DeviceCapabilities {
    let backend = get_device_backend();
    backend.get_capabilities(out)
}

/// Fills `out` with the device's built-in display metrics and returns it. Reads the active
/// backend.
pub fn get_device_display_metrics(out: &mut DeviceDisplayMetrics) -> &mut DeviceDisplayMetrics {
    let backend = get_device_backend();
    backend.get_display_metrics(out)
}

/// Returns a stable install identifier for this device/app install. Backed by
/// [`DeviceBackend::get_id`]. Returns `""` when no stable id can be formed.
pub fn get_device_id() -> String {
    get_device_backend().get_id()
}

/// Fills `out` with the running device's identity and returns it. Reads the active backend.
pub fn get_device_info(out: &mut DeviceInfo) -> &mut DeviceInfo {
    let backend = get_device_backend();
    backend.get_info(out)
}

/// Fills `out` with the device's safe-area insets, in logical pixels, and returns it.
pub fn get_safe_area_insets(out: &mut SafeAreaInsets) -> &mut SafeAreaInsets {
    let backend = get_device_backend();
    backend.get_safe_area_insets(out)
}

/// Invalidates any snapshot cached in the active backend and triggers a fresh read on the
/// next call to [`get_device_info`] / [`get_safe_area_insets`] /
/// [`get_device_display_metrics`]. The native default backend is stateless, so this is a
/// no-op there; native backends that cache a snapshot must invalidate it on this signal.
pub fn refresh_device_info() {
    get_device_backend().refresh();
}

/// Installs a native host device backend; pass `None` to fall back to the native default.
pub fn set_device_backend(backend: Option<Arc<dyn DeviceBackend>>) {
    let mut guard = BACKEND.lock().expect("device backend mutex poisoned");
    *guard = backend;
}

static BACKEND: Mutex<Option<Arc<dyn DeviceBackend>>> = Mutex::new(None);

/// Default backend that reports host identity, with sentinels for unknown fields.
struct NativeDeviceBackend;

impl DeviceBackend for NativeDeviceBackend {
    fn get_capabilities<'a>(&self, out: &'a mut DeviceCapabilities) -> &'a mut DeviceCapabilities {
        // A plain native default cannot probe attached input devices without an OS API;
        // leave all capability flags at the false (unknown) sentinel. A real native host
        // backend fills these from the platform input API.
        out.has_keyboard = false;
        out.has_mouse = false;
        out.has_stylus = false;
        out
    }

    fn get_display_metrics<'a>(
        &self,
        out: &'a mut DeviceDisplayMetrics,
    ) -> &'a mut DeviceDisplayMetrics {
        // Display metrics require a windowing/display API; the native default leaves every
        // field at the -1 sentinel. A native host backend supplies real values.
        out.color_depth = -1;
        out.density_dpi = -1;
        out.logical_height = -1;
        out.logical_width = -1;
        out.physical_height = -1;
        out.physical_width = -1;
        out.pixel_ratio = -1.0;
        out
    }

    fn get_id(&self) -> String {
        // No stable install id without a persistence layer; return the empty sentinel. A
        // native host backend persists a UUID (e.g. via @flighthq/storage).
        String::new()
    }

    fn get_info<'a>(&self, out: &'a mut DeviceInfo) -> &'a mut DeviceInfo {
        // std exposes OS and architecture at compile time. Everything else (model,
        // manufacturer, OS version, memory, GPU, abis) requires platform probes (sysinfo or
        // a native host), so they stay sentinels here to avoid a dependency.
        out.arch = std::env::consts::ARCH.to_string();
        out.available_memory = -1;
        out.board_name = String::new();
        out.color_gamut = String::new();
        out.cpu_cores = -1;
        out.font_scale = -1.0;
        out.form_factor = DEVICE_FORM_FACTOR_UNKNOWN.to_string();
        out.gpu_renderer = String::new();
        out.gpu_vendor = String::new();
        out.is_hdr = false;
        out.is_jailbroken = false;
        out.is_low_end_device = false;
        out.is_rooted = false;
        out.is_virtual = false;
        out.manufacturer = String::new();
        out.marketing_name = String::new();
        out.model = String::new();
        out.os_build = String::new();
        out.os_name = native_os_name();
        out.os_version = String::new();
        out.platform_string = String::new();
        out.product_name = String::new();
        out.supported_abis = Vec::new();
        out.total_memory = -1;
        out.web_view_version = String::new();
        out
    }

    fn get_safe_area_insets<'a>(&self, out: &'a mut SafeAreaInsets) -> &'a mut SafeAreaInsets {
        // Desktop hosts have no notch/home-indicator insets; a mobile native host supplies
        // real values via its own backend.
        *out = SafeAreaInsets::default();
        out
    }
}

/// Maps `std::env::consts::OS` to a canonical display name, returning the raw constant for
/// hosts the mapping does not cover.
fn native_os_name() -> String {
    match std::env::consts::OS {
        "linux" => "Linux".to_string(),
        "macos" => "macOS".to_string(),
        "ios" => "iOS".to_string(),
        "windows" => "Windows".to_string(),
        "android" => "Android".to_string(),
        "freebsd" => "FreeBSD".to_string(),
        "openbsd" => "OpenBSD".to_string(),
        "netbsd" => "NetBSD".to_string(),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use serial_test::serial;

    use super::*;

    struct FakeBackend;

    impl DeviceBackend for FakeBackend {
        fn get_capabilities<'a>(
            &self,
            out: &'a mut DeviceCapabilities,
        ) -> &'a mut DeviceCapabilities {
            out.has_keyboard = true;
            out.has_mouse = true;
            out.has_stylus = false;
            out
        }

        fn get_display_metrics<'a>(
            &self,
            out: &'a mut DeviceDisplayMetrics,
        ) -> &'a mut DeviceDisplayMetrics {
            out.color_depth = 8;
            out.density_dpi = 440;
            out.logical_height = 800;
            out.logical_width = 360;
            out.physical_height = 1600;
            out.physical_width = 720;
            out.pixel_ratio = 2.0;
            out
        }

        fn get_id(&self) -> String {
            "test-device-id".to_string()
        }

        fn get_info<'a>(&self, out: &'a mut DeviceInfo) -> &'a mut DeviceInfo {
            out.arch = "arm64".to_string();
            out.available_memory = 3_000_000_000;
            out.board_name = "msm8998".to_string();
            out.color_gamut = "display-p3".to_string();
            out.cpu_cores = 8;
            out.font_scale = 1.2;
            out.form_factor = "Phone".to_string();
            out.gpu_renderer = "Adreno 650".to_string();
            out.gpu_vendor = "Qualcomm".to_string();
            out.is_hdr = true;
            out.is_jailbroken = false;
            out.is_low_end_device = false;
            out.is_rooted = false;
            out.is_virtual = true;
            out.manufacturer = "Google".to_string();
            out.marketing_name = "Pixel 8 Pro".to_string();
            out.model = "Pixel".to_string();
            out.os_build = "TP1A.220624.014".to_string();
            out.os_name = "Android".to_string();
            out.os_version = "14".to_string();
            out.platform_string = "Linux armv8l".to_string();
            out.product_name = "husky".to_string();
            out.supported_abis = vec!["arm64-v8a".to_string(), "armeabi-v7a".to_string()];
            out.total_memory = 8_000_000_000;
            out.web_view_version = "120.0.6099.230".to_string();
            out
        }

        fn get_safe_area_insets<'a>(&self, out: &'a mut SafeAreaInsets) -> &'a mut SafeAreaInsets {
            out.bottom = 16.0;
            out.left = 0.0;
            out.right = 0.0;
            out.top = 24.0;
            out
        }
    }

    #[test]
    #[serial]
    fn create_device_capabilities_allocates_zeroed_false_flags() {
        let caps = create_device_capabilities();
        assert!(!caps.has_keyboard);
        assert!(!caps.has_mouse);
        assert!(!caps.has_stylus);
    }

    #[test]
    #[serial]
    fn create_device_display_metrics_allocates_sentinel_metrics() {
        let metrics = create_device_display_metrics();
        assert_eq!(metrics.color_depth, -1);
        assert_eq!(metrics.density_dpi, -1);
        assert_eq!(metrics.logical_height, -1);
        assert_eq!(metrics.logical_width, -1);
        assert_eq!(metrics.physical_height, -1);
        assert_eq!(metrics.physical_width, -1);
        assert_eq!(metrics.pixel_ratio, -1.0);
    }

    #[test]
    #[serial]
    fn create_device_info_allocates_zeroed_snapshot() {
        let info = create_device_info();
        assert_eq!(info.arch, "");
        assert_eq!(info.available_memory, -1);
        assert_eq!(info.board_name, "");
        assert_eq!(info.color_gamut, "");
        assert_eq!(info.cpu_cores, -1);
        assert_eq!(info.font_scale, -1.0);
        assert_eq!(info.form_factor, DEVICE_FORM_FACTOR_UNKNOWN);
        assert_eq!(info.gpu_renderer, "");
        assert_eq!(info.gpu_vendor, "");
        assert!(!info.is_hdr);
        assert!(!info.is_jailbroken);
        assert!(!info.is_low_end_device);
        assert!(!info.is_rooted);
        assert!(!info.is_virtual);
        assert_eq!(info.manufacturer, "");
        assert_eq!(info.marketing_name, "");
        assert_eq!(info.model, "");
        assert_eq!(info.os_build, "");
        assert_eq!(info.os_name, "");
        assert_eq!(info.os_version, "");
        assert_eq!(info.platform_string, "");
        assert_eq!(info.product_name, "");
        assert_eq!(info.supported_abis, Vec::<String>::new());
        assert_eq!(info.total_memory, -1);
        assert_eq!(info.web_view_version, "");
    }

    #[test]
    #[serial]
    fn create_native_device_backend_reports_host_with_sentinels() {
        let backend = create_native_device_backend();
        let mut info = create_device_info();
        backend.get_info(&mut info);
        // OS and arch come from std; the rest are sentinels.
        assert_eq!(info.os_name, native_os_name());
        assert_eq!(info.arch, std::env::consts::ARCH);
        assert_eq!(info.model, "");
        assert_eq!(info.manufacturer, "");
        assert_eq!(info.os_version, "");
        assert!(!info.is_virtual);
        assert_eq!(info.total_memory, -1);
        assert_eq!(info.form_factor, DEVICE_FORM_FACTOR_UNKNOWN);
        assert_eq!(info.supported_abis, Vec::<String>::new());
    }

    #[test]
    #[serial]
    fn create_native_device_backend_returns_zero_safe_area_insets() {
        let backend = create_native_device_backend();
        let mut insets = create_safe_area_insets();
        backend.get_safe_area_insets(&mut insets);
        assert_eq!(insets.top, 0.0);
        assert_eq!(insets.right, 0.0);
        assert_eq!(insets.bottom, 0.0);
        assert_eq!(insets.left, 0.0);
    }

    #[test]
    #[serial]
    fn create_safe_area_insets_allocates_zeroed_edges() {
        let insets = create_safe_area_insets();
        assert_eq!(insets.top, 0.0);
        assert_eq!(insets.right, 0.0);
        assert_eq!(insets.bottom, 0.0);
        assert_eq!(insets.left, 0.0);
    }

    #[test]
    #[serial]
    fn get_device_backend_falls_back_to_native() {
        set_device_backend(None);
        let _b = get_device_backend();
        set_device_backend(None);
    }

    #[test]
    #[serial]
    fn get_device_capabilities_fills_out_via_active_backend() {
        set_device_backend(Some(Arc::new(FakeBackend)));
        let mut out = create_device_capabilities();
        get_device_capabilities(&mut out);
        assert!(out.has_keyboard);
        assert!(out.has_mouse);
        assert!(!out.has_stylus);
        set_device_backend(None);
    }

    #[test]
    #[serial]
    fn get_device_display_metrics_fills_out_via_active_backend() {
        set_device_backend(Some(Arc::new(FakeBackend)));
        let mut out = create_device_display_metrics();
        get_device_display_metrics(&mut out);
        assert_eq!(out.color_depth, 8);
        assert_eq!(out.density_dpi, 440);
        assert_eq!(out.logical_height, 800);
        assert_eq!(out.logical_width, 360);
        assert_eq!(out.physical_height, 1600);
        assert_eq!(out.physical_width, 720);
        assert_eq!(out.pixel_ratio, 2.0);
        set_device_backend(None);
    }

    #[test]
    #[serial]
    fn get_device_id_returns_backend_value() {
        set_device_backend(Some(Arc::new(FakeBackend)));
        assert_eq!(get_device_id(), "test-device-id");
        set_device_backend(None);
    }

    #[test]
    #[serial]
    fn get_device_id_returns_string_without_panicking_on_native_default() {
        set_device_backend(None);
        let id = get_device_id();
        // Native default forms no stable id; the empty sentinel is a valid string.
        assert_eq!(id, "");
        set_device_backend(None);
    }

    #[test]
    #[serial]
    fn get_device_info_fills_out_via_active_backend() {
        set_device_backend(Some(Arc::new(FakeBackend)));
        let mut out = create_device_info();
        get_device_info(&mut out);
        assert_eq!(out.arch, "arm64");
        assert_eq!(out.available_memory, 3_000_000_000);
        assert_eq!(out.board_name, "msm8998");
        assert_eq!(out.color_gamut, "display-p3");
        assert_eq!(out.cpu_cores, 8);
        assert_eq!(out.font_scale, 1.2);
        assert_eq!(out.form_factor, "Phone");
        assert_eq!(out.gpu_renderer, "Adreno 650");
        assert_eq!(out.gpu_vendor, "Qualcomm");
        assert!(out.is_hdr);
        assert!(!out.is_jailbroken);
        assert!(!out.is_low_end_device);
        assert!(!out.is_rooted);
        assert!(out.is_virtual);
        assert_eq!(out.manufacturer, "Google");
        assert_eq!(out.marketing_name, "Pixel 8 Pro");
        assert_eq!(out.model, "Pixel");
        assert_eq!(out.os_build, "TP1A.220624.014");
        assert_eq!(out.os_name, "Android");
        assert_eq!(out.os_version, "14");
        assert_eq!(out.platform_string, "Linux armv8l");
        assert_eq!(out.product_name, "husky");
        assert_eq!(out.supported_abis, vec!["arm64-v8a", "armeabi-v7a"]);
        assert_eq!(out.total_memory, 8_000_000_000);
        assert_eq!(out.web_view_version, "120.0.6099.230");
        set_device_backend(None);
    }

    #[test]
    #[serial]
    fn get_safe_area_insets_fills_out_via_active_backend() {
        set_device_backend(Some(Arc::new(FakeBackend)));
        let mut out = create_safe_area_insets();
        get_safe_area_insets(&mut out);
        assert_eq!(out.top, 24.0);
        assert_eq!(out.bottom, 16.0);
        set_device_backend(None);
    }

    #[test]
    #[serial]
    fn refresh_device_info_does_not_panic_on_native_default() {
        set_device_backend(None);
        refresh_device_info();
        set_device_backend(None);
    }

    #[test]
    #[serial]
    fn refresh_device_info_invokes_backend_refresh() {
        use std::sync::atomic::{AtomicBool, Ordering};

        struct RefreshBackend {
            refreshed: Arc<AtomicBool>,
        }

        impl DeviceBackend for RefreshBackend {
            fn get_capabilities<'a>(
                &self,
                out: &'a mut DeviceCapabilities,
            ) -> &'a mut DeviceCapabilities {
                out
            }

            fn get_display_metrics<'a>(
                &self,
                out: &'a mut DeviceDisplayMetrics,
            ) -> &'a mut DeviceDisplayMetrics {
                out
            }

            fn get_id(&self) -> String {
                String::new()
            }

            fn get_info<'a>(&self, out: &'a mut DeviceInfo) -> &'a mut DeviceInfo {
                out
            }

            fn get_safe_area_insets<'a>(
                &self,
                out: &'a mut SafeAreaInsets,
            ) -> &'a mut SafeAreaInsets {
                out
            }

            fn refresh(&self) {
                self.refreshed.store(true, Ordering::SeqCst);
            }
        }

        let refreshed = Arc::new(AtomicBool::new(false));
        set_device_backend(Some(Arc::new(RefreshBackend {
            refreshed: Arc::clone(&refreshed),
        })));
        refresh_device_info();
        assert!(refreshed.load(Ordering::SeqCst));
        set_device_backend(None);
    }

    #[test]
    #[serial]
    fn set_device_backend_clears_back_to_native_when_none() {
        set_device_backend(Some(Arc::new(FakeBackend)));
        set_device_backend(None);
        // A fresh fetch lazily installs the native default rather than panicking.
        let mut out = create_device_info();
        get_device_info(&mut out);
        assert_eq!(out.os_name, native_os_name());
        assert_eq!(out.model, "");
    }
}
