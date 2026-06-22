//! Device identity free functions and backend management.

use flighthq_types::{DeviceBackend, DeviceInfo, SafeAreaInsets};
use std::sync::{Arc, Mutex};

/// Allocates a zeroed [`DeviceInfo`]; use as the `out` for [`get_device_info`] or
/// when building a backend. Strings default to empty, booleans to false, and the
/// unknown-numeric field (`memory`) to `-1`.
pub fn create_device_info() -> DeviceInfo {
    DeviceInfo {
        memory: -1,
        ..DeviceInfo::default()
    }
}

/// Builds the default native backend. It reports what the host can know from
/// `std::env::consts` and returns sentinels (`""`, `-1`, zero insets) for fields a
/// plain host cannot determine. A native host replaces it via
/// [`set_device_backend`].
pub fn create_native_device_backend() -> Arc<dyn DeviceBackend> {
    Arc::new(NativeDeviceBackend)
}

/// Allocates a zeroed [`SafeAreaInsets`] (all edges 0); use as the `out` for
/// [`get_safe_area_insets`].
pub fn create_safe_area_insets() -> SafeAreaInsets {
    SafeAreaInsets::default()
}

/// Returns the active device backend, lazily installing the native default when
/// none has been set. There is always a backend.
pub fn get_device_backend() -> Arc<dyn DeviceBackend> {
    let mut guard = BACKEND.lock().expect("device backend mutex poisoned");
    if guard.is_none() {
        *guard = Some(create_native_device_backend());
    }
    Arc::clone(guard.as_ref().expect("device backend installed above"))
}

/// Fills `out` with the running device's identity and returns it. Reads the active
/// backend.
pub fn get_device_info(out: &mut DeviceInfo) -> &mut DeviceInfo {
    let backend = get_device_backend();
    backend.get_info(out)
}

/// Returns the device's total RAM in megabytes, or `-1` when unknown. Convenience
/// over [`get_device_info`].
pub fn get_device_memory() -> i64 {
    let mut scratch = create_device_info();
    get_device_info(&mut scratch).memory
}

/// Fills `out` with the device's safe-area insets, in logical pixels, and returns
/// it.
pub fn get_safe_area_insets(out: &mut SafeAreaInsets) -> &mut SafeAreaInsets {
    let backend = get_device_backend();
    backend.get_safe_area_insets(out)
}

/// Installs a native host device backend; pass `None` to fall back to the native
/// default.
pub fn set_device_backend(backend: Option<Arc<dyn DeviceBackend>>) {
    let mut guard = BACKEND.lock().expect("device backend mutex poisoned");
    *guard = backend;
}

static BACKEND: Mutex<Option<Arc<dyn DeviceBackend>>> = Mutex::new(None);

/// Default backend that reports host identity, with sentinels for unknown fields.
struct NativeDeviceBackend;

impl DeviceBackend for NativeDeviceBackend {
    fn get_info<'a>(&self, out: &'a mut DeviceInfo) -> &'a mut DeviceInfo {
        // std exposes OS and architecture at compile time. Model, manufacturer, OS
        // version, virtualization, and memory require platform probes (sysinfo or a
        // native host), so they stay sentinels here to avoid a dependency.
        out.model = String::new();
        out.manufacturer = String::new();
        out.os_name = native_os_name();
        out.os_version = String::new();
        out.platform = std::env::consts::ARCH.to_string();
        out.is_virtual = false;
        out.memory = -1;
        out
    }

    fn get_safe_area_insets<'a>(&self, out: &'a mut SafeAreaInsets) -> &'a mut SafeAreaInsets {
        // Desktop hosts have no notch/home-indicator insets; a mobile native host
        // supplies real values via its own backend.
        *out = SafeAreaInsets::default();
        out
    }
}

/// Maps `std::env::consts::OS` to a canonical display name, returning the raw
/// constant for hosts the mapping does not cover.
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
        fn get_info<'a>(&self, out: &'a mut DeviceInfo) -> &'a mut DeviceInfo {
            out.model = "Pixel".to_string();
            out.manufacturer = "Google".to_string();
            out.os_name = "Android".to_string();
            out.os_version = "14".to_string();
            out.platform = "arm64".to_string();
            out.is_virtual = true;
            out.memory = 8;
            out
        }

        fn get_safe_area_insets<'a>(&self, out: &'a mut SafeAreaInsets) -> &'a mut SafeAreaInsets {
            out.top = 24.0;
            out.right = 0.0;
            out.bottom = 16.0;
            out.left = 0.0;
            out
        }
    }

    #[test]
    #[serial]
    fn create_device_info_allocates_zeroed_snapshot() {
        let info = create_device_info();
        assert_eq!(info.model, "");
        assert!(!info.is_virtual);
        assert_eq!(info.memory, -1);
    }

    #[test]
    #[serial]
    fn create_native_device_backend_reports_host_with_sentinels() {
        let backend = create_native_device_backend();
        let mut info = create_device_info();
        backend.get_info(&mut info);
        // OS and arch come from std; the rest are sentinels.
        assert_eq!(info.os_name, native_os_name());
        assert_eq!(info.platform, std::env::consts::ARCH);
        assert_eq!(info.model, "");
        assert_eq!(info.manufacturer, "");
        assert_eq!(info.os_version, "");
        assert!(!info.is_virtual);
        assert_eq!(info.memory, -1);
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
    fn get_device_info_fills_out_via_active_backend() {
        set_device_backend(Some(Arc::new(FakeBackend)));
        let mut out = create_device_info();
        get_device_info(&mut out);
        assert_eq!(out.model, "Pixel");
        assert_eq!(out.memory, 8);
        set_device_backend(None);
    }

    #[test]
    #[serial]
    fn get_device_memory_reads_active_backend() {
        set_device_backend(Some(Arc::new(FakeBackend)));
        assert_eq!(get_device_memory(), 8);
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
    fn set_device_backend_clears_back_to_native_when_none() {
        set_device_backend(Some(Arc::new(FakeBackend)));
        set_device_backend(None);
        // A fresh fetch lazily installs the native default rather than panicking.
        let mut out = create_device_info();
        get_device_info(&mut out);
        assert_eq!(out.os_name, native_os_name());
    }
}
