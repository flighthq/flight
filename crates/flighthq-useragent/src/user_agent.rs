//! Port of `userAgent.ts` — platform-identity UA-string parsers.
//!
//! All functions are pure and side-effect-free. UA-string parsing is inherently
//! best-effort (browsers freeze and spoof UAs); these parsers target the most
//! common real-world patterns and are not exhaustive.

use std::sync::LazyLock;

use flighthq_types::{
    PlatformEndianness, PlatformEngine, PlatformKind, PlatformName, PlatformRuntime,
};
use regex::Regex;

/// Parse a browser user-agent string into the canonical CPU architecture token.
///
/// Canonical tokens: `"x64"`, `"arm64"`, `"x86"`, `"arm"`, `"riscv64"`, `"mips64"`,
/// `"mips"`. Returns `""` when undetectable.
///
/// `arm64`/`aarch64` must be tested before `arm` to avoid false-positive partial
/// matches. The high-entropy `navigator.userAgentData.architecture` API is async and
/// not used here; this operates on the synchronous UA string plus an optional UA-CH
/// platform hint.
///
/// `uad_platform`: pass `navigator.userAgentData.platform` (Chromium UA-CH) when
/// available — it gives cleaner arch detection than the UA string. `Windows`, `Linux`,
/// `macOS`, `Chrome OS` map to `x64` conservatively; Apple Silicon (M-series) is
/// indistinguishable from `x64` via this hint alone.
pub fn parse_user_agent_arch(ua: &str, uad_platform: Option<&str>) -> String {
    if let Some(platform) = uad_platform
        && !platform.is_empty()
    {
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
    if ARCH_ARM64.is_match(ua) {
        return "arm64".to_string();
    }
    if ARCH_ARM.is_match(ua) {
        return "arm".to_string();
    }
    if ARCH_X64.is_match(ua) {
        return "x64".to_string();
    }
    if ARCH_X86.is_match(ua) {
        return "x86".to_string();
    }
    if ARCH_RISCV64.is_match(ua) {
        return "riscv64".to_string();
    }
    if ARCH_MIPS64.is_match(ua) {
        return "mips64".to_string();
    }
    if ARCH_MIPS.is_match(ua) {
        return "mips".to_string();
    }
    String::new()
}

/// Parse a browser user-agent string into the canonical [`PlatformEngine`] token.
///
/// Order matters: Edg/Chrome UAs contain `Safari`; Firefox UAs do not contain
/// `Chrome`. Returns [`PlatformEngine::Unknown`] for unrecognized or native-host UAs.
pub fn parse_user_agent_engine(ua: &str) -> PlatformEngine {
    if ENGINE_GECKO.is_match(ua) {
        return PlatformEngine::Gecko;
    }
    if ENGINE_BLINK.is_match(ua) {
        return PlatformEngine::Blink;
    }
    if ENGINE_WEBKIT.is_match(ua) {
        return PlatformEngine::Webkit;
    }
    PlatformEngine::Unknown
}

/// Extract the browser/engine version string from a user-agent string.
///
/// The `engine` parameter narrows which version pattern to extract. Returns `""`
/// when the version is not present or the engine is [`PlatformEngine::Unknown`]. The
/// returned string is the raw version token — never parsed for semantics.
pub fn parse_user_agent_engine_version(ua: &str, engine: PlatformEngine) -> String {
    match engine {
        // 'Firefox/120.0' -> '120.0'
        PlatformEngine::Gecko => capture_first(&ENGINE_VERSION_FIREFOX, ua).unwrap_or_default(),
        PlatformEngine::Blink => {
            // Prefer Edg/OPR over Chrome for Edge/Opera UAs to surface the product version.
            if let Some(edg) = capture_first(&ENGINE_VERSION_EDG, ua) {
                return edg;
            }
            if let Some(opr) = capture_first(&ENGINE_VERSION_OPR, ua) {
                return opr;
            }
            capture_first(&ENGINE_VERSION_CHROME, ua).unwrap_or_default()
        }
        PlatformEngine::Webkit => {
            // 'Version/16.0' -> '16.0' for Safari; fall back to AppleWebKit/<version>.
            if let Some(ver) = capture_first(&ENGINE_VERSION_VERSION, ua) {
                return ver;
            }
            capture_first(&ENGINE_VERSION_WEBKIT, ua).unwrap_or_default()
        }
        PlatformEngine::Unknown => String::new(),
    }
}

/// Parse a browser user-agent string into the canonical [`PlatformKind`] token.
///
/// Derived from the platform name — mobile OSes yield [`PlatformKind::Mobile`];
/// everything else yields [`PlatformKind::Web`]. Use [`parse_user_agent_name`] to get
/// the name, then this function to derive the kind.
pub fn parse_user_agent_kind(name: PlatformName) -> PlatformKind {
    if name == PlatformName::Ios || name == PlatformName::Android {
        return PlatformKind::Mobile;
    }
    PlatformKind::Web
}

/// Parse a browser user-agent string into the canonical [`PlatformName`] token.
///
/// Returns [`PlatformName::Web`] when no known OS is detected (the web fallback).
pub fn parse_user_agent_name(ua: &str) -> PlatformName {
    if NAME_ANDROID.is_match(ua) {
        return PlatformName::Android;
    }
    if NAME_IOS.is_match(ua) {
        return PlatformName::Ios;
    }
    if NAME_WIN.is_match(ua) {
        return PlatformName::Windows;
    }
    if NAME_MAC.is_match(ua) {
        return PlatformName::Macos;
    }
    if NAME_LINUX.is_match(ua) {
        return PlatformName::Linux;
    }
    PlatformName::Web
}

/// Infer the native pointer width in bits from a canonical arch token.
///
/// Returns `64` for `"x64"`/`"arm64"`, `32` for `"x86"`/`"arm"`, `-1` when unknown
/// (e.g. `"wasm"` or `""`).
pub fn parse_user_agent_pointer_width(arch: &str) -> i32 {
    if arch == "x64" || arch == "arm64" {
        return 64;
    }
    if arch == "x86" || arch == "arm" {
        return 32;
    }
    -1
}

/// Infer the host shell / runtime environment from browser-global probes.
///
/// Returns [`PlatformRuntime::Unknown`] when the probe is `None` (SSR, no-DOM
/// contexts). On the web the source of truth is the JS `window` object; the TS
/// signature takes a `window`-like dict and reads `window.process?.versions?.electron`,
/// `window.__TAURI__`, and `window.Capacitor`. Rust has no JS window, so the host
/// passes a flattened [`UserAgentRuntimeProbe`] of those three signals instead.
/// Recorded as an intentional divergence in `rust/conformance.md`.
pub fn parse_user_agent_runtime(probe: Option<&UserAgentRuntimeProbe>) -> PlatformRuntime {
    let Some(probe) = probe else {
        return PlatformRuntime::Unknown;
    };
    // Electron: window.process?.versions?.electron is set in the renderer process.
    if probe.has_electron {
        return PlatformRuntime::Electron;
    }
    // Tauri: window.__TAURI__ is injected by the Tauri runtime.
    if probe.has_tauri {
        return PlatformRuntime::Tauri;
    }
    // Capacitor: window.Capacitor is set by the Capacitor bridge.
    if probe.has_capacitor {
        return PlatformRuntime::Capacitor;
    }
    PlatformRuntime::Web
}

/// Extract the OS version string from a browser user-agent string for the given
/// platform name.
///
/// Returns the raw dotted version string. Returns `""` when the version is not present
/// in the UA. Never parsed for semantics.
pub fn parse_user_agent_version(ua: &str, name: PlatformName) -> String {
    match name {
        // 'Windows NT 10.0' -> '10.0'
        PlatformName::Windows => capture_first(&VERSION_WINDOWS, ua).unwrap_or_default(),
        // 'Mac OS X 10_15_7' or 'Mac OS X 10.15.7' -> '10.15.7'
        PlatformName::Macos => capture_first(&VERSION_MACOS, ua)
            .map(|v| v.replace('_', "."))
            .unwrap_or_default(),
        // 'CPU OS 17_4_1' or 'CPU iPhone OS 17_4_1' -> '17.4.1'
        PlatformName::Ios => capture_first(&VERSION_IOS, ua)
            .map(|v| v.replace('_', "."))
            .unwrap_or_default(),
        // 'Android 14' -> '14'
        PlatformName::Android => capture_first(&VERSION_ANDROID, ua).unwrap_or_default(),
        // Linux does not embed a kernel version in the browser UA string.
        PlatformName::Linux | PlatformName::Web | PlatformName::Unknown => String::new(),
    }
}

/// Probe host CPU byte order.
///
/// In the browser, TS probes a `DataView` write-then-read. Native Rust knows its target
/// byte order at compile time, so this resolves directly from
/// [`cfg!(target_endian = ...)`]. Overwhelmingly [`PlatformEndianness::Little`] on all
/// modern hardware. Recorded as an intentional divergence in `rust/conformance.md`.
pub fn probe_endianness() -> PlatformEndianness {
    #[cfg(target_endian = "little")]
    {
        PlatformEndianness::Little
    }
    #[cfg(target_endian = "big")]
    {
        PlatformEndianness::Big
    }
}

/// Flattened host signals for [`parse_user_agent_runtime`] — the Rust stand-in for the
/// JS `window` object the TS function inspects.
#[derive(Copy, Clone, PartialEq, Eq, Debug, Default)]
pub struct UserAgentRuntimeProbe {
    /// `window.process?.versions?.electron` is set (Electron renderer process).
    pub has_electron: bool,
    /// `window.__TAURI__` is injected by the Tauri runtime.
    pub has_tauri: bool,
    /// `window.Capacitor` is set by the Capacitor bridge.
    pub has_capacitor: bool,
}

/// Returns the first capture group of `re` against `haystack`, owned, or `None`.
fn capture_first(re: &Regex, haystack: &str) -> Option<String> {
    re.captures(haystack).map(|c| c[1].to_string())
}

static ARCH_ARM64: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)arm64|aarch64").unwrap());
static ARCH_ARM: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)arm").unwrap());
static ARCH_X64: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)x86_64|win64|wow64|x64").unwrap());
static ARCH_X86: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)i[3-6]86|x86").unwrap());
static ARCH_RISCV64: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)riscv64").unwrap());
static ARCH_MIPS64: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)mips64").unwrap());
static ARCH_MIPS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)mips").unwrap());

static ENGINE_GECKO: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)firefox").unwrap());
static ENGINE_BLINK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)chrome|chromium|edg|opr|samsung").unwrap());
static ENGINE_WEBKIT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)safari|webkit").unwrap());

static ENGINE_VERSION_FIREFOX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)firefox/([\d.]+)").unwrap());
static ENGINE_VERSION_EDG: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)edg/([\d.]+)").unwrap());
static ENGINE_VERSION_OPR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)opr/([\d.]+)").unwrap());
static ENGINE_VERSION_CHROME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)chrome/([\d.]+)").unwrap());
static ENGINE_VERSION_VERSION: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)version/([\d.]+)").unwrap());
static ENGINE_VERSION_WEBKIT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)applewebkit/([\d.]+)").unwrap());

static NAME_ANDROID: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)android").unwrap());
static NAME_IOS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)iphone|ipad|ipod").unwrap());
static NAME_WIN: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)win").unwrap());
static NAME_MAC: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)mac").unwrap());
static NAME_LINUX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)linux").unwrap());

static VERSION_WINDOWS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)windows nt ([\d.]+)").unwrap());
static VERSION_MACOS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)mac os x ([\d_.]+)").unwrap());
static VERSION_IOS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)cpu(?: iphone)? os ([\d_]+)").unwrap());
static VERSION_ANDROID: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)android ([\d.]+)").unwrap());

#[cfg(test)]
mod tests {
    use super::*;

    mod parse_user_agent_arch {
        use super::*;

        #[test]
        fn detects_arm64_from_aarch64_token() {
            assert_eq!(
                parse_user_agent_arch("Mozilla/5.0 (Linux; aarch64) AppleWebKit/537.36", None),
                "arm64"
            );
        }

        #[test]
        fn detects_arm64_from_arm64_token() {
            assert_eq!(
                parse_user_agent_arch("Mozilla/5.0 (iPhone; CPU arm64)", None),
                "arm64"
            );
        }

        #[test]
        fn detects_x64_from_win64_token() {
            assert_eq!(
                parse_user_agent_arch(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    None
                ),
                "x64"
            );
        }

        #[test]
        fn detects_x64_from_wow64_token() {
            assert_eq!(
                parse_user_agent_arch(
                    "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36",
                    None
                ),
                "x64"
            );
        }

        #[test]
        fn detects_x64_from_x86_64_token() {
            assert_eq!(
                parse_user_agent_arch("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36", None),
                "x64"
            );
        }

        #[test]
        fn detects_x86_from_i686_token() {
            assert_eq!(
                parse_user_agent_arch("Mozilla/5.0 (X11; Linux i686; rv:109.0)", None),
                "x86"
            );
        }

        #[test]
        fn arm_does_not_fire_on_plain_arm_token() {
            assert_eq!(
                parse_user_agent_arch("Mozilla/5.0 (Linux; armv7l)", None),
                "arm"
            );
        }

        #[test]
        fn detects_riscv64_mips64_and_mips_tokens() {
            assert_eq!(
                parse_user_agent_arch("Mozilla/5.0 (Linux; riscv64)", None),
                "riscv64"
            );
            assert_eq!(
                parse_user_agent_arch("Mozilla/5.0 (Linux; mips64)", None),
                "mips64"
            );
            assert_eq!(
                parse_user_agent_arch("Mozilla/5.0 (Linux; mips)", None),
                "mips"
            );
        }

        #[test]
        fn prefers_the_ua_ch_platform_hint_over_the_ua_string() {
            assert_eq!(parse_user_agent_arch("", Some("arm")), "arm64");
            assert_eq!(parse_user_agent_arch("", Some("Windows")), "x64");
            assert_eq!(parse_user_agent_arch("", Some("macOS")), "x64");
            assert_eq!(parse_user_agent_arch("", Some("Linux")), "x64");
            assert_eq!(parse_user_agent_arch("", Some("Chrome OS")), "x64");
        }

        #[test]
        fn falls_back_to_the_ua_string_when_the_platform_hint_is_inconclusive() {
            assert_eq!(
                parse_user_agent_arch(
                    "Mozilla/5.0 (X11; Linux x86_64)",
                    Some("SomeCustomPlatform")
                ),
                "x64"
            );
        }

        #[test]
        fn returns_empty_string_when_arch_is_undetectable() {
            assert_eq!(
                parse_user_agent_arch("Mozilla/5.0 (X11; Linux) AppleWebKit/537.36", None),
                ""
            );
            assert_eq!(parse_user_agent_arch("SomeCustomBrowser/1.0", None), "");
        }
    }

    mod parse_user_agent_engine {
        use super::*;

        #[test]
        fn returns_gecko_for_firefox() {
            assert_eq!(
                parse_user_agent_engine(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0"
                ),
                PlatformEngine::Gecko
            );
        }

        #[test]
        fn returns_blink_for_chrome() {
            assert_eq!(
                parse_user_agent_engine(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                ),
                PlatformEngine::Blink
            );
        }

        #[test]
        fn returns_blink_for_edge() {
            assert_eq!(
                parse_user_agent_engine(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.133"
                ),
                PlatformEngine::Blink
            );
        }

        #[test]
        fn returns_webkit_for_safari() {
            assert_eq!(
                parse_user_agent_engine(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15"
                ),
                PlatformEngine::Webkit
            );
        }

        #[test]
        fn returns_unknown_for_unrecognized_ua() {
            assert_eq!(parse_user_agent_engine(""), PlatformEngine::Unknown);
            assert_eq!(
                parse_user_agent_engine("CustomBot/1.0"),
                PlatformEngine::Unknown
            );
        }
    }

    mod parse_user_agent_engine_version {
        use super::*;

        #[test]
        fn extracts_firefox_version() {
            assert_eq!(
                parse_user_agent_engine_version(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
                    PlatformEngine::Gecko
                ),
                "120.0"
            );
        }

        #[test]
        fn extracts_chrome_version() {
            assert_eq!(
                parse_user_agent_engine_version(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.109 Safari/537.36",
                    PlatformEngine::Blink
                ),
                "120.0.6099.109"
            );
        }

        #[test]
        fn extracts_edge_version_edg_priority() {
            assert_eq!(
                parse_user_agent_engine_version(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.133",
                    PlatformEngine::Blink
                ),
                "120.0.2210.133"
            );
        }

        #[test]
        fn extracts_safari_version_token() {
            assert_eq!(
                parse_user_agent_engine_version(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15",
                    PlatformEngine::Webkit
                ),
                "16.0"
            );
        }

        #[test]
        fn returns_empty_string_for_unknown_engine() {
            assert_eq!(
                parse_user_agent_engine_version("any UA string", PlatformEngine::Unknown),
                ""
            );
        }

        #[test]
        fn returns_empty_string_when_version_is_absent() {
            assert_eq!(
                parse_user_agent_engine_version("", PlatformEngine::Gecko),
                ""
            );
        }
    }

    mod parse_user_agent_kind {
        use super::*;

        #[test]
        fn returns_mobile_for_ios() {
            assert_eq!(
                parse_user_agent_kind(PlatformName::Ios),
                PlatformKind::Mobile
            );
        }

        #[test]
        fn returns_mobile_for_android() {
            assert_eq!(
                parse_user_agent_kind(PlatformName::Android),
                PlatformKind::Mobile
            );
        }

        #[test]
        fn returns_web_for_desktop_names() {
            assert_eq!(
                parse_user_agent_kind(PlatformName::Windows),
                PlatformKind::Web
            );
            assert_eq!(
                parse_user_agent_kind(PlatformName::Macos),
                PlatformKind::Web
            );
            assert_eq!(
                parse_user_agent_kind(PlatformName::Linux),
                PlatformKind::Web
            );
        }

        #[test]
        fn returns_web_for_unknown() {
            assert_eq!(
                parse_user_agent_kind(PlatformName::Unknown),
                PlatformKind::Web
            );
        }
    }

    mod parse_user_agent_name {
        use super::*;

        #[test]
        fn detects_android() {
            assert_eq!(
                parse_user_agent_name("Mozilla/5.0 (Linux; Android 14; Pixel 8)"),
                PlatformName::Android
            );
        }

        #[test]
        fn detects_ios_from_iphone() {
            assert_eq!(
                parse_user_agent_name("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X)"),
                PlatformName::Ios
            );
        }

        #[test]
        fn detects_ios_from_ipad() {
            assert_eq!(
                parse_user_agent_name("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"),
                PlatformName::Ios
            );
        }

        #[test]
        fn detects_windows() {
            assert_eq!(
                parse_user_agent_name("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"),
                PlatformName::Windows
            );
        }

        #[test]
        fn detects_macos() {
            assert_eq!(
                parse_user_agent_name("Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)"),
                PlatformName::Macos
            );
        }

        #[test]
        fn detects_linux() {
            assert_eq!(
                parse_user_agent_name("Mozilla/5.0 (X11; Linux x86_64)"),
                PlatformName::Linux
            );
        }

        #[test]
        fn returns_web_when_no_os_is_detected() {
            assert_eq!(parse_user_agent_name(""), PlatformName::Web);
            assert_eq!(parse_user_agent_name("CustomBot/1.0"), PlatformName::Web);
        }
    }

    mod parse_user_agent_pointer_width {
        use super::*;

        #[test]
        fn returns_64_for_x64() {
            assert_eq!(parse_user_agent_pointer_width("x64"), 64);
        }

        #[test]
        fn returns_64_for_arm64() {
            assert_eq!(parse_user_agent_pointer_width("arm64"), 64);
        }

        #[test]
        fn returns_32_for_x86() {
            assert_eq!(parse_user_agent_pointer_width("x86"), 32);
        }

        #[test]
        fn returns_32_for_arm() {
            assert_eq!(parse_user_agent_pointer_width("arm"), 32);
        }

        #[test]
        fn returns_minus_1_for_wasm() {
            assert_eq!(parse_user_agent_pointer_width("wasm"), -1);
        }

        #[test]
        fn returns_minus_1_for_empty_string() {
            assert_eq!(parse_user_agent_pointer_width(""), -1);
        }
    }

    mod parse_user_agent_runtime {
        use super::*;

        #[test]
        fn returns_unknown_when_probe_is_none() {
            assert_eq!(parse_user_agent_runtime(None), PlatformRuntime::Unknown);
        }

        #[test]
        fn returns_web_when_no_host_shell_globals_are_present() {
            assert_eq!(
                parse_user_agent_runtime(Some(&UserAgentRuntimeProbe::default())),
                PlatformRuntime::Web
            );
        }

        #[test]
        fn returns_electron_when_electron_is_present() {
            let probe = UserAgentRuntimeProbe {
                has_electron: true,
                ..Default::default()
            };
            assert_eq!(
                parse_user_agent_runtime(Some(&probe)),
                PlatformRuntime::Electron
            );
        }

        #[test]
        fn returns_tauri_when_tauri_is_present() {
            let probe = UserAgentRuntimeProbe {
                has_tauri: true,
                ..Default::default()
            };
            assert_eq!(
                parse_user_agent_runtime(Some(&probe)),
                PlatformRuntime::Tauri
            );
        }

        #[test]
        fn returns_capacitor_when_capacitor_is_present() {
            let probe = UserAgentRuntimeProbe {
                has_capacitor: true,
                ..Default::default()
            };
            assert_eq!(
                parse_user_agent_runtime(Some(&probe)),
                PlatformRuntime::Capacitor
            );
        }

        #[test]
        fn prioritizes_electron_over_tauri_when_both_globals_are_present() {
            let probe = UserAgentRuntimeProbe {
                has_electron: true,
                has_tauri: true,
                ..Default::default()
            };
            assert_eq!(
                parse_user_agent_runtime(Some(&probe)),
                PlatformRuntime::Electron
            );
        }
    }

    mod parse_user_agent_version {
        use super::*;

        #[test]
        fn parses_windows_nt_version() {
            assert_eq!(
                parse_user_agent_version(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                    PlatformName::Windows
                ),
                "10.0"
            );
        }

        #[test]
        fn parses_macos_version_with_underscore_separators() {
            assert_eq!(
                parse_user_agent_version(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
                    PlatformName::Macos
                ),
                "10.15.7"
            );
        }

        #[test]
        fn parses_macos_version_with_dot_separators() {
            assert_eq!(
                parse_user_agent_version(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15.7)",
                    PlatformName::Macos
                ),
                "10.15.7"
            );
        }

        #[test]
        fn parses_ios_version() {
            assert_eq!(
                parse_user_agent_version(
                    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X)",
                    PlatformName::Ios
                ),
                "17.4.1"
            );
        }

        #[test]
        fn parses_ios_version_without_iphone_token() {
            assert_eq!(
                parse_user_agent_version(
                    "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)",
                    PlatformName::Ios
                ),
                "17.0"
            );
        }

        #[test]
        fn parses_android_version() {
            assert_eq!(
                parse_user_agent_version(
                    "Mozilla/5.0 (Linux; Android 14; Pixel 8)",
                    PlatformName::Android
                ),
                "14"
            );
        }

        #[test]
        fn returns_empty_string_for_linux() {
            assert_eq!(
                parse_user_agent_version("Mozilla/5.0 (X11; Linux x86_64)", PlatformName::Linux),
                ""
            );
        }

        #[test]
        fn returns_empty_string_for_unknown_name() {
            assert_eq!(
                parse_user_agent_version("any UA", PlatformName::Unknown),
                ""
            );
        }

        #[test]
        fn returns_empty_string_when_version_is_absent() {
            assert_eq!(parse_user_agent_version("", PlatformName::Windows), "");
        }
    }

    mod probe_endianness {
        use super::*;

        #[test]
        fn returns_a_known_canonical_value() {
            let e = probe_endianness();
            assert!(matches!(
                e,
                PlatformEndianness::Little | PlatformEndianness::Big | PlatformEndianness::Unknown
            ));
        }

        #[test]
        fn returns_little_on_typical_hosts() {
            // Test hosts run on x64/arm64 hardware which is little-endian.
            assert_eq!(probe_endianness(), PlatformEndianness::Little);
        }
    }
}
