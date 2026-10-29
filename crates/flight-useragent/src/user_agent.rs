//! Browser user-agent parsing to platform identity tokens (TS `userAgent.ts`). Pure functions over
//! the UA string and optional hints; no DOM, navigator or OS queries.

use crate::js_pattern::*;
use crate::user_agent_native::{
    PlatformEndianness, PlatformEngine, PlatformKind, PlatformName, PlatformRuntime, Record,
    Unknown, detect_endianness_native, parse_user_agent_runtime_native,
};
use crate::user_agent_parse::parse_user_agent_os_version;

/// Probes host CPU byte order with a local two-byte write-then-read (the source's
/// `Uint16Array`/`Uint8Array` view of one buffer): `Big` when the high byte comes first, `Little`
/// when the low byte does. The source's `Unknown` arm is for runtimes without ArrayBuffer, which
/// cannot occur here.
pub fn detect_endianness() -> PlatformEndianness {
    return detect_endianness_native();
}

/// `i[3-6]86`
fn i_x86(t: &[u16]) -> bool {
    for at in positions(t, "i") {
        if at + 3 < t.len() && (0x0033..=0x0036).contains(&t[at + 1]) && matches_at(t, at + 2, "86")
        {
            return true;
        }
    }
    return false;
}

/// Parses the canonical CPU architecture token from a UA string: "x64", "arm64", "x86", "arm",
/// "riscv64", "mips64", "mips", or "" when undetectable. A truthy `uad_platform` (the UA-CH
/// `navigator.userAgentData.platform` hint) is consulted first, case-folded as JS `toLowerCase`
/// does; `None` and `Some("")` both skip it, as an empty string is falsy in TS. arm64/aarch64 is
/// tested before arm.
pub fn parse_user_agent_arch(ua: &str, uad_platform: Option<&str>) -> String {
    if let Some(platform) = uad_platform {
        if !platform.is_empty() {
            let p = chars_of(platform);
            if contains(&p, "arm") {
                return "arm64".to_string();
            }
            if contains(&p, "x86")
                || contains(&p, "windows")
                || contains(&p, "linux")
                || contains(&p, "mac")
                || contains(&p, "chrome")
            {
                return "x64".to_string();
            }
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
        .any(|at| at + 5 < t.len() && is_ascii_digit(t[at + 5]))
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
    if engine == PlatformEngine::Gecko {
        let firefox = capture_after(&t, "firefox/", is_digit_or_dot);
        if let Some(value) = firefox {
            return value;
        }
        return String::new();
    }
    if engine == PlatformEngine::Blink {
        let edge = capture_after(&t, "edg/", is_digit_or_dot);
        if let Some(value) = edge {
            return value;
        }
        let opera = capture_after(&t, "opr/", is_digit_or_dot);
        if let Some(value) = opera {
            return value;
        }
        let chrome = capture_after(&t, "chrome/", is_digit_or_dot);
        if let Some(value) = chrome {
            return value;
        }
        return String::new();
    }
    if engine == PlatformEngine::Webkit {
        let version = capture_after(&t, "version/", is_digit_or_dot);
        if let Some(value) = version {
            return value;
        }
        let webkit = capture_after(&t, "applewebkit/", is_digit_or_dot);
        if let Some(value) = webkit {
            return value;
        }
    }
    return String::new();
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
    return parse_user_agent_runtime_native(win);
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
