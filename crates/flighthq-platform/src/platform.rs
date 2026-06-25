//! Platform identification free functions and backend management.

use flighthq_types::{
    PlatformBackend, PlatformEngine, PlatformInfo, PlatformKind, PlatformName, PlatformRuntime,
};
use flighthq_useragent::probe_endianness;
use std::cmp::Ordering;
use std::sync::{Arc, Mutex};

/// Compares two dotted version strings numerically, segment by segment. Returns
/// [`Ordering::Less`] / [`Ordering::Equal`] / [`Ordering::Greater`] (the Rust form of the
/// TS `-1 | 0 | 1`). Missing trailing segments and non-numeric segments are treated as `0`;
/// `""` sorts lowest, and `""` compared with `""` is [`Ordering::Equal`].
///
/// Example: `compare_platform_versions("10.15.7", "10.15.6") == Ordering::Greater`.
pub fn compare_platform_versions(a: &str, b: &str) -> Ordering {
    if a == b {
        return Ordering::Equal;
    }
    let a_parts: Vec<&str> = if a.is_empty() {
        Vec::new()
    } else {
        a.split('.').collect()
    };
    let b_parts: Vec<&str> = if b.is_empty() {
        Vec::new()
    } else {
        b.split('.').collect()
    };
    let len = a_parts.len().max(b_parts.len());
    for i in 0..len {
        // parseInt-with-NaN→0: a non-numeric segment (or missing trailing one) is 0.
        let a_num = a_parts
            .get(i)
            .and_then(|s| parse_leading_int(s))
            .unwrap_or(0);
        let b_num = b_parts
            .get(i)
            .and_then(|s| parse_leading_int(s))
            .unwrap_or(0);
        match a_num.cmp(&b_num) {
            Ordering::Equal => continue,
            other => return other,
        }
    }
    Ordering::Equal
}

/// Allocates a zeroed [`PlatformInfo`]; use as the `out` for [`get_platform_info`]
/// or when building a backend. Strings default to empty, enums to their `Unknown`
/// variant, `is_touch` to false, and `pointer_width` to the `-1` sentinel.
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

/// Returns the browser rendering engine — blink / gecko / webkit / unknown.
/// [`PlatformEngine::Unknown`] on native hosts where no browser engine is present.
pub fn get_platform_engine() -> PlatformEngine {
    let mut scratch = create_platform_info();
    get_platform_info(&mut scratch).engine
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

/// Returns the host shell / runtime environment — web / electron / tauri /
/// capacitor / native / unknown. Distinguishes a plain web page from a host shell.
pub fn get_platform_runtime() -> PlatformRuntime {
    let mut scratch = create_platform_info();
    get_platform_info(&mut scratch).runtime
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

/// Returns true when the app runs inside a host shell (Electron/Tauri/Capacitor/native),
/// not a plain browser page. Convenience over
/// `get_platform_runtime() != Web && != Unknown`.
pub fn is_platform_native() -> bool {
    let runtime = get_platform_runtime();
    runtime != PlatformRuntime::Web && runtime != PlatformRuntime::Unknown
}

/// Returns true on a touch-primary device, independent of desktop/mobile
/// classification.
pub fn is_platform_touch() -> bool {
    let mut scratch = create_platform_info();
    get_platform_info(&mut scratch).is_touch
}

/// Returns true when the running platform's OS version is at or above `minimum`. Reads the
/// live version via [`get_platform_info`]. Returns false when the version is `""` (unknown).
/// The comparison is numeric and segment-wise (see [`compare_platform_versions`]).
pub fn is_platform_version_at_least(minimum: &str) -> bool {
    let mut scratch = create_platform_info();
    let version = std::mem::take(&mut get_platform_info(&mut scratch).version);
    if version.is_empty() {
        return false;
    }
    compare_platform_versions(&version, minimum) != Ordering::Less
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
        // No browser engine and no host shell on the bare native default; a real host
        // (Electron/Tauri/Capacitor/native) sets engine/runtime when it installs a backend.
        out.engine = PlatformEngine::Unknown;
        out.engine_version.clear();
        out.runtime = PlatformRuntime::Unknown;
        // Endianness routes through the shared `flighthq-useragent::probe_endianness` (its
        // `cfg!(target_endian)` resolution is the same byte-order answer this crate would
        // re-derive) rather than an inlined duplicate. Pointer width stays a native read:
        // `parse_user_agent_pointer_width` maps UA arch tokens (x64/arm64/...), but the native
        // backend reports Rust arch tokens (x86_64/aarch64), so `usize` is the authoritative
        // native source here.
        out.endianness = probe_endianness();
        out.pointer_width = detect_native_pointer_width();
        // OS build and Linux distro identity require platform-specific probes a host fills.
        out.os_build.clear();
        out.distro.clear();
        out.distro_version.clear();
        out
    }
}

// The native pointer width in bits from the target's `usize`. Mirrors the TS
// `parseUserAgentPointerWidth` result (64 / 32), but read directly on native.
fn detect_native_pointer_width() -> i32 {
    (std::mem::size_of::<usize>() * 8) as i32
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
        if let Ok(value) = std::env::var(key)
            && !value.is_empty()
        {
            let end = value.find(['.', '@']).unwrap_or(value.len());
            return value[..end].to_string();
        }
    }
    String::new()
}

// Parses the leading run of ASCII digits of `segment` into an i64, mirroring JS
// `parseInt(segment, 10)`: stops at the first non-digit, and yields `None` (treated as 0
// by the caller) when there is no leading digit — JS's NaN. Used by
// `compare_platform_versions` per dotted segment.
fn parse_leading_int(segment: &str) -> Option<i64> {
    let digits: String = segment.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse().ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::PlatformEndianness;
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
    fn compare_platform_versions_orders_numerically() {
        // Identical strings and two empties compare equal.
        assert_eq!(
            compare_platform_versions("10.15.7", "10.15.7"),
            Ordering::Equal
        );
        assert_eq!(compare_platform_versions("", ""), Ordering::Equal);
        // Empty string sorts lower than any version.
        assert_eq!(compare_platform_versions("", "1.0"), Ordering::Less);
        assert_eq!(compare_platform_versions("1.0", ""), Ordering::Greater);
        // a lower / a higher.
        assert_eq!(
            compare_platform_versions("10.15.6", "10.15.7"),
            Ordering::Less
        );
        assert_eq!(compare_platform_versions("9", "10"), Ordering::Less);
        assert_eq!(compare_platform_versions("10.0", "10.0.1"), Ordering::Less);
        assert_eq!(
            compare_platform_versions("10.15.7", "10.15.6"),
            Ordering::Greater
        );
        assert_eq!(compare_platform_versions("11", "10"), Ordering::Greater);
        assert_eq!(compare_platform_versions("14", "13.0.1"), Ordering::Greater);
        // Numeric, not lexicographic.
        assert_eq!(compare_platform_versions("10", "9"), Ordering::Greater);
        assert_eq!(compare_platform_versions("2.10", "2.9"), Ordering::Greater);
        // Missing trailing segments are treated as 0.
        assert_eq!(compare_platform_versions("10.0", "10.0.0"), Ordering::Equal);
        assert_eq!(compare_platform_versions("10", "10.0.0"), Ordering::Equal);
    }

    #[test]
    fn create_native_platform_backend_fills_out() {
        let backend = create_native_platform_backend();
        let mut out = create_platform_info();
        backend.get_info(&mut out);
        // The native backend reports a real arch and a non-unknown name on a known host.
        assert_eq!(out.arch, std::env::consts::ARCH);
        assert!(!out.is_touch);
        assert_ne!(out.name, PlatformName::Unknown);
        // The native default has no browser engine and declares no host shell.
        assert_eq!(out.engine, PlatformEngine::Unknown);
        assert_eq!(out.runtime, PlatformRuntime::Unknown);
        // Native test hosts are little-endian; pointer width is a known canonical value.
        assert_eq!(out.endianness, PlatformEndianness::Little);
        assert!(out.pointer_width == 32 || out.pointer_width == 64);
        // os_build / distro / distro_version stay empty until a host fills them.
        assert_eq!(out.os_build, "");
        assert_eq!(out.distro, "");
        assert_eq!(out.distro_version, "");
    }

    #[test]
    fn create_platform_info_is_zeroed() {
        let info = create_platform_info();
        assert_eq!(info.name, PlatformName::Unknown);
        assert_eq!(info.kind, PlatformKind::Unknown);
        assert_eq!(info.version, "");
        assert_eq!(info.arch, "");
        assert_eq!(info.locale, "");
        assert!(!info.is_touch);
        // New fields zero to their Unknown/empty/-1 sentinels.
        assert_eq!(info.engine, PlatformEngine::Unknown);
        assert_eq!(info.engine_version, "");
        assert_eq!(info.runtime, PlatformRuntime::Unknown);
        assert_eq!(info.endianness, PlatformEndianness::Unknown);
        assert_eq!(info.pointer_width, -1);
        assert_eq!(info.os_build, "");
        assert_eq!(info.distro, "");
        assert_eq!(info.distro_version, "");
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
    fn get_platform_engine_returns_active_backend_engine() {
        let _guard = TEST_LOCK.lock().unwrap();
        for engine in [
            PlatformEngine::Blink,
            PlatformEngine::Gecko,
            PlatformEngine::Webkit,
            PlatformEngine::Unknown,
        ] {
            let mut info = create_platform_info();
            info.engine = engine;
            set_platform_backend(Some(fake_backend(info)));
            assert_eq!(get_platform_engine(), engine);
        }
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
    fn get_platform_runtime_returns_active_backend_runtime() {
        let _guard = TEST_LOCK.lock().unwrap();
        for runtime in [
            PlatformRuntime::Web,
            PlatformRuntime::Electron,
            PlatformRuntime::Tauri,
            PlatformRuntime::Capacitor,
            PlatformRuntime::Native,
        ] {
            let mut info = create_platform_info();
            info.runtime = runtime;
            set_platform_backend(Some(fake_backend(info)));
            assert_eq!(get_platform_runtime(), runtime);
        }
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
    fn is_platform_native_true_for_host_shells_false_for_web_and_unknown() {
        let _guard = TEST_LOCK.lock().unwrap();
        for runtime in [
            PlatformRuntime::Electron,
            PlatformRuntime::Tauri,
            PlatformRuntime::Capacitor,
            PlatformRuntime::Native,
        ] {
            let mut info = create_platform_info();
            info.runtime = runtime;
            set_platform_backend(Some(fake_backend(info)));
            assert!(is_platform_native(), "{runtime:?} should be native");
        }
        for runtime in [PlatformRuntime::Web, PlatformRuntime::Unknown] {
            let mut info = create_platform_info();
            info.runtime = runtime;
            set_platform_backend(Some(fake_backend(info)));
            assert!(!is_platform_native(), "{runtime:?} should not be native");
        }
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
    fn is_platform_version_at_least_compares_live_version() {
        let _guard = TEST_LOCK.lock().unwrap();
        // Equals minimum / exceeds minimum.
        let mut at = create_platform_info();
        at.version = "14.0".to_string();
        set_platform_backend(Some(fake_backend(at)));
        assert!(is_platform_version_at_least("14.0"));
        let mut above = create_platform_info();
        above.version = "15.0".to_string();
        set_platform_backend(Some(fake_backend(above)));
        assert!(is_platform_version_at_least("14.0"));
        // Below minimum.
        let mut below = create_platform_info();
        below.version = "13.0".to_string();
        set_platform_backend(Some(fake_backend(below)));
        assert!(!is_platform_version_at_least("14.0"));
        // Empty (unknown) version is always false.
        let empty = create_platform_info();
        set_platform_backend(Some(fake_backend(empty)));
        assert!(!is_platform_version_at_least("1.0"));
        // Patch-level comparison.
        let mut patch = create_platform_info();
        patch.version = "10.15.7".to_string();
        set_platform_backend(Some(fake_backend(patch)));
        assert!(is_platform_version_at_least("10.15.6"));
        assert!(is_platform_version_at_least("10.15.7"));
        assert!(!is_platform_version_at_least("10.15.8"));
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
