//! Browser user-agent parsing to platform identity tokens (TS `userAgent.ts`). Pure functions over
//! the UA string and optional hints; no DOM, navigator or OS queries.

use flight_entity::{Record, Unknown, get_record_value};
use flight_platform::{
    PlatformEndianness, PlatformEngine, PlatformKind, PlatformName, PlatformRuntime,
};

use crate::js_pattern::*;
use crate::user_agent_parse::parse_user_agent_os_version;

/// Probes host CPU byte order with a local two-byte write-then-read (the source's
/// `Uint16Array`/`Uint8Array` view of one buffer): `Big` when the high byte comes first, `Little`
/// when the low byte does. The source's `Unknown` arm is for runtimes without ArrayBuffer, which
/// cannot occur here.
pub fn detect_endianness() -> PlatformEndianness {
    let bytes = 0x0102_u16.to_ne_bytes();
    if bytes[0] == 0x01 {
        return PlatformEndianness::Big;
    }
    if bytes[0] == 0x02 {
        return PlatformEndianness::Little;
    }
    return PlatformEndianness::Unknown;
}

/// JS `value?.[key]` for an `unknown` value: a property only of an object (a `Record<Unknown>`);
/// `undefined` (None) for absent, null and primitives.
fn get_property<'a>(value: Option<&'a Unknown>, key: &str) -> Option<&'a Unknown> {
    let record = value?.as_ref()?.downcast_ref::<Record<Unknown>>()?;
    return get_record_value(record, key);
}

/// `i[3-6]86`
fn i_x86(t: &[char]) -> bool {
    return positions(t, "i").into_iter().any(|at| {
        at + 3 < t.len() && ('3'..='6').contains(&t[at + 1]) && matches_at(t, at + 2, "86")
    });
}

// flight-lint: allow(f64) TS `number` values in an `unknown` slot arrive as f64; NaN and 0 are falsy as in JS
/// JS truthiness of an `unknown` property read: absent (undefined) and `None` (null) are falsy;
/// `false`, numeric zero or NaN, and the empty string are falsy; every other value (objects
/// included) is truthy.
fn is_truthy(value: Option<&Unknown>) -> bool {
    let Some(Some(value)) = value else {
        return false;
    };
    if let Some(b) = value.downcast_ref::<bool>() {
        return *b;
    }
    if let Some(s) = value.downcast_ref::<String>() {
        return !s.is_empty();
    }
    if let Some(s) = value.downcast_ref::<&'static str>() {
        return !s.is_empty();
    }
    if let Some(n) = value.downcast_ref::<f64>() {
        return *n != 0.0 && !n.is_nan();
    }
    if let Some(n) = value.downcast_ref::<f32>() {
        return *n != 0.0 && !n.is_nan();
    }
    if let Some(n) = value.downcast_ref::<i32>() {
        return *n != 0;
    }
    if let Some(n) = value.downcast_ref::<i64>() {
        return *n != 0;
    }
    if let Some(n) = value.downcast_ref::<u32>() {
        return *n != 0;
    }
    if let Some(n) = value.downcast_ref::<u64>() {
        return *n != 0;
    }
    return true;
}

/// Parses the canonical CPU architecture token from a UA string: "x64", "arm64", "x86", "arm",
/// "riscv64", "mips64", "mips", or "" when undetectable. A truthy `uad_platform` (the UA-CH
/// `navigator.userAgentData.platform` hint) is consulted first, case-folded as JS `toLowerCase`
/// does; `None` and `Some("")` both skip it, as an empty string is falsy in TS. arm64/aarch64 is
/// tested before arm.
pub fn parse_user_agent_arch(ua: &str, uad_platform: Option<&str>) -> String {
    if let Some(platform) = uad_platform.filter(|p| !p.is_empty()) {
        let p = platform.to_lowercase();
        if p.contains("arm") {
            return "arm64".to_string();
        }
        if p.contains("x86")
            || p.contains("windows")
            || p.contains("linux")
            || p.contains("mac")
            || p.contains("chrome")
        {
            return "x64".to_string();
        }
    }
    let t = chars_of(ua);
    let arch = if contains_any(&t, &["arm64", "aarch64"]) {
        "arm64"
    } else if contains(&t, "arm") {
        "arm"
    } else if contains_any(&t, &["x86_64", "win64", "wow64", "x64"]) {
        "x64"
    } else if i_x86(&t) || contains(&t, "x86") {
        "x86"
    } else if contains(&t, "riscv64") {
        "riscv64"
    } else if contains(&t, "mips64") {
        "mips64"
    } else if contains(&t, "mips") {
        "mips"
    } else {
        ""
    };
    return arch.to_string();
}

/// Parses the browser engine from a UA string. iOS/iPadOS decide first (every browser there runs on
/// the system WebKit); then Firefox (gecko); legacy EdgeHTML (`Edge/<digit>`) is `Unknown`, not
/// blink; then Chrome/Chromium/Edg/OPR/Samsung (blink); then Safari/WebKit; else `Unknown`.
pub fn parse_user_agent_engine(ua: &str) -> PlatformEngine {
    let t = chars_of(ua);
    if contains_any(&t, &["iphone", "ipad", "ipod"]) {
        return PlatformEngine::Webkit;
    }
    if contains(&t, "firefox") {
        return PlatformEngine::Gecko;
    }
    if positions(&t, "edge/")
        .into_iter()
        .any(|at| at + 5 < t.len() && t[at + 5].is_ascii_digit())
    {
        return PlatformEngine::Unknown;
    }
    if contains_any(&t, &["chrome", "chromium", "edg", "opr", "samsung"]) {
        return PlatformEngine::Blink;
    }
    if contains_any(&t, &["safari", "webkit"]) {
        return PlatformEngine::Webkit;
    }
    return PlatformEngine::Unknown;
}

/// Extracts the raw browser/engine version token for `engine` ("" when absent or `Unknown`): gecko
/// `Firefox/`; blink `Edg/`, then `OPR/`, then `Chrome/`; webkit `Version/`, then `AppleWebKit/`.
/// Never parsed for semantics.
pub fn parse_user_agent_engine_version(ua: &str, engine: PlatformEngine) -> String {
    let t = chars_of(ua);
    let version = match engine {
        PlatformEngine::Gecko => capture_after(&t, "firefox/", is_digit_or_dot),
        PlatformEngine::Blink => capture_after(&t, "edg/", is_digit_or_dot)
            .or_else(|| capture_after(&t, "opr/", is_digit_or_dot))
            .or_else(|| capture_after(&t, "chrome/", is_digit_or_dot)),
        PlatformEngine::Webkit => capture_after(&t, "version/", is_digit_or_dot)
            .or_else(|| capture_after(&t, "applewebkit/", is_digit_or_dot)),
        PlatformEngine::Unknown => None,
    };
    return version.unwrap_or_default();
}

/// The platform kind derived from a name: iOS and Android are `Mobile`; everything else is `Web`.
pub fn parse_user_agent_kind(name: PlatformName) -> PlatformKind {
    if name == PlatformName::Ios || name == PlatformName::Android {
        return PlatformKind::Mobile;
    }
    return PlatformKind::Web;
}

/// The platform name from a UA string, in source precedence (android, iOS devices, `win`, `mac`,
/// linux); `Web` when no known OS is detected.
pub fn parse_user_agent_name(ua: &str) -> PlatformName {
    let t = chars_of(ua);
    if contains(&t, "android") {
        return PlatformName::Android;
    }
    if contains_any(&t, &["iphone", "ipad", "ipod"]) {
        return PlatformName::Ios;
    }
    if contains(&t, "win") {
        return PlatformName::Windows;
    }
    if contains(&t, "mac") {
        return PlatformName::MacOs;
    }
    if contains(&t, "linux") {
        return PlatformName::Linux;
    }
    return PlatformName::Web;
}

/// Pointer width in bits from a canonical arch token: 64 for "x64"/"arm64", 32 for "x86"/"arm", -1
/// otherwise (TS `32 | 64 | -1`).
pub fn parse_user_agent_pointer_width(arch: &str) -> i32 {
    if arch == "x64" || arch == "arm64" {
        return 64;
    }
    if arch == "x86" || arch == "arm" {
        return 32;
    }
    return -1;
}

/// The host shell from browser-global probes on a window-like record (TS `Record<string, unknown>
/// | null | undefined`; `None` is null/undefined). `Unknown` for no window; `Electron` when
/// `process.versions.electron` is truthy; `Tauri` when `__TAURI__` is truthy; `Capacitor` when
/// `Capacitor` is truthy; else `Web`. Truthiness and property access follow JS (see `is_truthy`):
/// a nested object is a `Record<Unknown>` stored in the `Unknown`.
pub fn parse_user_agent_runtime(win: Option<&Record<Unknown>>) -> PlatformRuntime {
    let Some(win) = win else {
        return PlatformRuntime::Unknown;
    };
    let versions = get_property(get_record_value(win, "process"), "versions");
    if is_truthy(versions) && is_truthy(get_property(versions, "electron")) {
        return PlatformRuntime::Electron;
    }
    if is_truthy(get_record_value(win, "__TAURI__")) {
        return PlatformRuntime::Tauri;
    }
    if is_truthy(get_record_value(win, "Capacitor")) {
        return PlatformRuntime::Capacitor;
    }
    return PlatformRuntime::Web;
}

/// The raw dotted OS version for `name`: "" for `Linux` (no kernel version in a browser UA), for
/// the `Web` fallback, and when `name` is not the platform the UA describes; otherwise
/// `parse_user_agent_os_version`.
pub fn parse_user_agent_version(ua: &str, name: PlatformName) -> String {
    if name == PlatformName::Linux || name == PlatformName::Web {
        return String::new();
    }
    if parse_user_agent_name(ua) != name {
        return String::new();
    }
    return parse_user_agent_os_version(ua);
}
