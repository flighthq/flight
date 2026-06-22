//! Platform identification free functions and backend management.

use flighthq_types::{PlatformBackend, PlatformInfo, PlatformKind, PlatformName};
use std::sync::{Arc, Mutex};

/// Allocates a zeroed [`PlatformInfo`]; use as the `out` for [`get_platform_info`]
/// or when building a backend. Strings default to empty, kind/name to
/// [`PlatformKind::Unknown`] / [`PlatformName::Unknown`], and `is_touch` to false.
pub fn create_platform_info() -> PlatformInfo {
    PlatformInfo::default()
}

/// Builds the default native backend. It answers from `std::env::consts` (OS name,
/// arch) and `cfg!` macros, the always-available fallback so there is an answer
/// without a host. A native host replaces it via [`set_platform_backend`].
pub fn create_native_platform_backend() -> Arc<dyn PlatformBackend> {
    Arc::new(NativePlatformBackend)
}

/// Returns the active platform backend, lazily installing the native default when
/// none has been set. There is always a backend; this is the root one for
/// environment identification.
pub fn get_platform_backend() -> Arc<dyn PlatformBackend> {
    let mut guard = BACKEND.lock().expect("platform backend mutex poisoned");
    if guard.is_none() {
        *guard = Some(create_native_platform_backend());
    }
    Arc::clone(guard.as_ref().expect("platform backend installed above"))
}

/// Fills `out` with the running platform's identity and returns it. Cheap; reads
/// the active backend.
pub fn get_platform_info(out: &mut PlatformInfo) -> &mut PlatformInfo {
    let backend = get_platform_backend();
    backend.get_info(out);
    out
}

/// Returns the platform family — desktop / mobile / web / unknown.
pub fn get_platform_kind() -> PlatformKind {
    let mut scratch = create_platform_info();
    get_platform_info(&mut scratch).kind
}

/// Returns the specific OS/runtime name — windows / macos / ios / android /
/// linux / web / unknown.
pub fn get_platform_name() -> PlatformName {
    let mut scratch = create_platform_info();
    get_platform_info(&mut scratch).name
}

/// Returns true on a desktop host (Electron/Tauri/native window shell). False on
/// mobile and plain web.
pub fn is_platform_desktop() -> bool {
    get_platform_kind() == PlatformKind::Desktop
}

/// Returns true on a mobile host (iOS/Android via Capacitor or a native shell).
pub fn is_platform_mobile() -> bool {
    get_platform_kind() == PlatformKind::Mobile
}

/// Returns true on a touch-primary device, independent of desktop/mobile
/// classification.
pub fn is_platform_touch() -> bool {
    let mut scratch = create_platform_info();
    get_platform_info(&mut scratch).is_touch
}

/// Returns true when running as plain web with no native host registered.
pub fn is_platform_web() -> bool {
    get_platform_kind() == PlatformKind::Web
}

/// Installs a native host backend (Electron/Tauri/Capacitor/native). Pass `None`
/// to fall back to the native default. Opt-in: nothing registers until called.
pub fn set_platform_backend(backend: Option<Arc<dyn PlatformBackend>>) {
    let mut guard = BACKEND.lock().expect("platform backend mutex poisoned");
    *guard = backend;
}

static BACKEND: Mutex<Option<Arc<dyn PlatformBackend>>> = Mutex::new(None);

/// Default backend that identifies the host from `std::env::consts` and `cfg!`.
struct NativePlatformBackend;

impl PlatformBackend for NativePlatformBackend {
    fn get_info<'a>(&self, out: &'a mut PlatformInfo) -> &'a mut PlatformInfo {
        out.name = detect_native_platform_name();
        out.kind = match out.name {
            PlatformName::Ios | PlatformName::Android => PlatformKind::Mobile,
            PlatformName::Windows | PlatformName::Macos | PlatformName::Linux => {
                PlatformKind::Desktop
            }
            PlatformName::Web => PlatformKind::Web,
            PlatformName::Unknown => PlatformKind::Unknown,
        };
        out.version.clear();
        out.arch.clear();
        out.arch.push_str(std::env::consts::ARCH);
        out.locale = detect_native_locale();
        // Native std cannot answer touch-primary; a host backend decides. False is the sentinel.
        out.is_touch = false;
        out
    }
}

// Maps the compile-time target OS to a PlatformName. wasm32 with no host resolves to Web.
fn detect_native_platform_name() -> PlatformName {
    if cfg!(target_os = "windows") {
        PlatformName::Windows
    } else if cfg!(target_os = "macos") {
        PlatformName::Macos
    } else if cfg!(target_os = "ios") {
        PlatformName::Ios
    } else if cfg!(target_os = "android") {
        PlatformName::Android
    } else if cfg!(target_os = "linux") {
        PlatformName::Linux
    } else if cfg!(target_arch = "wasm32") {
        PlatformName::Web
    } else {
        PlatformName::Unknown
    }
}

// Reads the POSIX locale environment in precedence order, or "" when unset (the sentinel).
// Strips any ".charset" / "@modifier" suffix so callers see a bare "en_US"-style tag.
fn detect_native_locale() -> String {
    for key in ["LC_ALL", "LC_MESSAGES", "LANG"] {
        if let Ok(value) = std::env::var(key) {
            if !value.is_empty() {
                let end = value.find(['.', '@']).unwrap_or(value.len());
                return value[..end].to_string();
            }
        }
    }
    String::new()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;
    use std::sync::Mutex as TestMutex;

    // The backend is process-global; serialize the tests that install one so they do
    // not race each other through the shared BACKEND slot.
    static TEST_LOCK: TestMutex<()> = TestMutex::new(());

    // A fixed-info backend used to verify the free functions read the active backend.
    struct FakeBackend {
        info: PlatformInfo,
    }

    impl PlatformBackend for FakeBackend {
        fn get_info<'a>(&self, out: &'a mut PlatformInfo) -> &'a mut PlatformInfo {
            *out = self.info.clone();
            out
        }
    }

    fn fake_backend(info: PlatformInfo) -> Arc<dyn PlatformBackend> {
        Arc::new(FakeBackend { info })
    }

    #[test]
    fn create_native_platform_backend_fills_out() {
        let backend = create_native_platform_backend();
        let mut out = create_platform_info();
        backend.get_info(&mut out);
        // The native backend reports a real arch and a non-unknown name on a known host.
        assert_eq!(out.arch, std::env::consts::ARCH);
        assert_eq!(out.is_touch, false);
        assert_ne!(out.name, PlatformName::Unknown);
    }

    #[test]
    fn create_platform_info_is_zeroed() {
        let info = create_platform_info();
        assert_eq!(info.name, PlatformName::Unknown);
        assert_eq!(info.kind, PlatformKind::Unknown);
        assert_eq!(info.version, "");
        assert_eq!(info.arch, "");
        assert_eq!(info.locale, "");
        assert_eq!(info.is_touch, false);
    }

    #[test]
    #[serial]
    fn get_platform_backend_falls_back_to_native() {
        let _guard = TEST_LOCK.lock().unwrap();
        set_platform_backend(None);
        // Lazily installs the native default; there is always a backend.
        let mut out = create_platform_info();
        get_platform_backend().get_info(&mut out);
        assert_ne!(out.name, PlatformName::Unknown);
        set_platform_backend(None);
    }

    #[test]
    #[serial]
    fn get_platform_info_fills_and_returns_out() {
        let _guard = TEST_LOCK.lock().unwrap();
        let mut info = create_platform_info();
        info.name = PlatformName::Ios;
        info.arch = "arm64".to_string();
        set_platform_backend(Some(fake_backend(info)));
        let mut out = create_platform_info();
        let result = get_platform_info(&mut out);
        assert_eq!(result.name, PlatformName::Ios);
        assert_eq!(result.arch, "arm64");
        set_platform_backend(None);
    }

    #[test]
    #[serial]
    fn get_platform_kind_returns_active_backend_kind() {
        let _guard = TEST_LOCK.lock().unwrap();
        let mut info = create_platform_info();
        info.kind = PlatformKind::Desktop;
        set_platform_backend(Some(fake_backend(info)));
        assert_eq!(get_platform_kind(), PlatformKind::Desktop);
        set_platform_backend(None);
    }

    #[test]
    #[serial]
    fn get_platform_name_returns_active_backend_name() {
        let _guard = TEST_LOCK.lock().unwrap();
        let mut info = create_platform_info();
        info.name = PlatformName::Macos;
        set_platform_backend(Some(fake_backend(info)));
        assert_eq!(get_platform_name(), PlatformName::Macos);
        set_platform_backend(None);
    }

    #[test]
    #[serial]
    fn is_platform_desktop_only_for_desktop_kind() {
        let _guard = TEST_LOCK.lock().unwrap();
        let mut desktop = create_platform_info();
        desktop.kind = PlatformKind::Desktop;
        set_platform_backend(Some(fake_backend(desktop)));
        assert!(is_platform_desktop());
        let mut web = create_platform_info();
        web.kind = PlatformKind::Web;
        set_platform_backend(Some(fake_backend(web)));
        assert!(!is_platform_desktop());
        set_platform_backend(None);
    }

    #[test]
    #[serial]
    fn is_platform_mobile_only_for_mobile_kind() {
        let _guard = TEST_LOCK.lock().unwrap();
        let mut info = create_platform_info();
        info.kind = PlatformKind::Mobile;
        set_platform_backend(Some(fake_backend(info)));
        assert!(is_platform_mobile());
        set_platform_backend(None);
    }

    #[test]
    #[serial]
    fn is_platform_touch_reflects_backend_flag() {
        let _guard = TEST_LOCK.lock().unwrap();
        let mut info = create_platform_info();
        info.is_touch = true;
        set_platform_backend(Some(fake_backend(info)));
        assert!(is_platform_touch());
        set_platform_backend(None);
    }

    #[test]
    #[serial]
    fn is_platform_web_only_for_web_kind() {
        let _guard = TEST_LOCK.lock().unwrap();
        let mut info = create_platform_info();
        info.kind = PlatformKind::Web;
        set_platform_backend(Some(fake_backend(info)));
        assert!(is_platform_web());
        set_platform_backend(None);
    }

    #[test]
    #[serial]
    fn set_platform_backend_installs_and_clears() {
        let _guard = TEST_LOCK.lock().unwrap();
        let mut info = create_platform_info();
        info.name = PlatformName::Linux;
        set_platform_backend(Some(fake_backend(info)));
        assert_eq!(get_platform_name(), PlatformName::Linux);
        // Clearing to None reinstalls the native fallback on next access.
        set_platform_backend(None);
        let mut out = create_platform_info();
        get_platform_backend().get_info(&mut out);
        assert_ne!(out.name, PlatformName::Unknown);
        set_platform_backend(None);
    }
}
