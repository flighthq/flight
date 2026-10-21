use flight_entity::allocate_entity;

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::Arc;

    use super::*;

    /// A provider reporting a fully populated native macOS desktop snapshot.
    fn host() -> HostPlatformCapability {
        return HostPlatformCapability {
            provider: Arc::new(()),
            get_info: Arc::new(|out: &mut PlatformInfo| {
                out.name = PlatformName::MacOs;
                out.kind = PlatformKind::Desktop;
                out.version = "14.2".to_string();
                out.arch = "arm64".to_string();
                out.is_touch = true;
                out.runtime = PlatformRuntime::Tauri;
                out.engine = PlatformEngine::Webkit;
                out.pointer_width = 64;
            }),
        };
    }

    #[test]
    fn host_platform_capability_engine_matches_get_platform_engine() {
        let c = host();
        assert_eq!(c.engine(), get_platform_engine(&c));
        assert_eq!(c.engine(), PlatformEngine::Webkit);
    }

    #[test]
    fn host_platform_capability_info_matches_get_platform_info() {
        let c = host();
        let (mut a, mut b) = (create_platform_info(), create_platform_info());
        c.info(&mut a);
        get_platform_info(&mut b, &c);
        assert_eq!(a, b);
        assert_eq!(a.pointer_width, 64);
    }

    #[test]
    fn host_platform_capability_is_desktop_matches_is_platform_desktop() {
        let c = host();
        assert_eq!(c.is_desktop(), is_platform_desktop(&c));
        assert!(c.is_desktop());
    }

    #[test]
    fn host_platform_capability_is_mobile_matches_is_platform_mobile() {
        let c = host();
        assert_eq!(c.is_mobile(), is_platform_mobile(&c));
        assert!(!c.is_mobile());
    }

    #[test]
    fn host_platform_capability_is_native_matches_is_platform_native() {
        let c = host();
        assert_eq!(c.is_native(), is_platform_native(&c));
        assert!(c.is_native());
    }

    #[test]
    fn host_platform_capability_is_touch_matches_is_platform_touch() {
        let c = host();
        assert_eq!(c.is_touch(), is_platform_touch(&c));
        assert!(c.is_touch());
    }

    #[test]
    fn host_platform_capability_is_version_at_least_matches_is_platform_version_at_least() {
        let c = host();
        assert_eq!(
            c.is_version_at_least("14.1"),
            is_platform_version_at_least(&c, "14.1")
        );
        assert!(c.is_version_at_least("14.1"));
        assert!(!c.is_version_at_least("14.10"));
    }

    #[test]
    fn host_platform_capability_is_web_matches_is_platform_web() {
        let c = host();
        assert_eq!(c.is_web(), is_platform_web(&c));
        assert!(!c.is_web());
    }

    #[test]
    fn host_platform_capability_kind_matches_get_platform_kind() {
        let c = host();
        assert_eq!(c.kind(), get_platform_kind(&c));
        assert_eq!(c.kind(), PlatformKind::Desktop);
    }

    #[test]
    fn host_platform_capability_name_matches_get_platform_name() {
        let c = host();
        assert_eq!(c.name(), get_platform_name(&c));
        assert_eq!(c.name(), PlatformName::MacOs);
    }

    #[test]
    fn host_platform_capability_runtime_matches_get_platform_runtime() {
        let c = host();
        assert_eq!(c.runtime(), get_platform_runtime(&c));
        assert_eq!(c.runtime(), PlatformRuntime::Tauri);
    }

    #[test]
    fn platform_info_new_matches_create_platform_info() {
        assert_eq!(PlatformInfo::new(), create_platform_info());
        assert_eq!(PlatformInfo::new().pointer_width, -1);
    }
}

pub fn create_platform_info() -> PlatformInfo {
    let mut out: PlatformInfo = allocate_entity();
    initialize_platform_info(&mut out);
    return out;
}

/// The zeroed snapshot: empty strings, `Unknown` enums, not touch, pointer width -1.
pub fn initialize_platform_info(out: &mut PlatformInfo) {
    out.arch = String::new();
    out.distro = String::new();
    out.distro_version = String::new();
    out.endianness = PlatformEndianness::Unknown;
    out.engine = PlatformEngine::Unknown;
    out.engine_version = String::new();
    out.is_touch = false;
    out.kind = PlatformKind::Unknown;
    out.locale = String::new();
    out.name = PlatformName::Unknown;
    out.os_build = String::new();
    out.pointer_width = -1;
    out.runtime = PlatformRuntime::Unknown;
    out.version = String::new();
}

/// Compares two dotted version strings numerically, segment by segment: -1, 0 or 1. Each segment is
/// read as JS `parseInt(segment, 10)` reads it (leading whitespace, optional sign, the leading digit
/// run; trailing junk ignored), and a segment with no leading digits counts as 0, as does a missing
/// trailing segment. "" has no segments, so it sorts lowest; "" against "" is 0.
pub fn compare_platform_versions(a: &str, b: &str) -> i32 {
    if a == b {
        return 0;
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
        let a_num = if i < a_parts.len() {
            parse_js_int(a_parts[i])
        } else {
            Some(0.0)
        };
        let b_num = if i < b_parts.len() {
            parse_js_int(b_parts[i])
        } else {
            Some(0.0)
        };
        let a_n = a_num.unwrap_or(0.0);
        let b_n = b_num.unwrap_or(0.0);
        if a_n < b_n {
            return -1;
        }
        if a_n > b_n {
            return 1;
        }
    }
    return 0;
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS PlatformEndianness string union; the TS package exports no get_/parse_ free functions
pub fn get_platform_endianness_string(value: PlatformEndianness) -> &'static str {
    return match value {
        PlatformEndianness::Big => "big",
        PlatformEndianness::Little => "little",
        PlatformEndianness::Unknown => "unknown",
    };
}

/// The browser rendering engine; `Unknown` on native hosts. A fresh read through the provider.
pub fn get_platform_engine(host_platform: &HostPlatformCapability) -> PlatformEngine {
    return read_platform_info(host_platform).engine;
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS PlatformEngine string union; the TS package exports no get_/parse_ free functions
pub fn get_platform_engine_string(value: PlatformEngine) -> &'static str {
    return match value {
        PlatformEngine::Gecko => "gecko",
        PlatformEngine::Blink => "blink",
        PlatformEngine::Webkit => "webkit",
        PlatformEngine::Unknown => "unknown",
    };
}

/// Fills `out` with the running platform's identity through the supplied provider.
// flight-lint: allow(conform-params) D9b: TS takes `out` last and returns it; Rust takes `out` first and returns nothing
pub fn get_platform_info(out: &mut PlatformInfo, host_platform: &HostPlatformCapability) {
    (host_platform.get_info)(out);
}

pub fn get_platform_kind(host_platform: &HostPlatformCapability) -> PlatformKind {
    return read_platform_info(host_platform).kind;
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS PlatformKind string union; the TS package exports no get_/parse_ free functions
pub fn get_platform_kind_string(value: PlatformKind) -> &'static str {
    return match value {
        PlatformKind::Desktop => "desktop",
        PlatformKind::Mobile => "mobile",
        PlatformKind::Web => "web",
        PlatformKind::Unknown => "unknown",
    };
}

pub fn get_platform_name(host_platform: &HostPlatformCapability) -> PlatformName {
    return read_platform_info(host_platform).name;
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS PlatformName string union; the TS package exports no get_/parse_ free functions
pub fn get_platform_name_string(value: PlatformName) -> &'static str {
    return match value {
        PlatformName::Web => "web",
        PlatformName::Windows => "windows",
        PlatformName::MacOs => "macos",
        PlatformName::Linux => "linux",
        PlatformName::Ios => "ios",
        PlatformName::Android => "android",
        PlatformName::Unknown => "unknown",
    };
}

/// The host shell / runtime environment; distinguishes plain web from a host shell.
pub fn get_platform_runtime(host_platform: &HostPlatformCapability) -> PlatformRuntime {
    return read_platform_info(host_platform).runtime;
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS PlatformRuntime string union; the TS package exports no get_/parse_ free functions
pub fn get_platform_runtime_string(value: PlatformRuntime) -> &'static str {
    return match value {
        PlatformRuntime::Web => "web",
        PlatformRuntime::Electron => "electron",
        PlatformRuntime::Tauri => "tauri",
        PlatformRuntime::Capacitor => "capacitor",
        PlatformRuntime::Native => "native",
        PlatformRuntime::Unknown => "unknown",
    };
}

pub fn is_platform_desktop(host_platform: &HostPlatformCapability) -> bool {
    return get_platform_kind(host_platform) == PlatformKind::Desktop;
}

pub fn is_platform_mobile(host_platform: &HostPlatformCapability) -> bool {
    return get_platform_kind(host_platform) == PlatformKind::Mobile;
}

/// True inside a host shell (Electron, Tauri, Capacitor, native): any runtime other than `Web` and
/// `Unknown`.
pub fn is_platform_native(host_platform: &HostPlatformCapability) -> bool {
    let runtime = get_platform_runtime(host_platform);
    return runtime != PlatformRuntime::Web && runtime != PlatformRuntime::Unknown;
}

pub fn is_platform_touch(host_platform: &HostPlatformCapability) -> bool {
    return read_platform_info(host_platform).is_touch;
}

/// True when the platform's OS version is at or above `minimum`; false when the version is ""
/// (unknown). Numeric, segment-wise (see `compare_platform_versions`).
pub fn is_platform_version_at_least(host_platform: &HostPlatformCapability, minimum: &str) -> bool {
    let version = read_platform_info(host_platform).version;
    if version.is_empty() {
        return false;
    }
    return compare_platform_versions(&version, minimum) >= 0;
}

pub fn is_platform_web(host_platform: &HostPlatformCapability) -> bool {
    return get_platform_kind(host_platform) == PlatformKind::Web;
}

/// JS `parseInt(segment, 10)`: skips leading whitespace, takes an optional sign and the leading run
/// of ASCII digits (trailing junk is ignored), and returns None (NaN) when there are no digits. The
/// digit run is converted as a correctly rounded f64, as JS converts it.
// flight-lint: allow(f64) JS parseInt yields an IEEE double; segments beyond 2^53 must round and compare exactly as the source does
fn parse_js_int(segment: &str) -> Option<f64> {
    let trimmed = segment.trim_start_matches(|c: char| c.is_whitespace() || c == '\u{FEFF}');
    let (negative, rest) = match trimmed.as_bytes().first() {
        Some(b'-') => (true, &trimmed[1..]),
        Some(b'+') => (false, &trimmed[1..]),
        _ => (false, trimmed),
    };
    let digits_len = rest.bytes().take_while(|b| b.is_ascii_digit()).count();
    if digits_len == 0 {
        return None;
    }
    let value: f64 = rest[..digits_len].parse().ok()?;
    return Some(if negative { -value } else { value });
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS PlatformEndianness string union; the TS package exports no get_/parse_ free functions
pub fn parse_platform_endianness(value: &str) -> Option<PlatformEndianness> {
    return match value {
        "big" => Some(PlatformEndianness::Big),
        "little" => Some(PlatformEndianness::Little),
        "unknown" => Some(PlatformEndianness::Unknown),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS PlatformEngine string union; the TS package exports no get_/parse_ free functions
pub fn parse_platform_engine(value: &str) -> Option<PlatformEngine> {
    return match value {
        "gecko" => Some(PlatformEngine::Gecko),
        "blink" => Some(PlatformEngine::Blink),
        "webkit" => Some(PlatformEngine::Webkit),
        "unknown" => Some(PlatformEngine::Unknown),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS PlatformKind string union; the TS package exports no get_/parse_ free functions
pub fn parse_platform_kind(value: &str) -> Option<PlatformKind> {
    return match value {
        "desktop" => Some(PlatformKind::Desktop),
        "mobile" => Some(PlatformKind::Mobile),
        "web" => Some(PlatformKind::Web),
        "unknown" => Some(PlatformKind::Unknown),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS PlatformName string union; the TS package exports no get_/parse_ free functions
pub fn parse_platform_name(value: &str) -> Option<PlatformName> {
    return match value {
        "web" => Some(PlatformName::Web),
        "windows" => Some(PlatformName::Windows),
        "macos" => Some(PlatformName::MacOs),
        "linux" => Some(PlatformName::Linux),
        "ios" => Some(PlatformName::Ios),
        "android" => Some(PlatformName::Android),
        "unknown" => Some(PlatformName::Unknown),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS PlatformRuntime string union; the TS package exports no get_/parse_ free functions
pub fn parse_platform_runtime(value: &str) -> Option<PlatformRuntime> {
    return match value {
        "web" => Some(PlatformRuntime::Web),
        "electron" => Some(PlatformRuntime::Electron),
        "tauri" => Some(PlatformRuntime::Tauri),
        "capacitor" => Some(PlatformRuntime::Capacitor),
        "native" => Some(PlatformRuntime::Native),
        "unknown" => Some(PlatformRuntime::Unknown),
        _ => None,
    };
}

/// One fresh snapshot read through the provider, replacing the source's module scratch object with
/// per-call local state.
fn read_platform_info(host_platform: &HostPlatformCapability) -> PlatformInfo {
    let mut info = create_platform_info();
    (host_platform.get_info)(&mut info);
    return info;
}

impl HostPlatformCapability {
    pub fn engine(&self) -> PlatformEngine {
        return get_platform_engine(self);
    }

    pub fn info(&self, out: &mut PlatformInfo) {
        get_platform_info(out, self);
    }

    pub fn is_desktop(&self) -> bool {
        return is_platform_desktop(self);
    }

    pub fn is_mobile(&self) -> bool {
        return is_platform_mobile(self);
    }

    pub fn is_native(&self) -> bool {
        return is_platform_native(self);
    }

    pub fn is_touch(&self) -> bool {
        return is_platform_touch(self);
    }

    pub fn is_version_at_least(&self, minimum: &str) -> bool {
        return is_platform_version_at_least(self, minimum);
    }

    pub fn is_web(&self) -> bool {
        return is_platform_web(self);
    }

    pub fn kind(&self) -> PlatformKind {
        return get_platform_kind(self);
    }

    pub fn name(&self) -> PlatformName {
        return get_platform_name(self);
    }

    pub fn runtime(&self) -> PlatformRuntime {
        return get_platform_runtime(self);
    }
}

impl PlatformInfo {
    pub fn new() -> Self {
        return create_platform_info();
    }
}
