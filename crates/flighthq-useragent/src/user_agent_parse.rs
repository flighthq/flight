//! Port of `userAgentParse.ts` — device-identity UA-string parsers.
//!
//! All functions are pure and side-effect-free — no DOM access, no globals, no state.
//! Used by the device web backend; importable independently for testing or custom
//! backends.
//!
//! UA string parsing is inherently best-effort. Browsers freeze and spoof UAs
//! regularly. These parsers target the most common real-world patterns; they are not
//! exhaustive.

use std::sync::LazyLock;

use flighthq_types::{
    DEVICE_FORM_FACTOR_CAR, DEVICE_FORM_FACTOR_DESKTOP, DEVICE_FORM_FACTOR_PHONE,
    DEVICE_FORM_FACTOR_TABLET, DEVICE_FORM_FACTOR_TV, DEVICE_FORM_FACTOR_UNKNOWN,
    DEVICE_FORM_FACTOR_WATCH, DeviceFormFactor,
};
use regex::Regex;

/// Parses a device form factor from a user-agent string and optional touch-point hint.
///
/// Returns a [`DeviceFormFactor`] constant. Never returns `""` — falls back to
/// [`DEVICE_FORM_FACTOR_UNKNOWN`]. `max_touch_points`: pass `navigator.maxTouchPoints`
/// when available; `-1` when unavailable.
pub fn parse_user_agent_form_factor(ua: &str, max_touch_points: i32) -> DeviceFormFactor {
    // Automotive / in-vehicle
    if FORM_FACTOR_CAR.is_match(ua) {
        return DEVICE_FORM_FACTOR_CAR.to_string();
    }
    // Smart TV / set-top box
    if FORM_FACTOR_TV.is_match(ua) {
        return DEVICE_FORM_FACTOR_TV.to_string();
    }
    // Wearable / watch
    if FORM_FACTOR_WATCH.is_match(ua) {
        return DEVICE_FORM_FACTOR_WATCH.to_string();
    }
    // Tablet: iPad explicitly; Android without 'Mobile' in UA; Windows tablet
    if FORM_FACTOR_IPAD.is_match(ua) {
        return DEVICE_FORM_FACTOR_TABLET.to_string();
    }
    if FORM_FACTOR_ANDROID.is_match(ua) && !FORM_FACTOR_MOBILE.is_match(ua) {
        return DEVICE_FORM_FACTOR_TABLET.to_string();
    }
    if FORM_FACTOR_TABLET.is_match(ua) {
        return DEVICE_FORM_FACTOR_TABLET.to_string();
    }
    // Phone: known mobile UA tokens
    if FORM_FACTOR_PHONE.is_match(ua) {
        return DEVICE_FORM_FACTOR_PHONE.to_string();
    }
    // Desktop: known desktop OS tokens. `linux(?!.*android)` is a negative-lookahead in
    // the TS regex (unsupported by the `regex` crate), ported as an explicit guard:
    // a Linux UA only counts as desktop when it does not also carry an `android` token.
    if FORM_FACTOR_DESKTOP.is_match(ua)
        || (FORM_FACTOR_LINUX.is_match(ua) && !FORM_FACTOR_ANDROID.is_match(ua))
    {
        return DEVICE_FORM_FACTOR_DESKTOP.to_string();
    }
    // Weak desktop signal: no touch points when the UA is otherwise inconclusive
    if max_touch_points == 0 {
        return DEVICE_FORM_FACTOR_DESKTOP.to_string();
    }
    DEVICE_FORM_FACTOR_UNKNOWN.to_string()
}

/// Parses an OS name from a user-agent string.
///
/// Returns a canonical OS name or `""` when unknown. Common return values: `Android`,
/// `iOS`, `iPadOS`, `Windows`, `macOS`, `Linux`, `ChromeOS`, `FreeBSD`, `OpenBSD`,
/// `NetBSD`.
pub fn parse_user_agent_os_name(ua: &str) -> String {
    if OS_NAME_ANDROID.is_match(ua) {
        return "Android".to_string();
    }
    if OS_NAME_IPAD.is_match(ua) {
        return "iPadOS".to_string();
    }
    if OS_NAME_IOS.is_match(ua) {
        return "iOS".to_string();
    }
    if OS_NAME_CROS.is_match(ua) {
        return "ChromeOS".to_string();
    }
    if OS_NAME_WINDOWS.is_match(ua) {
        return "Windows".to_string();
    }
    if OS_NAME_MACOS.is_match(ua) {
        return "macOS".to_string();
    }
    if OS_NAME_FREEBSD.is_match(ua) {
        return "FreeBSD".to_string();
    }
    if OS_NAME_OPENBSD.is_match(ua) {
        return "OpenBSD".to_string();
    }
    if OS_NAME_NETBSD.is_match(ua) {
        return "NetBSD".to_string();
    }
    if OS_NAME_LINUX.is_match(ua) {
        return "Linux".to_string();
    }
    String::new()
}

/// Parses an OS version string from a user-agent string.
///
/// Returns a dotted version string, e.g. `"14.0"`, `"10.0"`, `"13.5.1"`. Returns `""`
/// when not found.
pub fn parse_user_agent_os_version(ua: &str) -> String {
    // Android: "Android 14.0" or "Android 9"
    if let Some(v) = capture_first(&OS_VERSION_ANDROID, ua) {
        return v;
    }
    // iOS/iPadOS: "iPhone OS 17_0_1" or "CPU OS 16_0"
    if let Some(v) = capture_first(&OS_VERSION_IOS, ua) {
        return v.replace('_', ".");
    }
    // Windows: "Windows NT 10.0" -> "10.0"
    if let Some(v) = capture_first(&OS_VERSION_WINDOWS, ua) {
        return v;
    }
    // macOS: "Mac OS X 10_15_7" -> "10.15.7" or "Mac OS X 13.0"
    if let Some(v) = capture_first(&OS_VERSION_MACOS, ua) {
        return v.replace('_', ".");
    }
    // ChromeOS: "CrOS x86_64 14541.0.0"
    if let Some(v) = capture_first(&OS_VERSION_CROS, ua) {
        return v;
    }
    String::new()
}

/// Returns the first capture group of `re` against `haystack`, owned, or `None`.
fn capture_first(re: &Regex, haystack: &str) -> Option<String> {
    re.captures(haystack).map(|c| c[1].to_string())
}

static FORM_FACTOR_CAR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)android auto|car browser|automotive").unwrap());
static FORM_FACTOR_TV: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)smart[-_]?tv|smarttv|googletv|appletv|hbbtv|netcast|webos.*tv|tizen.*tv|tv safari",
    )
    .unwrap()
});
static FORM_FACTOR_WATCH: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)watch\s*os|watch[_ ]?kit|wearable").unwrap());
static FORM_FACTOR_IPAD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)ipad").unwrap());
static FORM_FACTOR_ANDROID: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)android").unwrap());
static FORM_FACTOR_MOBILE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)mobile").unwrap());
static FORM_FACTOR_TABLET: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)tablet\s*pc|silk|kindle fire").unwrap());
static FORM_FACTOR_PHONE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)iphone|ipod|android.*mobile|windows phone|blackberry|bb\d+|mobile safari")
        .unwrap()
});
static FORM_FACTOR_DESKTOP: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)win(?:dows)?nt|macintosh|mac os x|x11").unwrap());
static FORM_FACTOR_LINUX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)linux").unwrap());

static OS_NAME_ANDROID: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)android").unwrap());
static OS_NAME_IPAD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)ipad").unwrap());
static OS_NAME_IOS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)iphone|ipod").unwrap());
static OS_NAME_CROS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)cros").unwrap());
static OS_NAME_WINDOWS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)windows nt|windows phone").unwrap());
static OS_NAME_MACOS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)macintosh|mac os x").unwrap());
static OS_NAME_FREEBSD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)freebsd").unwrap());
static OS_NAME_OPENBSD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)openbsd").unwrap());
static OS_NAME_NETBSD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)netbsd").unwrap());
static OS_NAME_LINUX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)linux").unwrap());

static OS_VERSION_ANDROID: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)android\s+([\d.]+)").unwrap());
static OS_VERSION_IOS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)(?:iphone|ipad|ipod).*?os\s+([\d_]+)").unwrap());
static OS_VERSION_WINDOWS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)windows nt\s+([\d.]+)").unwrap());
static OS_VERSION_MACOS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)mac os x\s+([\d_.]+)").unwrap());
static OS_VERSION_CROS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)cros\s+\S+\s+([\d.]+)").unwrap());

#[cfg(test)]
mod tests {
    use super::*;

    mod parse_user_agent_form_factor {
        use super::*;

        #[test]
        fn returns_car_for_android_auto_ua() {
            assert_eq!(
                parse_user_agent_form_factor("Android Auto", -1),
                DEVICE_FORM_FACTOR_CAR
            );
        }

        #[test]
        fn returns_tv_for_smart_tv_uas() {
            assert_eq!(
                parse_user_agent_form_factor("Mozilla/5.0 (SmartTV; Linux)", -1),
                DEVICE_FORM_FACTOR_TV
            );
            assert_eq!(
                parse_user_agent_form_factor("Mozilla/5.0 (SMART-TV; LINUX)", -1),
                DEVICE_FORM_FACTOR_TV
            );
            assert_eq!(
                parse_user_agent_form_factor("Dalvik/2.1.0 (Linux; Android; GoogleTV)", -1),
                DEVICE_FORM_FACTOR_TV
            );
        }

        #[test]
        fn returns_watch_for_watchos_ua() {
            assert_eq!(
                parse_user_agent_form_factor("Mozilla/5.0 (Watch OS 10.0)", -1),
                DEVICE_FORM_FACTOR_WATCH
            );
            assert_eq!(
                parse_user_agent_form_factor("wearable/1.0", -1),
                DEVICE_FORM_FACTOR_WATCH
            );
        }

        #[test]
        fn returns_tablet_for_ipad_ua() {
            assert_eq!(
                parse_user_agent_form_factor("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", 5),
                DEVICE_FORM_FACTOR_TABLET
            );
        }

        #[test]
        fn returns_tablet_for_android_tablet_ua() {
            assert_eq!(
                parse_user_agent_form_factor(
                    "Mozilla/5.0 (Linux; Android 13; SM-T870) AppleWebKit/537.36",
                    5
                ),
                DEVICE_FORM_FACTOR_TABLET
            );
        }

        #[test]
        fn returns_phone_for_iphone_ua() {
            assert_eq!(
                parse_user_agent_form_factor(
                    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
                    5
                ),
                DEVICE_FORM_FACTOR_PHONE
            );
        }

        #[test]
        fn returns_phone_for_android_mobile_ua() {
            assert_eq!(
                parse_user_agent_form_factor(
                    "Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36",
                    5
                ),
                DEVICE_FORM_FACTOR_PHONE
            );
        }

        #[test]
        fn returns_desktop_for_windows_ua() {
            assert_eq!(
                parse_user_agent_form_factor(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    0
                ),
                DEVICE_FORM_FACTOR_DESKTOP
            );
        }

        #[test]
        fn returns_desktop_for_macos_ua() {
            assert_eq!(
                parse_user_agent_form_factor(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36",
                    0
                ),
                DEVICE_FORM_FACTOR_DESKTOP
            );
        }

        #[test]
        fn returns_desktop_when_max_touch_points_is_0_and_ua_inconclusive() {
            assert_eq!(
                parse_user_agent_form_factor("SomeBrowser/1.0", 0),
                DEVICE_FORM_FACTOR_DESKTOP
            );
        }

        #[test]
        fn returns_unknown_for_empty_ua_with_touch_points_available() {
            assert_eq!(
                parse_user_agent_form_factor("", -1),
                DEVICE_FORM_FACTOR_UNKNOWN
            );
        }
    }

    mod parse_user_agent_os_name {
        use super::*;

        #[test]
        fn returns_android_for_android_ua() {
            assert_eq!(
                parse_user_agent_os_name("Mozilla/5.0 (Linux; Android 14; Pixel 8)"),
                "Android"
            );
        }

        #[test]
        fn returns_ipados_for_ipad_ua() {
            assert_eq!(
                parse_user_agent_os_name("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"),
                "iPadOS"
            );
        }

        #[test]
        fn returns_ios_for_iphone_ipod_ua() {
            assert_eq!(
                parse_user_agent_os_name("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"),
                "iOS"
            );
            assert_eq!(
                parse_user_agent_os_name(
                    "Mozilla/5.0 (iPod touch; CPU iPhone OS 16_0 like Mac OS X)"
                ),
                "iOS"
            );
        }

        #[test]
        fn returns_windows_for_windows_ua() {
            assert_eq!(
                parse_user_agent_os_name("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"),
                "Windows"
            );
        }

        #[test]
        fn returns_macos_for_macintosh_ua() {
            assert_eq!(
                parse_user_agent_os_name("Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)"),
                "macOS"
            );
        }

        #[test]
        fn returns_chromeos_for_cros_ua() {
            assert_eq!(
                parse_user_agent_os_name("Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)"),
                "ChromeOS"
            );
        }

        #[test]
        fn returns_linux_for_linux_ua() {
            assert_eq!(
                parse_user_agent_os_name("Mozilla/5.0 (X11; Linux x86_64)"),
                "Linux"
            );
        }

        #[test]
        fn returns_freebsd_for_freebsd_ua() {
            assert_eq!(
                parse_user_agent_os_name("Mozilla/5.0 (X11; FreeBSD amd64)"),
                "FreeBSD"
            );
        }

        #[test]
        fn returns_empty_string_for_unknown_ua() {
            assert_eq!(parse_user_agent_os_name(""), "");
            assert_eq!(parse_user_agent_os_name("CustomBot/1.0"), "");
        }
    }

    mod parse_user_agent_os_version {
        use super::*;

        #[test]
        fn parses_android_version() {
            assert_eq!(
                parse_user_agent_os_version("Mozilla/5.0 (Linux; Android 14.0; Pixel)"),
                "14.0"
            );
            assert_eq!(
                parse_user_agent_os_version("Mozilla/5.0 (Linux; Android 9; SM-G950F)"),
                "9"
            );
        }

        #[test]
        fn parses_ios_version_with_underscore_notation() {
            assert_eq!(
                parse_user_agent_os_version(
                    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0_1 like Mac OS X)"
                ),
                "17.0.1"
            );
            assert_eq!(
                parse_user_agent_os_version("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)"),
                "16.0"
            );
        }

        #[test]
        fn parses_windows_nt_version() {
            assert_eq!(
                parse_user_agent_os_version("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"),
                "10.0"
            );
            assert_eq!(
                parse_user_agent_os_version("Mozilla/5.0 (Windows NT 6.1; WOW64)"),
                "6.1"
            );
        }

        #[test]
        fn parses_macos_version_with_underscore_and_dot_notation() {
            assert_eq!(
                parse_user_agent_os_version("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"),
                "10.15.7"
            );
            assert_eq!(
                parse_user_agent_os_version("Mozilla/5.0 (Macintosh; Intel Mac OS X 13.0)"),
                "13.0"
            );
        }

        #[test]
        fn parses_chromeos_version() {
            assert_eq!(
                parse_user_agent_os_version("Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)"),
                "14541.0.0"
            );
        }

        #[test]
        fn returns_empty_string_for_unknown_ua() {
            assert_eq!(parse_user_agent_os_version(""), "");
            assert_eq!(parse_user_agent_os_version("CustomBot/1.0"), "");
        }
    }
}
